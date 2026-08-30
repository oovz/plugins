# Chrome DevTools MCP extension troubleshooting and harness setup

---

## 1. Required MCP server configuration

Extension testing requires Chrome DevTools MCP configured with:
1. `--categoryExtensions`: Enables extension-specific tools (`list_extensions`, `install_extension`, `reload_extension`, `trigger_extension_action`, `uninstall_extension`).
2. `--allowUnrestrictedPaths`: Allows Chrome DevTools MCP to load extensions from local project directories when the roots capability is not negotiated.

### Canonical command
```bash
npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths
```

---

## 2. Check first, then configure

Before configuring anything, check whether a Chrome DevTools MCP server is already set up for your harness. It is commonly installed under the name `chrome-devtools` or `chrome-devtools-mcp`, with or without the flags above. Follow these rules:

1. If a server is already configured, update that existing entry so both flags are present; do not add a second entry under another name.
2. Only add a new entry when no existing server is present.
3. Never run two Chrome DevTools MCP instances: multiple instances contend for the same default Chrome profile and for any shared debugging port, which causes connection failures.

Each harness section below gives the exact check command or file location first, then the add/update instructions.

### A. Claude Code

Check whether the server is already configured:

```bash
claude mcp list
claude mcp get chrome-devtools   # details and connection status for one server
```

If it is missing, add it. The `--` separates Claude's own options from the server command; `--scope` selects `local`, `project`, or `user` configuration:

```bash
claude mcp add --scope local chrome-devtools -- npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths
```

If an existing entry lacks the flags, remove and re-add it (`claude mcp remove chrome-devtools`), or edit the entry in `~/.claude.json` (user) or the project `.mcp.json`. Inside a Claude Code session, `/mcp` shows configured servers and connection status.

### B. OpenAI Codex

Check whether the server is already configured:

```bash
codex mcp list
```

If it is missing, add it:

```bash
codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths
```

#### Plugin-bundled server

Installing the `chrome-extension-tester` Codex plugin bundles a plugin-scoped server from `.mcp.json` under the same name. If you already run your own Chrome DevTools MCP server, disable the bundled copy instead of running two instances:

```toml
[plugins."chrome-extension-tester@otto-plugins".mcp_servers.chrome-devtools]
enabled = false
```

#### Windows 11

Inside the Codex sandbox, the `npx` command shim may fail to start the server, and the default 10-second startup timeout is too short for the first `npx -y` download. Use the `cmd /c` form and raise the timeout, as recommended by the upstream chrome-devtools-mcp guidance:

```toml
[mcp_servers.chrome-devtools]
command = "cmd"
args = ["/c", "npx", "-y", "chrome-devtools-mcp@latest", "--categoryExtensions", "--allowUnrestrictedPaths"]
env = { SystemRoot = "C:\\Windows", PROGRAMFILES = "C:\\Program Files" }
startup_timeout_sec = 20
```

The bundled Codex plugin config (`.mcp.json`) ships the portable `npx` form; on Windows 11 replace it with the `cmd /c` form above after installation, or configure the server in `config.toml` instead.

### C. Cursor 2.5+

Cursor has no MCP management CLI. Check the MCP configuration files instead:

- Project: `.cursor/mcp.json`
- User/global: `~/.cursor/mcp.json`

Cursor's MCP settings UI (Customize) also lists configured servers. If the server is missing, add an entry to either file (or through the settings UI):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--categoryExtensions",
        "--allowUnrestrictedPaths"
      ]
    }
  }
}
```

### D. OpenCode

Check whether the server is already configured:

```bash
opencode mcp list
```

If it is missing, add it through `opencode.json` (project) or `~/.config/opencode/opencode.json` (user). The `command` must be a string array:

```json
{
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "chrome-devtools-mcp@latest",
        "--categoryExtensions",
        "--allowUnrestrictedPaths"
      ]
    }
  }
}
```

Alternatively, run `opencode mcp add chrome-devtools` and complete the interactive prompt.

### E. Oh My Pi (`omp`)

omp has no MCP management CLI. Check the MCP configuration files instead:

- Project: `.omp/mcp.json`
- User/global: `~/.omp/agent/mcp.json`

If the server is missing, add an entry to either file:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--categoryExtensions",
        "--allowUnrestrictedPaths"
      ]
    }
  }
}
```

Restart the omp session so the new server is discovered.

### F. Gemini CLI

Check whether the server is already configured:

```bash
gemini mcp list
```

If it is missing, add it (`-s` selects the configuration scope; `project` is the default):

```bash
gemini mcp add -s project chrome-devtools npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths
```

For a user-global server, use `-s user`. If an existing entry lacks the flags, remove and re-add it (`gemini mcp remove chrome-devtools`).

### G. Antigravity

Antigravity has no MCP management CLI. Check the MCP configuration files instead:

- Project/workspace: `.agents/mcp_config.json`
- User/global: `~/.gemini/config/mcp_config.json`

If the server is missing, add an entry to either file:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--categoryExtensions",
        "--allowUnrestrictedPaths"
      ]
    }
  }
}
```

Restart the CLI session or use the interactive `/mcp` manager to reload server configurations.

---

## 3. Update an existing MCP server

If `chrome-devtools` or `chrome-devtools-mcp` is already installed in your harness without `--categoryExtensions`:

1. Keep one server instance. A second server under another name, such as `chrome-devtools-2`, competes for the default Chrome profile and any shared debugging port.
2. Update the existing server:
   - Locate the existing entry in your harness configuration (use the check command or file for your harness in §2).
   - Add both `--categoryExtensions` and `--allowUnrestrictedPaths` to the `args` list.
   - Save the file and restart/reload the harness session.

---

## 4. Common diagnostics

### Extension tools are missing
If `install_extension`, `list_extensions`, `reload_extension`, and `trigger_extension_action` are absent:
1. Verify `--categoryExtensions` is present in the server's CLI args.
2. If the server connects to an existing Chrome via `--browserUrl`, `--wsEndpoint`, or `--autoConnect`, extension tools require Chrome 149 or newer; Chrome 149 (released June 2026) added extension-tool support for those connection modes. On older Chrome they are available only on the pipe/stdio connection used when the server launches its own Chrome instance.
3. Restart the harness after updating the config.

### A second Chrome browser opens
This is expected when the server manages its own dedicated Chrome profile over the stdio/pipe connection. If you prefer to attach to an existing Chrome instead, use `--browserUrl`, `--wsEndpoint`, or `--autoConnect` with Chrome 149+. Note that attaching to a personal browsing profile exposes that session to the MCP client, so a dedicated test profile remains the recommended isolation.

### The extension is already installed
Use `list_extensions`, match the extension by ID/name, and prefer `reload_extension`. Avoid repeated `install_extension` calls unless the path changed.

### Side panel does not appear after triggering action
1. Verify `side_panel.default_path` exists in the generated `manifest.json`.
2. Check if the extension calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
3. Check whether the extension requires an in-page click or context menu rather than the toolbar action.
4. Reproduce the real user interaction path. Do not replace it with direct navigation to the side-panel HTML.

### Content script is missing after extension reload
Reloading an unpacked extension invalidates existing content-script execution contexts. Reload or re-navigate the target webpage after `reload_extension` so the content script is reinjected.

### Stale element UID
Call `take_snapshot` to get fresh accessibility tree UIDs before interacting with elements.
