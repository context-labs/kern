import { useRef, useMemo, useEffect } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ProcessState, LogLine } from "../lib/types.ts";

interface LogViewerProps {
  process: ProcessState | undefined;
  searchMode: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentMatchIndex: number;
}

function isValidRegex(query: string): boolean {
  if (!query) return false;
  if (!/[[\](){}*+?|^$\\]/.test(query)) return false;
  try {
    new RegExp(query);
    return true;
  } catch {
    return false;
  }
}

function findMatchIndices(logs: LogLine[], query: string): number[] {
  if (!query) return [];
  const indices: number[] = [];
  try {
    const re = new RegExp(query, "i");
    for (let i = 0; i < logs.length; i++) {
      if (re.test(logs[i]!.text)) indices.push(i);
    }
  } catch {
    const lower = query.toLowerCase();
    for (let i = 0; i < logs.length; i++) {
      if (logs[i]!.text.toLowerCase().includes(lower)) indices.push(i);
    }
  }
  return indices;
}

export function LogViewer({
  process: proc,
  searchMode,
  searchQuery,
  onSearchChange,
  currentMatchIndex,
}: LogViewerProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  const logs = proc?.logs ?? [];

  const matchIndices = useMemo(
    () => findMatchIndices(logs, searchQuery),
    [logs, searchQuery],
  );

  const matchSet = useMemo(
    () => new Set(matchIndices),
    [matchIndices],
  );

  const isRegexMode = useMemo(
    () => isValidRegex(searchQuery),
    [searchQuery],
  );

  // Compute the actual current match index (wrapped)
  const wrappedIndex = matchIndices.length > 0
    ? ((currentMatchIndex % matchIndices.length) + matchIndices.length) % matchIndices.length
    : -1;

  const targetLogIndex = wrappedIndex >= 0 ? matchIndices[wrappedIndex]! : -1;

  // Scroll to current match
  useEffect(() => {
    if (targetLogIndex >= 0 && scrollRef.current) {
      scrollRef.current.stickyScroll = false;
      scrollRef.current.scrollTo(targetLogIndex);
    }
  }, [targetLogIndex]);

  // Re-enable sticky scroll when search is cleared
  useEffect(() => {
    if (!searchQuery && scrollRef.current) {
      scrollRef.current.stickyScroll = true;
    }
  }, [searchQuery]);

  if (!proc) {
    return (
      <box flexGrow={1} flexDirection="column" padding={1}>
        <text fg="#6b7280">No process selected</text>
      </box>
    );
  }

  return (
    <box flexGrow={1} flexDirection="column">
      {searchMode && (
        <box paddingLeft={1} paddingRight={1}>
          <text fg={isRegexMode ? "#3b82f6" : "#eab308"}>/</text>
          <input
            focused
            flexGrow={1}
            placeholder="Search logs..."
            placeholderColor="#6b7280"
            onChange={(value) => onSearchChange(value)}
          />
        </box>
      )}
      {!searchMode && searchQuery && (
        <box paddingLeft={1}>
          <text fg="#6b7280">
            Search: <span fg={isRegexMode ? "#3b82f6" : "#eab308"}>{searchQuery}</span>{" "}
            ({wrappedIndex >= 0 ? wrappedIndex + 1 : 0}/{matchIndices.length})
          </text>
        </box>
      )}
      <scrollbox
        ref={scrollRef}
        focused={!searchMode}
        flexGrow={1}
        stickyScroll={!searchQuery}
        stickyStart="bottom"
      >
        {logs.length === 0 ? (
          <box paddingLeft={1}>
            <text fg="#6b7280">Waiting for output...</text>
          </box>
        ) : (
          logs.map((line, i) => {
            const isMatch = matchSet.has(i);
            const isCurrent = i === targetLogIndex;
            return (
              <box
                key={i}
                paddingLeft={1}
                backgroundColor={isCurrent ? "#3a3a00" : isMatch ? "#2a2a00" : undefined}
              >
                <text
                  fg={
                    isCurrent
                      ? "#eab308"
                      : line.stream === "stderr"
                        ? "#ef4444"
                        : undefined
                  }
                >
                  {line.text}
                </text>
              </box>
            );
          })
        )}
      </scrollbox>
    </box>
  );
}
