import type { Server, ServerWebSocket } from "bun";
import type { ProcessManager } from "./process-manager.ts";
import type { KernConfig } from "./types.ts";
import type {
  ServerMessage,
  ClientMessage,
  ProcessManagerEvents,
  SerializedProcessState,
} from "./ws-protocol.ts";

interface WsData {
  id: number;
}

export interface WsServer {
  port: number;
  events: ProcessManagerEvents;
  close: () => void;
}

export function createWsServer(
  config: KernConfig,
  sessionId: string,
  getManager: () => ProcessManager | null,
): WsServer {
  const clients = new Set<ServerWebSocket<WsData>>();
  let clientId = 0;

  function broadcast(msg: ServerMessage) {
    const json = JSON.stringify(msg);
    for (const ws of clients) {
      ws.send(json);
    }
  }

  function serializeProcesses(manager: ProcessManager): SerializedProcessState[] {
    return manager.getAllStates().map((s) => ({
      name: s.config.name,
      status: s.status,
      exitCode: s.exitCode,
      pid: s.pid,
      logCount: s.logs.length,
    }));
  }

  const server: Server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0, // random available port
    fetch(req, server) {
      if (server.upgrade(req, { data: { id: ++clientId } })) {
        return;
      }
      return new Response("kern headless", { status: 200 });
    },
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        clients.add(ws);
        const manager = getManager();
        if (manager) {
          const msg: ServerMessage = {
            type: "init",
            config,
            sessionId,
            processes: serializeProcesses(manager),
          };
          ws.send(JSON.stringify(msg));
        }
      },
      message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
        const manager = getManager();
        if (!manager) return;

        let msg: ClientMessage;
        try {
          msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch {
          return;
        }

        switch (msg.type) {
          case "requestLogs": {
            const logs = manager.getLogs(msg.index);
            const offset = msg.offset ?? 0;
            const limit = msg.limit ?? logs.length;
            const slice = logs.slice(offset, offset + limit);
            const reply: ServerMessage = {
              type: "logHistory",
              index: msg.index,
              offset,
              logs: slice,
              total: logs.length,
            };
            ws.send(JSON.stringify(reply));
            break;
          }
          case "restart":
            manager.restart(msg.index);
            break;
          case "stop":
            manager.stop(msg.index);
            break;
          case "stopAll":
            manager.stopAll();
            break;
          case "shutdownDaemon":
            broadcast({ type: "shutdown", reason: "Client requested shutdown" });
            // Give clients a moment to receive the message
            setTimeout(() => {
              process.kill(process.pid, "SIGTERM");
            }, 100);
            break;
        }
      },
      close(ws: ServerWebSocket<WsData>) {
        clients.delete(ws);
      },
    },
  });

  const events: ProcessManagerEvents = {
    onLog(index, lines) {
      broadcast({ type: "log", index, lines });
    },
    onStatusChange(index, status, exitCode, pid) {
      broadcast({ type: "status", index, status, exitCode, pid });
    },
    onLogClear(index) {
      broadcast({ type: "logClear", index });
    },
  };

  return {
    port: server.port!,
    events,
    close() {
      broadcast({ type: "shutdown", reason: "Daemon shutting down" });
      for (const ws of clients) {
        ws.close(1001, "Daemon shutting down");
      }
      clients.clear();
      server.stop(true);
    },
  };
}
