import { z } from "zod";
import { join } from "path";
import { homedir } from "os";
import { stripJsoncComments, stripTrailingCommas } from "./jsonc.ts";

// --- Path constants ---

export const KERN_HOME = join(homedir(), ".kern");
export const THEMES_DIR = join(KERN_HOME, "themes");
export const SCHEMAS_DIR = join(KERN_HOME, "schemas");
export const USER_CONFIG_PATH = join(KERN_HOME, "config.json");

// --- Theme schema ---

export const ThemeColorsSchema = z.object({
  borderColor: z.string().optional(),
  mutedText: z.string().optional(),
  selectedBackground: z.string().optional(),
  statusRunning: z.string().optional(),
  statusStarting: z.string().optional(),
  statusStopping: z.string().optional(),
  statusStopped: z.string().optional(),
  statusCrashed: z.string().optional(),
  stderrText: z.string().optional(),
  searchRegexIndicator: z.string().optional(),
  searchTextIndicator: z.string().optional(),
  searchMatchBackground: z.string().optional(),
  searchCurrentMatchBackground: z.string().optional(),
  searchCurrentMatchText: z.string().optional(),
  statusMessageText: z.string().optional(),
  versionText: z.string().optional(),
  updateAvailableText: z.string().optional(),
});

export type ThemeColors = Required<z.infer<typeof ThemeColorsSchema>>;

export const ThemeSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().optional(),
  colors: ThemeColorsSchema.optional(),
});

// --- Keybindings schema ---

export const KeybindingsSchema = z.object({
  quit: z.string().optional(),
  forceQuit: z.string().optional(),
  selectPrevious: z.string().optional(),
  selectNext: z.string().optional(),
  search: z.string().optional(),
  searchNext: z.string().optional(),
  searchPrevious: z.string().optional(),
  searchClose: z.string().optional(),
  searchClear: z.string().optional(),
  restart: z.string().optional(),
  copyLogs: z.string().optional(),
});

export type Keybindings = Required<z.infer<typeof KeybindingsSchema>>;

// --- User config schema ---

export const UserConfigSchema = z.object({
  $schema: z.string().optional(),
  theme: z.string().optional(),
  keybindings: KeybindingsSchema.optional(),
});

// --- Defaults ---

export const DEFAULT_THEME_COLORS: ThemeColors = {
  borderColor: "#444444",
  mutedText: "#6b7280",
  selectedBackground: "#333333",
  statusRunning: "#22c55e",
  statusStarting: "#eab308",
  statusStopping: "#f97316",
  statusStopped: "#6b7280",
  statusCrashed: "#ef4444",
  stderrText: "#ef4444",
  searchRegexIndicator: "#3b82f6",
  searchTextIndicator: "#eab308",
  searchMatchBackground: "#2a2a00",
  searchCurrentMatchBackground: "#3a3a00",
  searchCurrentMatchText: "#eab308",
  statusMessageText: "#22c55e",
  versionText: "#555555",
  updateAvailableText: "#eab308",
};

export const DEFAULT_KEYBINDINGS: Keybindings = {
  quit: "q",
  forceQuit: "ctrl+c",
  selectPrevious: "up",
  selectNext: "down",
  search: "/",
  searchNext: "n",
  searchPrevious: "b",
  searchClose: "return",
  searchClear: "escape",
  restart: "r",
  copyLogs: "c",
};

// --- Resolved user config ---

export interface ResolvedUserConfig {
  theme: ThemeColors;
  keybindings: Keybindings;
}

// --- Loading ---

async function readJsoncFile(path: string): Promise<unknown | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const raw = await file.text();
  const cleaned = stripTrailingCommas(stripJsoncComments(raw));
  return JSON.parse(cleaned);
}

async function ensureDefaults(): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await Promise.all([
    mkdir(THEMES_DIR, { recursive: true }),
    mkdir(SCHEMAS_DIR, { recursive: true }),
  ]);

  const defaultThemePath = join(THEMES_DIR, "default.json");
  const themeFile = Bun.file(defaultThemePath);
  if (!(await themeFile.exists())) {
    const defaultTheme = {
      $schema: "../schemas/theme.schema.json",
      name: "Default",
      colors: DEFAULT_THEME_COLORS,
    };
    await Bun.write(defaultThemePath, JSON.stringify(defaultTheme, null, 2) + "\n");
  }

  const configFile = Bun.file(USER_CONFIG_PATH);
  if (!(await configFile.exists())) {
    const defaultConfig = {
      $schema: "./schemas/config.schema.json",
      theme: "default",
    };
    await Bun.write(USER_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2) + "\n");
  }
}

export async function loadUserConfig(): Promise<ResolvedUserConfig> {
  await ensureDefaults();

  const defaults: ResolvedUserConfig = {
    theme: { ...DEFAULT_THEME_COLORS },
    keybindings: { ...DEFAULT_KEYBINDINGS },
  };

  let parsed: unknown;
  try {
    parsed = await readJsoncFile(USER_CONFIG_PATH);
  } catch {
    return defaults;
  }

  if (!parsed) return defaults;

  const config = UserConfigSchema.parse(parsed);

  // Merge keybindings
  const keybindings: Keybindings = { ...DEFAULT_KEYBINDINGS, ...config.keybindings };

  // Resolve theme
  let themeColors = { ...DEFAULT_THEME_COLORS };

  const themeName = config.theme ?? "default";
  const themePath = join(THEMES_DIR, `${themeName}.json`);

  try {
    const themeData = await readJsoncFile(themePath);
    if (themeData) {
      const theme = ThemeSchema.parse(themeData);
      if (theme.colors) {
        themeColors = { ...DEFAULT_THEME_COLORS, ...theme.colors };
      }
    }
  } catch {
    // If theme file fails to load, use defaults
  }

  return {
    theme: themeColors,
    keybindings,
  };
}

// --- Key matching ---

export function matchesBinding(
  key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean },
  binding: string,
): boolean {
  const parts = binding.toLowerCase().split("+");
  const keyName = parts[parts.length - 1]!;
  const wantCtrl = parts.includes("ctrl");
  const wantShift = parts.includes("shift");
  const wantMeta = parts.includes("meta");

  if ((key.name ?? "").toLowerCase() !== keyName) return false;
  if (!!key.ctrl !== wantCtrl) return false;
  if (!!key.shift !== wantShift) return false;
  if (!!key.meta !== wantMeta) return false;

  return true;
}

// --- Display name for keybinding ---

export function bindingDisplayName(binding: string): string {
  const parts = binding.split("+");
  return parts
    .map((p) => {
      const lower = p.toLowerCase();
      if (lower === "ctrl") return "Ctrl";
      if (lower === "shift") return "Shift";
      if (lower === "meta") return "Meta";
      if (lower === "return") return "Enter";
      if (lower === "escape") return "ESC";
      if (lower === "up") return "\u2191";
      if (lower === "down") return "\u2193";
      return p.toUpperCase();
    })
    .join("+");
}
