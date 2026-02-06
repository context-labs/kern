import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadConfig, loadConfigs } from "./lib/config.ts";
import { startMcpServer } from "./lib/mcp-server.ts";
import { App } from "./App.tsx";
import type { ProcessManager } from "./lib/process-manager.ts";

const configPaths = process.argv.slice(2);

if (configPaths.length === 0) {
  console.error("Usage: kern <config.jsonc> [config2.jsonc ...]");
  process.exit(1);
}

const config =
  configPaths.length === 1
    ? await loadConfig(configPaths[0]!)
    : await loadConfigs(configPaths);

let mcpHandle: { close: () => void } | null = null;

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useAlternateScreen: true,
  onDestroy: () => {
    mcpHandle?.close();
  },
});

function handleManagerReady(manager: ProcessManager) {
  if (config.mcp?.enabled) {
    startMcpServer(config.mcp, manager).then((handle) => {
      mcpHandle = handle;
    });
  }
}

createRoot(renderer).render(
  <App config={config} onManagerReady={handleManagerReady} />,
);
