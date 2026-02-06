export interface McpConfig {
  enabled: boolean;
  port?: number;
}

export interface ProcessConfig {
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  noParent?: boolean;
}

export interface KernConfig {
  mcp?: McpConfig;
  parent?: string;
  processes: ProcessConfig[];
}

export type ProcessStatus = "starting" | "running" | "stopping" | "stopped" | "crashed";

export interface LogLine {
  timestamp: number;
  stream: "stdout" | "stderr";
  text: string;
}

export interface ProcessState {
  config: ProcessConfig;
  status: ProcessStatus;
  logs: LogLine[];
  exitCode: number | null;
  pid: number | null;
}
