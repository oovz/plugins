# Chrome Extension Tester plugin

Agentic testing/debugging workflow for Chrome extensions using **Chrome DevTools MCP** with extension tooling enabled. Includes a WXT-aware skill.

## What it enforces

- Loads the unpacked extension through Chrome DevTools MCP.
- Uses `trigger_extension_action` for browser-action flows.
- Distinguishes `REAL_SURFACE` from `HTML_ONLY` tests.
- Does not treat direct navigation to a side-panel or popup HTML file as proof that Chrome's browser-managed surface works.
- Checks extension-page UI, content scripts, MV3 service-worker diagnostics, and relevant network/console behavior.
- Detects WXT output instead of hardcoding `.output/chrome-mv3`.

## Chrome DevTools MCP server setup

The plugin's Codex integration bundles a Chrome DevTools MCP server entry (`.mcp.json`) configured with:

```text
npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths
```

Requirements: Node.js LTS, npm/npx, and a supported Google Chrome / Chrome for Testing installation.

Before setting anything up, check whether the server is already configured for your harness — it is commonly installed under the name `chrome-devtools` or `chrome-devtools-mcp`. Update an existing entry in place so both flags are present; add a new entry only when no server exists. Never run two Chrome DevTools MCP instances: they contend for the same default Chrome profile and shared debugging ports.

- If you use the Codex plugin and already run your own Chrome DevTools MCP server, disable the plugin's bundled copy instead of running both: `[plugins."chrome-extension-tester@otto-plugins".mcp_servers.chrome-devtools] enabled = false` in your Codex config.
- Harness-specific check commands, file locations, and setup instructions are in `skills/chrome-extension-test/references/troubleshooting.md`. On Windows 11, Codex users should use the `cmd /c npx` server form documented there.

## Skills

- `chrome-extension-test`: general Chrome extension runtime testing.
- `wxt-extension-test`: WXT build/output/reload workflow plus real-surface testing.

## Useful prompts

```text
Use chrome-extension-test to smoke-test this extension. The side panel must be tested as the real Chrome side panel, not by opening its HTML in a tab.
```

```text
Use wxt-extension-test to reproduce the side-panel bug, fix it, rebuild the WXT extension, reload it, and verify the same real browser flow.
```

```text
Test the popup, content script, and MV3 service-worker message flow. Report REAL_SURFACE vs HTML_ONLY provenance for each UI assertion.
```

## Helper scripts

Each skill includes self-contained helper scripts under its `scripts/` directory:

Find likely unpacked build directories:

```bash
node scripts/find-extension-build.mjs /path/to/project
```

Inspect generated extension surfaces:

```bash
node scripts/inspect-extension.mjs /path/to/unpacked-extension
```

## Upstream references

- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Chrome DevTools MCP tool reference: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- WXT: https://wxt.dev/
- WXT browser startup: https://wxt.dev/guide/essentials/config/browser-startup
- WXT manifest generation: https://wxt.dev/guide/essentials/config/manifest
