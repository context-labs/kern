import { useKernTheme, useKeybindings } from "../lib/theme-context.ts";
import { bindingDisplayName } from "../lib/user-config.ts";
import type { VersionInfo } from "../lib/version.ts";

interface StatusBarProps {
  message: string | null;
  searchQuery: string;
  searchMode: boolean;
  versionInfo: VersionInfo;
}

export function StatusBar({ message, searchQuery, searchMode, versionInfo }: StatusBarProps) {
  const colors = useKernTheme();
  const kb = useKeybindings();

  const versionText = versionInfo.isDev
    ? `kern ${versionInfo.current}`
    : `kern v${versionInfo.current}`;

  return (
    <box
      height={3}
      border
      borderStyle="single"
      borderColor={colors.borderColor}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
    >
      <box>
        {message ? (
          <text fg={colors.statusMessageText}>{message}</text>
        ) : searchQuery && !searchMode ? (
          <text fg={colors.mutedText}>
            <strong>{bindingDisplayName(kb.searchNext)}</strong> Next{"  "}
            <strong>{bindingDisplayName(kb.searchPrevious)}</strong> Back{"  "}
            <strong>{bindingDisplayName(kb.searchClear)}</strong> Clear
          </text>
        ) : searchMode ? null : (
          <text fg={colors.mutedText}>
            <strong>{bindingDisplayName(kb.search)}</strong> Search{"  "}
            <strong>{bindingDisplayName(kb.restart)}</strong> Restart{"  "}
            <strong>{bindingDisplayName(kb.copyLogs)}</strong> Copy logs{"  "}
            <strong>{bindingDisplayName(kb.quit)}</strong> Quit
          </text>
        )}
      </box>
      <box>
        <text fg={colors.versionText}>
          {versionText}
          {versionInfo.updateAvailable && versionInfo.latest ? (
            <span fg={colors.updateAvailableText}> (v{versionInfo.latest.replace(/^v/, "")} available)</span>
          ) : null}
        </text>
      </box>
    </box>
  );
}
