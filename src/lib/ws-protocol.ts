import type { LogLine, ProcessStatus, KernConfig } from "./types.ts";

// --- Server → Client messages ---

export interface InitMessage {
  type: "init";
  config: KernConfig;
  sessionId: string;
  processes: SerializedProcessState[];
}

export interface SerializedProcessState {
  name: string;
  status: ProcessStatus;
  exitCode: number | null;
  pid: number | null;
  logCount: number;
}

export interface LogHistoryMessage {
  type: "logHistory";
  index: number;
  offset: number;
  logs: LogLine[];
  total: number;
}

export interface LogAppendMessage {
  type: "log";
  index: number;
  lines: LogLine[];
}

export interface StatusChangeMessage {
  type: "status";
  index: number;
  status: ProcessStatus;
  exitCode: number | null;
  pid: number | null;
}

export interface LogClearMessage {
  type: "logClear";
  index: number;
}

export interface ShutdownMessage {
  type: "shutdown";
  reason: string;
}

export type ServerMessage =
  | InitMessage
  | LogHistoryMessage
  | LogAppendMessage
  | StatusChangeMessage
  | LogClearMessage
  | ShutdownMessage;

// --- Client → Server messages ---

export interface RequestLogsMessage {
  type: "requestLogs";
  index: number;
  offset?: number;
  limit?: number;
}

export interface RestartCommand {
  type: "restart";
  index: number;
}

export interface StopCommand {
  type: "stop";
  index: number;
}

export interface StopAllCommand {
  type: "stopAll";
}

export interface ShutdownDaemonCommand {
  type: "shutdownDaemon";
}

export type ClientMessage =
  | RequestLogsMessage
  | RestartCommand
  | StopCommand
  | StopAllCommand
  | ShutdownDaemonCommand;

// --- ProcessManager event hooks ---

export interface ProcessManagerEvents {
  onLog?: (index: number, lines: LogLine[]) => void;
  onStatusChange?: (index: number, status: ProcessStatus, exitCode: number | null, pid: number | null) => void;
  onLogClear?: (index: number) => void;
}
