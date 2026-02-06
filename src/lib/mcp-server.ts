import { createServer } from "node:http";
import type { ProcessManager } from "./process-manager.ts";
import type { McpConfig } from "./types.ts";

export async function startMcpServer(config: McpConfig, manager: ProcessManager) {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
  const z = await import("zod");

  const mcp = new McpServer({ name: "kern", version: "1.0.0" });

  mcp.tool("list_processes", "List all managed processes with status", () => {
    const states = manager.getAllStates();
    const result = states.map((s) => ({
      name: s.config.name,
      status: s.status,
      pid: s.pid,
      exitCode: s.exitCode,
    }));
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  mcp.tool(
    "get_logs",
    "Get logs for a process by name",
    { name: z.string(), tail: z.number().optional() },
    (args) => {
      const states = manager.getAllStates();
      const idx = states.findIndex(
        (s) => s.config.name.toLowerCase() === args.name.toLowerCase(),
      );
      if (idx === -1) {
        return {
          content: [{ type: "text" as const, text: `Process "${args.name}" not found` }],
          isError: true,
        };
      }
      let logs = manager.getLogs(idx);
      if (args.tail) logs = logs.slice(-args.tail);
      const text = logs.map((l) => `[${l.stream}] ${l.text}`).join("\n");
      return { content: [{ type: "text" as const, text: text || "(no logs)" }] };
    },
  );

  mcp.tool(
    "search_logs",
    "Search logs for a process by pattern",
    { name: z.string(), query: z.string() },
    (args) => {
      const states = manager.getAllStates();
      const idx = states.findIndex(
        (s) => s.config.name.toLowerCase() === args.name.toLowerCase(),
      );
      if (idx === -1) {
        return {
          content: [{ type: "text" as const, text: `Process "${args.name}" not found` }],
          isError: true,
        };
      }
      const matches = manager.searchLogs(idx, args.query);
      const text = matches.map((l) => `[${l.stream}] ${l.text}`).join("\n");
      return {
        content: [{ type: "text" as const, text: text || "(no matches)" }],
      };
    },
  );

  mcp.tool(
    "restart_process",
    "Restart a process by name",
    { name: z.string() },
    async (args) => {
      const states = manager.getAllStates();
      const idx = states.findIndex(
        (s) => s.config.name.toLowerCase() === args.name.toLowerCase(),
      );
      if (idx === -1) {
        return {
          content: [{ type: "text" as const, text: `Process "${args.name}" not found` }],
          isError: true,
        };
      }
      await manager.restart(idx);
      return {
        content: [{ type: "text" as const, text: `Restarted "${args.name}"` }],
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
