import { join, basename } from "path";
import { mkdir, readdir, unlink } from "fs/promises";
import { KERN_HOME } from "./user-config.ts";

export const SESSIONS_DIR = join(KERN_HOME, "sessions");

export interface SessionInfo {
  id: string;
  pid: number;
  port: number;
  configPaths: string[];
  processNames: string[];
  startedAt: number;
}

function generateId(configPaths: string[]): string {
  const base = basename(configPaths[0] ?? "kern", ".jsonc").replace(/\.json$/, "");
  const hex = Math.random().toString(16).slice(2, 6);
  return `${base}-${hex}`;
}

export async function createSession(
  configPaths: string[],
  processNames: string[],
  port: number,
): Promise<SessionInfo> {
  await mkdir(SESSIONS_DIR, { recursive: true });

  const id = generateId(configPaths);
  const session: SessionInfo = {
    id,
    pid: process.pid,
    port,
    configPaths,
    processNames,
    startedAt: Date.now(),
  };

  await Bun.write(
    join(SESSIONS_DIR, `${id}.json`),
    JSON.stringify(session, null, 2) + "\n",
  );

  return session;
}

export async function listSessions(): Promise<SessionInfo[]> {
  try {
    await mkdir(SESSIONS_DIR, { recursive: true });
    const files = await readdir(SESSIONS_DIR);
    const sessions: SessionInfo[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = await Bun.file(join(SESSIONS_DIR, file)).json();
        sessions.push(data as SessionInfo);
      } catch {
        // Skip malformed session files
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<SessionInfo | null> {
  try {
    const file = Bun.file(join(SESSIONS_DIR, `${id}.json`));
    if (!(await file.exists())) return null;
    return (await file.json()) as SessionInfo;
  } catch {
    return null;
  }
}

export async function removeSession(id: string): Promise<void> {
  try {
    await unlink(join(SESSIONS_DIR, `${id}.json`));
  } catch {
    // Already removed
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function cleanStaleSessions(): Promise<SessionInfo[]> {
  const sessions = await listSessions();
  const live: SessionInfo[] = [];

  for (const session of sessions) {
    if (isProcessAlive(session.pid)) {
      live.push(session);
    } else {
      await removeSession(session.id);
    }
  }

  return live;
}
