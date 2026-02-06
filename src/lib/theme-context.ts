import { createContext, useContext } from "react";
import type { ThemeColors, Keybindings } from "./user-config.ts";
import { DEFAULT_THEME_COLORS, DEFAULT_KEYBINDINGS } from "./user-config.ts";

export interface KernContextValue {
  theme: ThemeColors;
  keybindings: Keybindings;
}

const KernContext = createContext<KernContextValue>({
  theme: DEFAULT_THEME_COLORS,
  keybindings: DEFAULT_KEYBINDINGS,
});

export const KernProvider = KernContext.Provider;

export function useKernTheme(): ThemeColors {
  return useContext(KernContext).theme;
}

export function useKeybindings(): Keybindings {
  return useContext(KernContext).keybindings;
}
