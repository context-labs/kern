import { useState, useEffect, useRef, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { Sidebar } from "./components/Sidebar.tsx";
import { LogViewer } from "./components/LogViewer.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { ProcessManager } from "./lib/process-manager.ts";
import { copyToClipboard } from "./lib/clipboard.ts";
import { getVersionInfo, checkForUpdates } from "./lib/version.ts";
import type { VersionInfo } from "./lib/version.ts";
import type { KernConfig, ProcessState } from "./lib/types.ts";

interface AppProps {
  config: KernConfig;
  onManagerReady?: (manager: ProcessManager) => void;
}

export function App({ config, onManagerReady }: AppProps) {
  const renderer = useRenderer();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [processes, setProcesses] = useState<ProcessState[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [versionInfo, setVersionInfo] = useState<VersionInfo>(getVersionInfo());
  const managerRef = useRef<ProcessManager | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), 2000);
  }, []);

  useEffect(() => {
    checkForUpdates().then(setVersionInfo);
  }, []);

  useEffect(() => {
    const manager = new ProcessManager(config, () => {
      setProcesses([...manager.getAllStates()]);
    });
    managerRef.current = manager;
    setProcesses([...manager.getAllStates()]);
    manager.startAll();
    onManagerReady?.(manager);

    return () => {
      manager.stopAll();
    };
  }, [config, onManagerReady]);

  const onSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentMatchIndex(0);
  }, []);

  const shuttingDownRef = useRef(false);

  useKeyboard((key) => {
    const manager = managerRef.current;
    if (!manager) return;

    // Quit / force kill
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      if (searchMode) return; // let input handle it
      if (shuttingDownRef.current) {
        manager.forceKillAll();
        renderer.destroy();
        return;
      }
      shuttingDownRef.current = true;
      setStatusMessage("Shutting down...");
      manager.stopAll().then(() => renderer.destroy());
    }

    if (shuttingDownRef.current) return;

    // In search mode (input open), only handle Escape and Enter
    if (searchMode) {
      if (key.name === "escape") {
        setSearchMode(false);
        setSearchQuery("");
        setCurrentMatchIndex(0);
      } else if (key.name === "return") {
        // Close input, keep highlights + match position
        setSearchMode(false);
      }
      return;
    }

    // Search active (input closed): n/Enter = next, N = prev, Escape = clear
    if (searchQuery) {
      if (key.name === "escape") {
        setSearchQuery("");
        setCurrentMatchIndex(0);
        return;
      }
      if (key.name === "return" || key.name === "n") {
        setCurrentMatchIndex((i) => i + 1);
        return;
      }
      if (key.name === "b" || key.name === "up") {
        setCurrentMatchIndex((i) => i - 1);
        return;
      }
      if (key.name === "down") {
        setCurrentMatchIndex((i) => i + 1);
        return;
      }
    }

    // Arrow keys for process selection
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(processes.length - 1, i + 1));
      return;
    }

    // Search mode
    if (key.name === "/") {
      setSearchMode(true);
      setSearchQuery("");
      setCurrentMatchIndex(0);
      return;
    }

    // Restart
    if (key.name === "r") {
      manager.restart(selectedIndex);
      showStatus(`Restarting ${processes[selectedIndex]?.config.name ?? "process"}...`);
      return;
    }

    // Copy logs
    if (key.name === "c") {
      const text = manager.getLogText(selectedIndex);
      copyToClipboard(text).then((ok) => {
        showStatus(ok ? "Logs copied!" : "Failed to copy logs");
      });
      return;
    }
  });

  const currentProcess = processes[selectedIndex];

  return (
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
  );
}
