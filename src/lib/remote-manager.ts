import type { ProcessState, LogLine, KernConfig } from "./types.ts";
import type {
  ServerMessage,
  ClientMessage,
  SerializedProcessState,
} from "./ws-protocol.ts";

export interface RemoteManagerCallbacks {
  onChange: () => void;
  onDisconnect: (reason: string) => void;
}

export class RemoteManager {
  private ws: WebSocket;
  private states: ProcessState[] = [];
  private callbacks: RemoteManagerCallbacks;
  private historyReceived: Set<number> = new Set();
  private pendingLogs: Map<number, LogLine[]> = new Map();
  private _config: KernConfig | null = null;
  private _sessionId: string = "";

  constructor(url: string, callbacks: RemoteManagerCallbacks) {
    this.callbacks = callbacks;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.callbacks.onDisconnect("Connection closed");
    };

    this.ws.onerror = () => {
      this.callbacks.onDisconnect("Connection error");
    };
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "init":
        this._config = msg.config;
        this._sessionId = msg.sessionId;
        this.states = msg.processes.map((p: SerializedProcessState) => ({
          config: { name: p.name, command: "" },
          status: p.status,
          logs: [],
          exitCode: p.exitCode,
          pid: p.pid,
        }));
        // Request full log history for each process
        for (let i = 0; i < msg.processes.length; i++) {
          this.send({ type: "requestLogs", index: i });
        }
        this.callbacks.onChange();
        break;

      case "logHistory": {
        this.states[msg.index]!.logs = msg.logs;
        this.historyReceived.add(msg.index);
        // Flush any incremental logs that arrived before history
        const pending = this.pendingLogs.get(msg.index);
        if (pending && pending.length > 0) {
          this.states[msg.index]!.logs.push(...pending);
          this.pendingLogs.delete(msg.index);
        }
        this.callbacks.onChange();
        break;
      }

      case "log": {
        if (!this.historyReceived.has(msg.index)) {
          // Buffer incremental logs until history arrives
          if (!this.pendingLogs.has(msg.index)) {
            this.pendingLogs.set(msg.index, []);
          }
          this.pendingLogs.get(msg.index)!.push(...msg.lines);
        } else {
          this.states[msg.index]!.logs.push(...msg.lines);
        }
        this.callbacks.onChange();
        break;
      }

      case "status": {
        const state = this.states[msg.index];
        if (state) {
          state.status = msg.status;
          state.exitCode = msg.exitCode;
          state.pid = msg.pid;
        }
        this.callbacks.onChange();
        break;
      }

      case "logClear": {
        if (this.states[msg.index]) {
          this.states[msg.index]!.logs = [];
          this.historyReceived.delete(msg.index);
          this.pendingLogs.delete(msg.index);
        }
        this.callbacks.onChange();
        break;
      }

      case "shutdown":
        this.callbacks.onDisconnect(msg.reason);
        break;
    }
  }

  private send(msg: ClientMessage) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get config(): KernConfig | null {
    return this._config;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  getAllStates(): ProcessState[] {
    return this.states;
  }

  getLogs(index: number): LogLine[] {
    return this.states[index]?.logs ?? [];
  }

  getLogText(index: number): string {
    return this.getLogs(index)
      .map((l) => l.text)
      .join("\n");
  }

  restart(index: number) {
    this.send({ type: "restart", index });
  }

  stop(index: number) {
    this.send({ type: "stop", index });
  }

  stopAll() {
    this.send({ type: "stopAll" });
  }

  shutdownDaemon() {
    this.send({ type: "shutdownDaemon" });
  }

  close() {
    this.ws.close();
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
