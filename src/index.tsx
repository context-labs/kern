const args = process.argv.slice(2);

// --- CLI mode routing ---

if (args.includes("--headless")) {
  const configPaths = args.filter((a) => a !== "--headless");
  if (configPaths.length === 0) {
    console.error("Usage: kern --headless <config.jsonc> [config2.jsonc ...]");
    process.exit(1);
  }

  const { resolve } = await import("path");
  const { listSessions } = await import("./lib/session.ts");

  const before = new Set((await listSessions()).map((s) => s.id));
  const absolutePaths = configPaths.map((p) => resolve(p));

  // Spawn the daemon process in the background
  const isCompiled = process.execPath === process.argv[1] || !process.argv[1];
  const entryScript = isCompiled ? [] : [process.argv[1]!];
  const child = Bun.spawn([process.execPath, ...entryScript, "--daemon", ...absolutePaths], {
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  child.unref();

  // Poll for the session file (up to 5 seconds)
  const deadline = Date.now() + 5000;
  let newSession = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    const current = await listSessions();
    newSession = current.find((s) => !before.has(s.id) && s.pid === child.pid);
    if (newSession) break;
  }

  if (newSession) {
    console.log(`kern started in background`);
    console.log(`  session:   ${newSession.id}`);
    console.log(`  pid:       ${newSession.pid}`);
    console.log(`  processes: ${newSession.processNames.join(", ")}`);
    console.log();
    console.log(`Attach:  kern --attach ${newSession.id}`);
    console.log(`Stop:    kern --stop ${newSession.id}`);
  } else {
    console.log(`kern spawned in background (pid ${child.pid})`);
    console.log(`Use 'kern --list' to see sessions once ready.`);
  }

  process.exit(0);
} else if (args.includes("--daemon")) {
  // Internal: the actual headless process running in the background
  const configPaths = args.filter((a) => a !== "--daemon");
  const { runHeadless } = await import("./headless.ts");
  await runHeadless(configPaths);
} else if (args.includes("--attach")) {
  const idx = args.indexOf("--attach");
  const sessionId = args[idx + 1];
  if (!sessionId) {
    console.error("Usage: kern --attach <session-id>");
    process.exit(1);
  }
  const { runAttach } = await import("./attach.tsx");
  await runAttach(sessionId);
} else if (args.includes("--list")) {
  const { cleanStaleSessions } = await import("./lib/session.ts");
  const sessions = await cleanStaleSessions();
  if (sessions.length === 0) {
    console.log("No active sessions.");
  } else {
    console.log("Active sessions:\n");
    for (const s of sessions) {
      const age = Math.round((Date.now() - s.startedAt) / 1000);
      const mins = Math.floor(age / 60);
      const secs = age % 60;
      const uptime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      console.log(`  ${s.id}`);
      console.log(`    port: ${s.port}  pid: ${s.pid}  uptime: ${uptime}`);
      console.log(`    processes: ${s.processNames.join(", ")}`);
      console.log();
    }
  }
} else if (args.includes("--stop")) {
  const idx = args.indexOf("--stop");
  const sessionId = args[idx + 1];
  if (!sessionId) {
    console.error("Usage: kern --stop <session-id>");
    process.exit(1);
  }
  const { getSession, cleanStaleSessions } = await import("./lib/session.ts");
  await cleanStaleSessions();
  const session = await getSession(sessionId);
  if (!session) {
    console.error(`Session "${sessionId}" not found.`);
    process.exit(1);
  }
  try {
    process.kill(session.pid, "SIGTERM");
    console.log(`Sent SIGTERM to session "${sessionId}" (pid ${session.pid}).`);
  } catch {
    console.error(`Failed to signal pid ${session.pid}. Process may already be dead.`);
    const { removeSession } = await import("./lib/session.ts");
    await removeSession(sessionId);
  }
} else {
  // --- Default: TUI mode ---
  const configPaths = args;
  if (configPaths.length === 0) {
    console.error("Usage: kern <config.jsonc> [config2.jsonc ...]");
    console.error("       kern --headless <config.jsonc>    Start in background (detached)");
    console.error("       kern --attach <session-id>        Attach to a session");
    console.error("       kern --list                       List active sessions");
    console.error("       kern --stop <session-id>          Stop a session");
    process.exit(1);
  }

  const { createCliRenderer } = await import("@opentui/core");
  const { createRoot } = await import("@opentui/react");
  const { loadConfig, loadConfigs } = await import("./lib/config.ts");
  const { loadUserConfig } = await import("./lib/user-config.ts");
  const { startMcpServer } = await import("./lib/mcp-server.ts");
  const { App } = await import("./App.tsx");

  const [config, userConfig] = await Promise.all([
    configPaths.length === 1
      ? loadConfig(configPaths[0]!)
      : loadConfigs(configPaths),
    loadUserConfig(),
  ]);

  let mcpHandle: { close: () => void } | null = null;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    useAlternateScreen: true,
    onDestroy: () => {
      mcpHandle?.close();
    },
  });

  function handleManagerReady(manager: any) {
    if (config.mcp?.enabled) {
      startMcpServer(config.mcp, manager).then((handle: any) => {
        mcpHandle = handle;
      });
    }
  }

  createRoot(renderer).render(
    <App
      config={config}
      onManagerReady={handleManagerReady}
      theme={userConfig.theme}
      keybindings={userConfig.keybindings}
    />,
  );
}
