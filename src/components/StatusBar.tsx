import type { VersionInfo } from "../lib/version.ts";

interface StatusBarProps {
  message: string | null;
  searchQuery: string;
  searchMode: boolean;
  versionInfo: VersionInfo;
}

export function StatusBar({ message, searchQuery, searchMode, versionInfo }: StatusBarProps) {
  const versionText = versionInfo.isDev
    ? `kern ${versionInfo.current}`
    : `kern v${versionInfo.current}`;

  return (
    <box
      height={3}
      border
      borderStyle="single"
      borderColor="#444444"
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
    >
      <box>
        {message ? (
          <text fg="#22c55e">{message}</text>
        ) : searchQuery && !searchMode ? (
          <text fg="#6b7280">
            <strong>n</strong> Next{"  "}
            <strong>N</strong> Prev{"  "}
            <strong>ESC</strong> Clear
          </text>
        ) : searchMode ? null : (
          <text fg="#6b7280">
            <strong>/</strong> Search{"  "}
            <strong>r</strong> Restart{"  "}
            <strong>c</strong> Copy logs{"  "}
            <strong>q</strong> Quit
          </text>
        )}
      </box>
      <box>
        <text fg="#555555">
          {versionText}
          {versionInfo.updateAvailable && versionInfo.latest ? (
            <span fg="#eab308"> (v{versionInfo.latest.replace(/^v/, "")} available)</span>
          ) : null}
        </text>
      </box>
    </box>
  );
}
