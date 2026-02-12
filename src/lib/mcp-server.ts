import { createServer } from "node:http";
import type { ProcessManager } from "./process-manager.ts";
import type { McpConfig, LogLine } from "./types.ts";
import { stripAnsi } from "./ansi.ts";

function formatLog(l: LogLine): string {
  const ts = new Date(l.timestamp).toISOString();
  const text = stripAnsi(l.text);
  return `[${ts}] [${l.stream}] ${text}`;
}

function findProcessIndex(manager: ProcessManager, name: string): number {
  const states = manager.getAllStates();
  return states.findIndex(
    (s) => s.config.name.toLowerCase() === name.toLowerCase(),
  );
}

function processNotFound(name: string) {
  return {
    content: [{ type: "text" as const, text: `Process "${name}" not found` }],
    isError: true,
  };
}

export async function startMcpServer(config: McpConfig, manager: ProcessManager) {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
  const z = await import("zod");

  const mcp = new McpServer({ name: "kern", version: "1.0.0" });

  // --- List all processes ---
  mcp.tool("list_processes", "List all managed processes with their status, PID, and exit code", () => {
    const states = manager.getAllStates();
    const result = states.map((s) => ({
      name: s.config.name,
      status: s.status,
      pid: s.pid,
      exitCode: s.exitCode,
    }));
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // --- Get logs (with tail support) ---
  mcp.tool(
    "get_logs",
    "Get logs for a process. Use 'tail' to get only the last N lines (recommended for large logs). Each line includes ISO timestamp and stream (stdout/stderr).",
    { name: z.string().describe("Process name"), tail: z.number().optional().describe("Return only the last N log lines") },
    (args) => {
      const idx = findProcessIndex(manager, args.name);
      if (idx === -1) return processNotFound(args.name);

      let logs = manager.getLogs(idx);
      if (args.tail) logs = logs.slice(-args.tail);
      const text = logs.map(formatLog).join("\n");
      return { content: [{ type: "text" as const, text: text || "(no logs)" }] };
    },
  );

  // --- Search logs with regex ---
  mcp.tool(
    "search_logs",
    "Search process logs using a regex pattern (or plain text). Returns matching lines with timestamps. ANSI codes are stripped before matching.",
    { name: z.string().describe("Process name"), query: z.string().describe("Regex pattern or plain text to search for") },
    (args) => {
      const idx = findProcessIndex(manager, args.name);
      if (idx === -1) return processNotFound(args.name);

      const matches = manager.searchLogs(idx, args.query);
      const text = matches.map(formatLog).join("\n");
      return {
        content: [{ type: "text" as const, text: text || "(no matches)" }],
      };
    },
  );

  // --- Get logs between timestamps ---
  mcp.tool(
    "get_logs_between",
    "Get logs for a process within a time range. Timestamps are ISO 8601 strings (e.g. '2025-01-15T10:30:00Z') or Unix epoch milliseconds.",
    {
      name: z.string().describe("Process name"),
      from: z.union([z.string(), z.number()]).describe("Start time (ISO 8601 string or Unix epoch ms)"),
      to: z.union([z.string(), z.number()]).optional().describe("End time (ISO 8601 string or Unix epoch ms). Defaults to now."),
    },
    (args) => {
      const idx = findProcessIndex(manager, args.name);
      if (idx === -1) return processNotFound(args.name);

      const fromMs = typeof args.from === "number" ? args.from : new Date(args.from).getTime();
      const toMs = args.to
        ? typeof args.to === "number" ? args.to : new Date(args.to).getTime()
        : Date.now();

      if (isNaN(fromMs) || isNaN(toMs)) {
        return {
          content: [{ type: "text" as const, text: "Invalid timestamp format. Use ISO 8601 (e.g. '2025-01-15T10:30:00Z') or Unix epoch ms." }],
          isError: true,
        };
      }

      const logs = manager.getLogs(idx).filter((l) => l.timestamp >= fromMs && l.timestamp <= toMs);
      const text = logs.map(formatLog).join("\n");
      return { content: [{ type: "text" as const, text: text || "(no logs in range)" }] };
    },
  );

  // --- Restart process ---
  mcp.tool(
    "restart_process",
    "Restart a process by name. Stops the process (with graceful shutdown), clears its logs, and starts it again.",
    { name: z.string().describe("Process name") },
    async (args) => {
      const idx = findProcessIndex(manager, args.name);
      if (idx === -1) return processNotFound(args.name);

      await manager.restart(idx);
      return {
        content: [{ type: "text" as const, text: `Restarted "${args.name}"` }],
      };
    },
  );

  // --- Start process ---
  mcp.tool(
    "start_process",
    "Start a stopped or crashed process by name.",
    { name: z.string().describe("Process name") },
    async (args) => {
      const idx = findProcessIndex(manager, args.name);
      if (idx === -1) return processNotFound(args.name);

      const state = manager.getAllStates()[idx]!;
      if (state.status === "running" || state.status === "starting") {
        return {
          content: [{ type: "text" as const, text: `Process "${args.name}" is already running` }],
        };
      }

      await manager.start(idx);
      return {
        content: [{ type: "text" as const, text: `Started "${args.name}"` }],
      };
    },
  );

  // --- Stop process ---
  mcp.tool(
    "stop_process",
    "Stop a running process by name. Sends SIGTERM, then SIGKILL after 3 seconds if still running.",
    { name: z.string().describe("Process name") },
    async (args) => {
      const idx = findProcessIndex(manager, args.name);
      if (idx === -1) return processNotFound(args.name);

      const state = manager.getAllStates()[idx]!;
      if (state.status !== "running" && state.status !== "starting") {
        return {
          content: [{ type: "text" as const, text: `Process "${args.name}" is not running (status: ${state.status})` }],
        };
      }

      await manager.stop(idx);
      return {
        content: [{ type: "text" as const, text: `Stopped "${args.name}"` }],
      };
    },
  );

  const port = config.port ?? 3100;
  const transports = new Map<string, InstanceType<typeof SSEServerTransport>>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);

    if (url.pathname === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);
      transport.onclose = () => transports.delete(transport.sessionId);
      await mcp.connect(transport);
      await transport.start();
    } else if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        res.writeHead(400);
        res.end("Unknown session");
        return;
      }
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", async () => {
        try {
          await transport.handlePostMessage(req, res, JSON.parse(body));
        } catch {
          res.writeHead(400);
          res.end("Invalid message");
        }
      });
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  httpServer.listen(port, "127.0.0.1");

  return {
    close: () => {
      for (const t of transports.values()) t.close();
      httpServer.close();
    },
    port,
  };
}
