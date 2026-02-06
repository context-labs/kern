import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadUserConfig } from "./lib/user-config.ts";
import { cleanStaleSessions, getSession } from "./lib/session.ts";
import { AttachApp } from "./AttachApp.tsx";

export async function runAttach(sessionId: string) {
  await cleanStaleSessions();

  const session = await getSession(sessionId);
  if (!session) {
    console.error(`Session "${sessionId}" not found.`);
    console.error("Run 'kern --list' to see active sessions.");
    process.exit(1);
  }

  // Verify the process is still alive
  try {
    process.kill(session.pid, 0);
  } catch {
    console.error(`Session "${sessionId}" daemon (pid ${session.pid}) is no longer running.`);
    const { removeSession } = await import("./lib/session.ts");
    await removeSession(sessionId);
    process.exit(1);
  }

  const userConfig = await loadUserConfig();

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    useAlternateScreen: true,
  });

  createRoot(renderer).render(
    <AttachApp
      sessionId={sessionId}
      port={session.port}
      theme={userConfig.theme}
      keybindings={userConfig.keybindings}
    />,
  );
}
