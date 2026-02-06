import { loadConfig, loadConfigs } from "./lib/config.ts";
import { startMcpServer } from "./lib/mcp-server.ts";
import { ProcessManager } from "./lib/process-manager.ts";
import { createWsServer } from "./lib/ws-server.ts";
import { createSession, removeSession } from "./lib/session.ts";

export async function runHeadless(configPaths: string[]) {
  const config =
    configPaths.length === 1
      ? await loadConfig(configPaths[0]!)
      : await loadConfigs(configPaths);

  let manager: ProcessManager | null = null;

  const ws = createWsServer(config, "", () => manager);

  manager = new ProcessManager(config, () => {}, ws.events);

  const session = await createSession(
    configPaths,
    config.processes.map((p) => p.name),
    ws.port,
  );

  // Now that we have the session ID, log it
  console.log(`kern headless started`);
  console.log(`  session:  ${session.id}`);
  console.log(`  port:     ${ws.port}`);
  console.log(`  pid:      ${process.pid}`);
  console.log(`  processes: ${config.processes.map((p) => p.name).join(", ")}`);
  console.log();
  console.log(`Attach with:  kern --attach ${session.id}`);
  console.log(`List:         kern --list`);
  console.log(`Stop:         kern --stop ${session.id}`);

  // Start MCP server if configured
  let mcpHandle: { close: () => void } | null = null;
  if (config.mcp?.enabled) {
    mcpHandle = await startMcpServer(config.mcp, manager);
  }

  await manager.startAll();

  // Graceful shutdown
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) {
      // Double signal = force kill
      manager?.forceKillAll();
      ws.close();
      await removeSession(session.id);
      process.exit(1);
    }
    shuttingDown = true;
    console.log("\nShutting down...");
    ws.close();
    mcpHandle?.close();
    await manager?.stopAll();
    await removeSession(session.id);
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
