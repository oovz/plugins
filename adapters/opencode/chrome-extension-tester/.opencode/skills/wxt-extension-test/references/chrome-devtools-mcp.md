# Chrome DevTools MCP setup for WXT

The WXT smoke suite requires one Chrome DevTools MCP server with extension tools and permission to load the local unpacked build:

```text
npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths
```

Before adding a server, check the harness's existing MCP entries. Update an existing `chrome-devtools` or `chrome-devtools-mcp` entry so it has both flags; do not start a second server because two instances can contend for the same Chrome profile or debugging port. Restart the harness session after changing the entry.

Common setup commands are:

- Claude Code: `claude mcp list`, then `claude mcp add --scope local chrome-devtools -- npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths`.
- Codex: `codex mcp list`, then `codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths`.
- Gemini CLI: `gemini mcp list`, then `gemini mcp add -s project chrome-devtools npx -y chrome-devtools-mcp@latest --categoryExtensions --allowUnrestrictedPaths`.

For harnesses without an MCP management command, edit the documented project or user MCP JSON and add one `chrome-devtools` entry with the same command and flags. On Windows, a Codex configuration may need `cmd /c npx ...` and a longer startup timeout when the first `npx` download is slow.

Verify the connection exposes `list_extensions`, `install_extension`, `reload_extension`, `trigger_extension_action`, and `uninstall_extension` before loading the generated WXT directory. Use a dedicated test profile when the server launches Chrome; attaching to a personal profile exposes that browsing session to the MCP client.
