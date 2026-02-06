import { z } from "zod";
import { resolve, dirname } from "path";
import { stripJsoncComments, stripTrailingCommas } from "./jsonc.ts";
import type { KernConfig } from "./types.ts";

export const McpConfigSchema = z.object({
  enabled: z.boolean(),
  port: z.number().optional(),
});

export const ProcessConfigSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  noParent: z.boolean().optional(),
  shutdownOrder: z.number().optional(),
});

export const KernConfigSchema = z.object({
  $schema: z.string().optional(),
  mcp: McpConfigSchema.optional(),
  parent: z.string().optional(),
  processes: z.array(ProcessConfigSchema).min(1),
});

export async function loadConfig(configPath: string): Promise<KernConfig> {
  const absPath = resolve(configPath);
  const file = Bun.file(absPath);

  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${absPath}`);
  }

  const raw = await file.text();
  const cleaned = stripTrailingCommas(stripJsoncComments(raw));

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Invalid JSON in config file: ${(e as Error).message}`);
  }

  const validated = KernConfigSchema.parse(parsed);
  const configDir = dirname(absPath);

  const processes = validated.processes.map((p) => ({
    name: p.name,
    command: p.command,
    cwd: p.cwd ? resolve(configDir, p.cwd) : configDir,
    env: p.env ?? undefined,
    noParent: p.noParent ?? undefined,
    shutdownOrder: p.shutdownOrder ?? undefined,
  }));

  return {
    mcp: validated.mcp,
    parent: validated.parent,
    processes,
  };
}

export async function loadConfigs(paths: string[]): Promise<KernConfig> {
  const configs = await Promise.all(paths.map((p) => loadConfig(p)));

  const merged: KernConfig = {
    processes: [],
  };

  for (const config of configs) {
    merged.processes.push(...config.processes);
    if (!merged.mcp && config.mcp) {
      merged.mcp = config.mcp;
    }
    if (!merged.parent && config.parent) {
      merged.parent = config.parent;
    }
  }

  return merged;
}
