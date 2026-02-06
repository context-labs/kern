export interface VersionInfo {
  current: string;
  isDev: boolean;
  latest: string | null;
  updateAvailable: boolean;
}

declare const KERN_VERSION: string;
declare const KERN_COMPILED: string;

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

export async function checkForUpdates(): Promise<VersionInfo> {
  const info = getVersionInfo();
  if (info.isDev) return info;

  try {
    const res = await fetch(
      "https://api.github.com/repos/context-labs/kern/releases/latest",
      {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return info;
    const data = (await res.json()) as { tag_name?: string };
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
