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

## Keyboard Shortcuts

All keyboard shortcuts can be customized via `~/.kern/config.json` (see [User Config](#user-config) below). The defaults are:

| Key | Action |
|-----|--------|
| `Up` / `Down` | Select process |
| `/` | Search logs (highlights matches, jumps to first) |
| `Enter` | Close search input (keep highlights) |
| `n` / `Enter` | Jump to next match |
| `b` | Jump to previous match |
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
kern base.jsonc overrides.jsonc
```

## User Config

kern supports a user-level configuration file at `~/.kern/config.json` for customizing keybindings and theme colors. All fields are optional — missing values use defaults.

```jsonc
{
  "$schema": "./schemas/config.schema.json",
  "theme": "default",
  "keybindings": {
    "quit": "q",
    "forceQuit": "ctrl+c",
    "selectPrevious": "up",
    "selectNext": "down",
    "search": "/",
    "searchNext": "n",
    "searchPrevious": "b",
    "searchClose": "return",
    "searchClear": "escape",
    "restart": "r",
    "copyLogs": "c"
  }
}
```

### Keybindings

Override any keybinding by setting it to a key name string. Modifier keys are supported with `+` syntax:

- Simple keys: `"q"`, `"r"`, `"/"`, `"n"`, `"escape"`, `"return"`, `"up"`, `"down"`
- With modifiers: `"ctrl+c"`, `"ctrl+r"`, `"shift+n"`, `"meta+q"`

Only the keybindings you specify are overridden — the rest keep their defaults.

### Themes

Themes control the UI colors. They live in `~/.kern/themes/` as JSON files. On first run, kern creates `~/.kern/themes/default.json` automatically.

Set the active theme in your config:

```jsonc
{
  "theme": "monokai"
}
```

This loads `~/.kern/themes/monokai.json`. To create a custom theme, copy the default and edit it:

```sh
cp ~/.kern/themes/default.json ~/.kern/themes/monokai.json
```

A theme file looks like:

```jsonc
{
  "$schema": "../schemas/theme.schema.json",
  "name": "My Theme",
  "colors": {
    "borderColor": "#444444",
    "mutedText": "#6b7280",
    "selectedBackground": "#333333",
    "statusRunning": "#22c55e",
    "statusStarting": "#eab308",
    "statusStopping": "#f97316",
    "statusStopped": "#6b7280",
    "statusCrashed": "#ef4444",
    "stderrText": "#ef4444",
    "searchRegexIndicator": "#3b82f6",
    "searchTextIndicator": "#eab308",
    "searchMatchBackground": "#2a2a00",
    "searchCurrentMatchBackground": "#3a3a00",
    "searchCurrentMatchText": "#eab308",
    "statusMessageText": "#22c55e",
    "versionText": "#555555",
    "updateAvailableText": "#eab308"
  }
}
```

All color fields are optional — missing values fall back to the defaults above.

### Color Reference

| Color | Default | Used For |
|-------|---------|----------|
| `borderColor` | `#444444` | Sidebar and status bar borders |
| `mutedText` | `#6b7280` | Placeholder text, hints, muted labels |
| `selectedBackground` | `#333333` | Highlighted process row background |
| `statusRunning` | `#22c55e` | Running process dot |
| `statusStarting` | `#eab308` | Starting process dot |
| `statusStopping` | `#f97316` | Stopping process dot |
| `statusStopped` | `#6b7280` | Stopped process dot |
| `statusCrashed` | `#ef4444` | Crashed process dot and name |
| `stderrText` | `#ef4444` | Stderr log lines |
| `searchRegexIndicator` | `#3b82f6` | Search `/` indicator (regex mode) |
| `searchTextIndicator` | `#eab308` | Search `/` indicator (text mode) |
| `searchMatchBackground` | `#2a2a00` | Matching log line background |
| `searchCurrentMatchBackground` | `#3a3a00` | Current match background |
| `searchCurrentMatchText` | `#eab308` | Current match text color |
| `statusMessageText` | `#22c55e` | Status bar messages (e.g. "Logs copied!") |
| `versionText` | `#555555` | Version label in status bar |
| `updateAvailableText` | `#eab308` | "Update available" notice |

## Headless Mode

Run processes in the background without a TUI, then attach/detach like tmux.

### Start a headless session

```sh
kern --headless config.jsonc
```

This starts all processes in the background, prints session info, and stays alive. Multiple configs are supported:

```sh
kern --headless base.jsonc overrides.jsonc
```

### List active sessions

```sh
kern --list
```

Shows all running headless sessions with their IDs, ports, PIDs, and uptime.

### Attach to a session

```sh
kern --attach <session-id>
```

Opens the full TUI connected to the running headless daemon. Logs, search, and restart all work as normal.

- `q` — Detach (close TUI, daemon keeps running)
- `Ctrl+C` — Shut down the daemon and exit

### Stop a session

```sh
kern --stop <session-id>
```

Sends SIGTERM to the headless daemon, which gracefully stops all processes and exits.

## JSON Schema

The schema file `kern.schema.json` provides editor autocompletion and validation for process config files. Schema files for user config and themes are in the `schemas/` directory.
