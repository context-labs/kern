import type { ProcessState } from "../lib/types.ts";

const STATUS_DOTS: Record<string, { char: string; color: string }> = {
  running: { char: "●", color: "#22c55e" },
  starting: { char: "●", color: "#eab308" },
  stopping: { char: "●", color: "#f97316" },
  stopped: { char: "●", color: "#6b7280" },
  crashed: { char: "●", color: "#ef4444" },
};

interface SidebarProps {
  processes: ProcessState[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function Sidebar({ processes, selectedIndex, onSelect }: SidebarProps) {
  return (
    <box
      flexDirection="column"
      width={28}
      border
      borderStyle="single"
      borderColor="#444444"
    >
      <box paddingLeft={1} paddingTop={1} paddingBottom={1}>
        <text>
          <strong>Processes</strong>
        </text>
      </box>
      {processes.map((proc, i) => {
        const dot = STATUS_DOTS[proc.status] ?? STATUS_DOTS["stopped"]!;
        const isSelected = i === selectedIndex;
        return (
          <box
            key={i}
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={isSelected ? "#333333" : undefined}
            onMouseDown={() => onSelect(i)}
          >
            <text>
              <span fg={dot.color}>{dot.char}</span>{" "}
              {proc.status === "crashed" ? (
                <span fg="#ef4444">{proc.config.name}</span>
              ) : (
                proc.config.name
              )}
            </text>
          </box>
        );
      })}
    </box>
  );
}
