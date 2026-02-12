/** Parse ANSI escape codes into styled segments for rendering */

export interface AnsiSegment {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ANSI_COLORS: Record<number, string> = {
  30: "#000000", 31: "#cc0000", 32: "#4e9a06", 33: "#c4a000",
  34: "#3465a4", 35: "#75507b", 36: "#06989a", 37: "#d3d7cf",
  90: "#555753", 91: "#ef2929", 92: "#8ae234", 93: "#fce94f",
  94: "#729fcf", 95: "#ad7fa8", 96: "#34e2e2", 97: "#eeeeec",
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: "#000000", 41: "#cc0000", 42: "#4e9a06", 43: "#c4a000",
  44: "#3465a4", 45: "#75507b", 46: "#06989a", 47: "#d3d7cf",
  100: "#555753", 101: "#ef2929", 102: "#8ae234", 103: "#fce94f",
  104: "#729fcf", 105: "#ad7fa8", 106: "#34e2e2", 107: "#eeeeec",
};

// 256-color palette (indices 0-255)
const COLOR_256: string[] = (() => {
  const palette: string[] = [];
  // 0-7: standard colors
  palette.push("#000000", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf");
  // 8-15: bright colors
  palette.push("#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec");
  // 16-231: 6x6x6 color cube
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        const rv = r === 0 ? 0 : 55 + r * 40;
        const gv = g === 0 ? 0 : 55 + g * 40;
        const bv = b === 0 ? 0 : 55 + b * 40;
        palette.push(`#${rv.toString(16).padStart(2, "0")}${gv.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`);
      }
    }
  }
  // 232-255: grayscale
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    palette.push(`#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`);
  }
  return palette;
})();

// Regex to match ANSI escape sequences
const ANSI_RE = /\x1b\[([0-9;]*)m/g;

interface AnsiState {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function applyCode(state: AnsiState, codes: number[]): void {
  let i = 0;
  while (i < codes.length) {
    const code = codes[i]!;

    if (code === 0) {
      state.fg = undefined;
      state.bg = undefined;
      state.bold = undefined;
      state.dim = undefined;
      state.italic = undefined;
      state.underline = undefined;
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 2) {
      state.dim = true;
    } else if (code === 3) {
      state.italic = true;
    } else if (code === 4) {
      state.underline = true;
    } else if (code === 22) {
      state.bold = undefined;
      state.dim = undefined;
    } else if (code === 23) {
      state.italic = undefined;
    } else if (code === 24) {
      state.underline = undefined;
    } else if (code === 39) {
      state.fg = undefined;
    } else if (code === 49) {
      state.bg = undefined;
    } else if (code >= 30 && code <= 37) {
      state.fg = ANSI_COLORS[code];
    } else if (code >= 90 && code <= 97) {
      state.fg = ANSI_COLORS[code];
    } else if (code >= 40 && code <= 47) {
      state.bg = ANSI_BG_COLORS[code];
    } else if (code >= 100 && code <= 107) {
      state.bg = ANSI_BG_COLORS[code];
    } else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      state.fg = COLOR_256[codes[i + 2]!] ?? undefined;
      i += 2;
    } else if (code === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      state.bg = COLOR_256[codes[i + 2]!] ?? undefined;
      i += 2;
    } else if (code === 38 && codes[i + 1] === 2 && codes.length >= i + 5) {
      const r = codes[i + 2]!;
      const g = codes[i + 3]!;
      const b = codes[i + 4]!;
      state.fg = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      i += 4;
    } else if (code === 48 && codes[i + 1] === 2 && codes.length >= i + 5) {
      const r = codes[i + 2]!;
      const g = codes[i + 3]!;
      const b = codes[i + 4]!;
      state.bg = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      i += 4;
    }

    i++;
  }
}

export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const state: AnsiState = {};
  let lastIndex = 0;

  ANSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANSI_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) {
        segments.push({
          text: chunk,
          ...(state.fg && { fg: state.fg }),
          ...(state.bg && { bg: state.bg }),
          ...(state.bold && { bold: true }),
          ...(state.dim && { dim: true }),
          ...(state.italic && { italic: true }),
          ...(state.underline && { underline: true }),
        });
      }
    }

    const codeStr = match[1]!;
    const codes = codeStr === "" ? [0] : codeStr.split(";").map(Number);
    applyCode(state, codes);

    lastIndex = ANSI_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk) {
      segments.push({
        text: chunk,
        ...(state.fg && { fg: state.fg }),
        ...(state.bg && { bg: state.bg }),
        ...(state.bold && { bold: true }),
        ...(state.dim && { dim: true }),
        ...(state.italic && { italic: true }),
        ...(state.underline && { underline: true }),
      });
    }
  }

  if (segments.length === 0 && text) {
    segments.push({ text });
  }

  return segments;
}

/** Check if text contains any ANSI escape codes */
export function hasAnsi(text: string): boolean {
  return /\x1b\[/.test(text);
}

/** Strip ANSI codes from text (for search, MCP output, etc.) */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
