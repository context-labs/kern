import { join } from "path";
import { homedir } from "os";

export interface VersionInfo {
  current: string;
  isDev: boolean;
  latest: string | null;
  updateAvailable: boolean;
}

declare const KERN_VERSION: string;
declare const KERN_COMPILED: string;

const REPO = "context-labs/kern";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const KERN_HOME = join(homedir(), ".kern");
const THEMES_DIR = join(KERN_HOME, "themes");
const SCHEMAS_DIR = join(KERN_HOME, "schemas");

function isCompiled(): boolean {
  try {
    return typeof KERN_COMPILED !== "undefined" && KERN_COMPILED === "true";
  } catch {
    return false;
  }
}

function getCompiledVersion(): string {
  try {
    return typeof KERN_VERSION !== "undefined" ? KERN_VERSION : "unknown";
  } catch {
    return "unknown";
  }
}

function getDevHash(): string {
  try {
    const result = Bun.spawnSync({
      cmd: ["git", "rev-parse", "--short", "HEAD"],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (!result.success) return "dev";
    const hash = new TextDecoder().decode(result.stdout).trim();
    return hash || "dev";
  } catch {
    return "dev";
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function getVersionInfo(): VersionInfo {
  if (isCompiled()) {
    return {
      current: getCompiledVersion(),
      isDev: false,
      latest: null,
      updateAvailable: false,
    };
  }
  return {
    current: getDevHash(),
    isDev: true,
    latest: null,
    updateAvailable: false,
  };
}

async function fetchRaw(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${RAW_BASE}/${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function syncFile(remotePath: string, localPath: string): Promise<void> {
  const content = await fetchRaw(remotePath);
  if (content) {
    await Bun.write(localPath, content);
  }
}

async function syncThemesAndSchemas(): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await mkdir(SCHEMAS_DIR, { recursive: true });
  await mkdir(THEMES_DIR, { recursive: true });

  // Always sync schemas to latest
  await Promise.all([
    syncFile("schemas/config.schema.json", join(SCHEMAS_DIR, "config.schema.json")),
    syncFile("schemas/theme.schema.json", join(SCHEMAS_DIR, "theme.schema.json")),
  ]);

  // Fetch the themes directory listing from GitHub API to discover all themes
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/themes`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return;
    const files = (await res.json()) as Array<{ name: string; download_url: string }>;

    await Promise.all(
      files
        .filter((f) => f.name.endsWith(".json"))
        .map(async (f) => {
          const localPath = join(THEMES_DIR, f.name);
          const file = Bun.file(localPath);
          // Only download themes that don't exist locally (don't overwrite user edits)
          if (!(await file.exists())) {
            await syncFile(`themes/${f.name}`, localPath);
          }
        }),
    );
  } catch {
    // Non-critical — skip theme sync on failure
  }
}

export async function checkForUpdates(): Promise<VersionInfo> {
  const info = getVersionInfo();
  if (info.isDev) return info;

  try {
    const [, releaseRes] = await Promise.all([
      syncThemesAndSchemas(),
      fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        {
          headers: { Accept: "application/vnd.github.v3+json" },
          signal: AbortSignal.timeout(5000),
        },
      ),
    ]);
    if (!releaseRes.ok) return info;
    const data = (await releaseRes.json()) as { tag_name?: string };
    const latest = data.tag_name ?? null;
    if (!latest) return info;
    return {
      ...info,
      latest,
      updateAvailable: compareSemver(latest, info.current) > 0,
    };
  } catch {
    return info;
  }
}
