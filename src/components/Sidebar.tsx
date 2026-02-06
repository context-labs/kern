import { useKernTheme } from "../lib/theme-context.ts";
import type { ProcessState } from "../lib/types.ts";

interface SidebarProps {
  processes: ProcessState[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function Sidebar({ processes, selectedIndex, onSelect }: SidebarProps) {
  const colors = useKernTheme();

  const STATUS_DOTS: Record<string, { char: string; color: string }> = {
    running: { char: "\u25CF", color: colors.statusRunning },
    starting: { char: "\u25CF", color: colors.statusStarting },
    stopping: { char: "\u25CF", color: colors.statusStopping },
    stopped: { char: "\u25CF", color: colors.statusStopped },
    crashed: { char: "\u25CF", color: colors.statusCrashed },
  };

  return (
    <box
      flexDirection="column"
      width={28}
      border
      borderStyle="single"
      borderColor={colors.borderColor}
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
            backgroundColor={isSelected ? colors.selectedBackground : undefined}
            onMouseDown={() => onSelect(i)}
          >
            <text>
              <span fg={dot.color}>{dot.char}</span>{" "}
              {proc.status === "crashed" ? (
                <span fg={colors.statusCrashed}>{proc.config.name}</span>
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
