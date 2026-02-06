import type { KernConfig, ProcessConfig, ProcessState, ProcessStatus, LogLine } from "./types.ts";
import type { ProcessManagerEvents } from "./ws-protocol.ts";
import { execSync } from "child_process";

const MAX_LOG_LINES = 10_000;

/** Recursively kill a process and all its descendants */
function killTree(pid: number, signal: NodeJS.Signals) {
  // Kill children first (depth-first), then the process itself
  try {
    const out = execSync(`pgrep -P ${pid} .`, { encoding: "utf-8", timeout: 1000 });
    for (const line of out.trim().split("\n")) {
      const childPid = parseInt(line, 10);
      if (childPid > 0) killTree(childPid, signal);
    }
  } catch {
    // No children or pgrep failed
  }
  try { process.kill(pid, signal); } catch {}
}

export class ProcessManager {
  private config: KernConfig;
  private states: ProcessState[];
  private procs: (Bun.Subprocess | null)[];
  private onChange: () => void;
  private events: ProcessManagerEvents;
  private batchPending = false;

  constructor(config: KernConfig, onChange: () => void, events?: ProcessManagerEvents) {
    this.config = config;
    this.onChange = onChange;
    this.events = events ?? {};
    this.states = config.processes.map((processConfig) => ({
      config: processConfig,
      status: "stopped",
      logs: [],
      exitCode: null,
      pid: null,
    }));
    this.procs = config.processes.map(() => null);
  }

  private notify() {
    if (this.batchPending) return;
    this.batchPending = true;
    queueMicrotask(() => {
      this.batchPending = false;
      this.onChange();
    });
  }

  private appendLog(index: number, stream: "stdout" | "stderr", text: string) {
    const state = this.states[index]!;
    const newLines: LogLine[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      if (line === "") continue;
      const logLine: LogLine = { timestamp: Date.now(), stream, text: line };
      state.logs.push(logLine);
      newLines.push(logLine);
    }
    if (state.logs.length > MAX_LOG_LINES) {
      state.logs = state.logs.slice(-MAX_LOG_LINES);
    }
    if (newLines.length > 0) {
      this.events.onLog?.(index, newLines);
    }
    this.notify();
  }

  private async streamOutput(
    index: number,
    readable: ReadableStream<Uint8Array> | null,
    stream: "stdout" | "stderr",
  ) {
    if (!readable) return;
    const reader = readable.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line !== "") this.appendLog(index, stream, line);
        }
      }
      if (buffer) this.appendLog(index, stream, buffer);
    } catch {
      // Process killed, stream closed
    }
  }

  private setStatus(index: number, status: ProcessStatus) {
    const state = this.states[index]!;
    state.status = status;
    this.events.onStatusChange?.(index, status, state.exitCode, state.pid);
    this.notify();
  }

  private buildCommand(processConfig: ProcessConfig): string {
    const { parent } = this.config;
    if (!parent || processConfig.noParent) {
      return processConfig.command;
    }
    return parent
      .replace(/\{\{\s*name\s*\}\}/g, processConfig.name)
      .replace(/\{\{\s*command\s*\}\}/g, processConfig.command)
      .replace(/\{\{\s*cwd\s*\}\}/g, processConfig.cwd ?? ".");
  }

  private async startProcess(index: number) {
    const state = this.states[index]!;
    const config = state.config;
    const command = this.buildCommand(config);

    this.setStatus(index, "starting");

    let proc: Bun.Subprocess;
    try {
      proc = Bun.spawn(["sh", "-c", command], {
        cwd: config.cwd,
        env: { ...process.env, ...config.env },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.appendLog(index, "stderr", `Failed to start: ${msg}`);
      this.setStatus(index, "crashed");
      return;
    }

    this.procs[index] = proc;
    state.pid = proc.pid;
    this.setStatus(index, "running");

    this.streamOutput(index, proc.stdout as ReadableStream<Uint8Array> | null, "stdout");
    this.streamOutput(index, proc.stderr as ReadableStream<Uint8Array> | null, "stderr");

    proc.exited.then((code) => {
      state.exitCode = code;
      // Only update status if the process exited on its own (not via stop())
      if (state.status === "running" || state.status === "starting") {
        state.pid = null;
        this.setStatus(index, code === 0 ? "stopped" : "crashed");
      }
      if (this.procs[index] === proc) {
        this.procs[index] = null;
      }
    });
  }

  async startAll() {
    for (let i = 0; i < this.states.length; i++) {
      await this.startProcess(i);
    }
  }

  async stop(index: number) {
    const proc = this.procs[index];
    if (!proc) return;

    const state = this.states[index]!;
    this.procs[index] = null;

    this.setStatus(index, "stopping");

    // Kill entire process tree (children first, then parent)
    killTree(proc.pid, "SIGTERM");

    // Give processes time to exit gracefully, then force kill the tree
    const timeout = setTimeout(() => {
      killTree(proc.pid, "SIGKILL");
    }, 3000);
    await proc.exited;
    clearTimeout(timeout);

    state.pid = null;
    this.setStatus(index, "stopped");
  }

  async restart(index: number) {
    await this.stop(index);
    this.states[index]!.logs = [];
    this.states[index]!.exitCode = null;
    this.events.onLogClear?.(index);
    await this.startProcess(index);
  }

  async stopAll() {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < this.states.length; i++) {
      const order = this.states[i]!.config.shutdownOrder ?? Infinity;
      if (!groups.has(order)) groups.set(order, []);
      groups.get(order)!.push(i);
    }
    const sortedOrders = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const order of sortedOrders) {
      await Promise.all(groups.get(order)!.map((i) => this.stop(i)));
    }
  }

  forceKillAll() {
    for (let i = 0; i < this.procs.length; i++) {
      const proc = this.procs[i];
      if (!proc) continue;
      killTree(proc.pid, "SIGKILL");
      this.procs[i] = null;
      this.states[i]!.pid = null;
      this.states[i]!.status = "stopped";
    }
    this.notify();
  }

  getLogs(index: number): LogLine[] {
    return this.states[index]?.logs ?? [];
  }

  getLogText(index: number): string {
    return this.getLogs(index)
      .map((l) => l.text)
      .join("\n");
  }

  getAllStates(): ProcessState[] {
    return this.states;
  }

  searchLogs(index: number, query: string): LogLine[] {
    const logs = this.getLogs(index);
    try {
      const re = new RegExp(query, "i");
      return logs.filter((l) => re.test(l.text));
    } catch {
      return logs.filter((l) => l.text.includes(query));
    }
  }
}
