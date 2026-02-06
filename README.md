# kern

A TUI process manager. Define your processes in a JSONC config file, and kern runs them side-by-side with a unified log viewer.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/context-labs/kern/main/install.sh | sh
```

Or build from source:

```sh
bun install
bun run build
# Binary at dist/kern
```

## Quick Start

```sh
kern kern.jsonc
```

Or run directly with Bun:

```sh
bun run src/index.tsx kern.jsonc
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Up` / `Down` | Select process |
| `/` | Search logs (highlights matches, jumps to first) |
| `Enter` | Close search input (keep highlights) |
| `n` / `Enter` | Jump to next match |
| `N` | Jump to previous match |
| `Escape` | Clear search / cancel |
| `r` | Restart selected process |
| `c` | Copy logs to clipboard |
| `q` / `Ctrl+C` | Quit (graceful) |
| `q` / `Ctrl+C` (twice) | Force kill all processes |

## Configuration

Config files use [JSONC](https://code.visualstudio.com/docs/languages/json#_json-with-comments) (JSON with comments and trailing commas). Add the `$schema` field for editor autocompletion:

```jsonc
{
  "$schema": "./kern.schema.json",
  "processes": [
    {
      "name": "Server",
      "command": "npm run dev"
    }
  ]
}
```

### Process Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Display name in the sidebar |
| `command` | `string` | Yes | Shell command to run (executed via `sh -c`) |
| `cwd` | `string` | No | Working directory (relative to the config file) |
| `env` | `object` | No | Environment variables (merged with the current environment) |
| `noParent` | `boolean` | No | Skip the `parent` template for this process |

### Working Directory

Set `cwd` to run a process in a specific directory. Paths are resolved relative to the config file location:

```jsonc
{
  "processes": [
    {
      "name": "API",
      "command": "npm run dev",
      "cwd": "./packages/api"
    },
    {
      "name": "Web",
      "command": "npm run dev",
      "cwd": "./packages/web"
    }
  ]
}
```

### Environment Variables

Pass extra environment variables with `env`. These are merged on top of the current shell environment:

```jsonc
{
  "processes": [
    {
      "name": "Worker",
      "command": "node worker.js",
      "env": {
        "NODE_ENV": "development",
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  ]
}
```

### Parent Template

The `parent` field wraps every process command in a template. This is useful for running commands inside Docker containers, SSH sessions, or any other wrapper:

```jsonc
{
  "parent": "docker exec -i mycontainer sh -c '{{ command }}'",
  "processes": [
    {
      "name": "Migrate",
      "command": "prisma migrate dev"
    },
    {
      "name": "Health Check",
      "command": "curl -s localhost:3000/health",
      "noParent": true
    }
  ]
}
```

Available placeholders:

| Placeholder | Value |
|-------------|-------|
| `{{ command }}` | The process `command` field |
| `{{ name }}` | The process `name` field |
| `{{ cwd }}` | The process `cwd` (or `.` if unset) |

Set `noParent: true` on any process to skip the template and run directly on the host.

### MCP Server

kern can expose an [MCP](https://modelcontextprotocol.io/) server over SSE for agent integration:

```jsonc
{
  "mcp": {
    "enabled": true,
    "port": 3100
  },
  "processes": [ ... ]
}
```

Available MCP tools: `list_processes`, `get_logs`, `search_logs`, `restart_process`.

### Multiple Config Files

Pass multiple config files to merge them. Processes are concatenated; the first config with `mcp` or `parent` wins:

```sh
bun run src/index.tsx base.jsonc overrides.jsonc
```

## JSON Schema

The schema file `kern.schema.json` provides editor autocompletion and validation. To regenerate it after changing the config format:

```sh
bun run generate:schema
```
