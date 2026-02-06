import { useState, useEffect, useRef, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { Sidebar } from "./components/Sidebar.tsx";
import { LogViewer } from "./components/LogViewer.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { RemoteManager } from "./lib/remote-manager.ts";
import { copyToClipboard } from "./lib/clipboard.ts";
import { getVersionInfo } from "./lib/version.ts";
import { matchesBinding } from "./lib/user-config.ts";
import { KernProvider } from "./lib/theme-context.ts";
import type { ProcessState } from "./lib/types.ts";
import type { ThemeColors, Keybindings } from "./lib/user-config.ts";

interface AttachAppProps {
  sessionId: string;
  port: number;
  theme: ThemeColors;
  keybindings: Keybindings;
}

export function AttachApp({ sessionId, port, theme, keybindings }: AttachAppProps) {
  const renderer = useRenderer();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [processes, setProcesses] = useState<ProcessState[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [disconnected, setDisconnected] = useState(false);
  const managerRef = useRef<RemoteManager | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const versionInfo = {
    ...getVersionInfo(),
    // Override display to show attached session
    current: `${getVersionInfo().current} attached:${sessionId}`,
  };

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 2000);
  }, []);

  useEffect(() => {
    const remote = new RemoteManager(`ws://127.0.0.1:${port}`, {
      onChange() {
        setProcesses([...remote.getAllStates()]);
      },
      onDisconnect(reason) {
        setDisconnected(true);
        setStatusMessage(`Disconnected: ${reason}`);
        setTimeout(() => renderer.destroy(), 2000);
      },
    });
    managerRef.current = remote;

    return () => {
      remote.close();
    };
  }, [port, renderer]);

  const onSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);
  }, []);

  const kb = keybindings;

  useKeyboard((key) => {
    const manager = managerRef.current;
    if (!manager || disconnected) return;

    // q = detach (daemon keeps running)
    if (matchesBinding(key, kb.quit)) {
      if (searchMode) return;
      renderer.destroy();
      return;
    }

    // ctrl+c = shutdown daemon
    if (matchesBinding(key, kb.forceQuit)) {
      if (searchMode) return;
      setStatusMessage("Shutting down daemon...");
      manager.shutdownDaemon();
      return;
    }

    // In search mode (input open), only handle Escape and Enter
    if (searchMode) {
      if (matchesBinding(key, kb.searchClear)) {
        setSearchMode(false);
        setSearchQuery("");
        setCurrentMatchIndex(0);
      } else if (matchesBinding(key, kb.searchClose)) {
        setSearchMode(false);
      }
      return;
    }

    // Search active (input closed): next/prev/clear
    if (searchQuery) {
      if (matchesBinding(key, kb.searchClear)) {
        setSearchQuery("");
        setCurrentMatchIndex(0);
        return;
      }
      if (matchesBinding(key, kb.searchClose) || matchesBinding(key, kb.searchNext)) {
        setCurrentMatchIndex((i) => i + 1);
        return;
      }
      if (matchesBinding(key, kb.searchPrevious) || matchesBinding(key, kb.selectPrevious)) {
        setCurrentMatchIndex((i) => i - 1);
        return;
      }
      if (matchesBinding(key, kb.selectNext)) {
        setCurrentMatchIndex((i) => i + 1);
        return;
      }
    }

    // Arrow keys for process selection
    if (matchesBinding(key, kb.selectPrevious)) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (matchesBinding(key, kb.selectNext)) {
      setSelectedIndex((i) => Math.min(processes.length - 1, i + 1));
      return;
    }

    // Search mode
    if (matchesBinding(key, kb.search)) {
      setSearchMode(true);
      setSearchQuery("");
      setCurrentMatchIndex(0);
      return;
    }

    // Restart
    if (matchesBinding(key, kb.restart)) {
      manager.restart(selectedIndex);
      showStatus(`Restarting ${processes[selectedIndex]?.config.name ?? "process"}...`);
      return;
    }

    // Copy logs
    if (matchesBinding(key, kb.copyLogs)) {
      const text = manager.getLogText(selectedIndex);
      copyToClipboard(text).then((ok) => {
        showStatus(ok ? "Logs copied!" : "Failed to copy logs");
      });
      return;
    }
  });

  const currentProcess = processes[selectedIndex];

  return (
    <KernProvider value={{ theme, keybindings }}>
      <box flexDirection="column" width="100%" height="100%">
        <box flexDirection="row" flexGrow={1}>
          <Sidebar
            processes={processes}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
          <LogViewer
            process={currentProcess}
            searchMode={searchMode}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            currentMatchIndex={currentMatchIndex}
          />
        </box>
        <StatusBar
          message={statusMessage}
          searchQuery={searchQuery}
          searchMode={searchMode}
          versionInfo={versionInfo}
        />
      </box>
    </KernProvider>
  );
}
