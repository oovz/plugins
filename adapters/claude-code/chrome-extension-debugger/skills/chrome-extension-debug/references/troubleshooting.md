# Configure Chrome DevTools MCP for extension debugging

Use these steps when you need MCP extension lifecycle tools. Chrome’s extension management page and built-in DevTools can also handle interactive development.

## Enable the extension tools

Reuse the harness’s configured Chrome DevTools MCP server. Enable the extension category and restart the server or harness session:

```text
npx -y chrome-devtools-mcp@latest --categoryExtensions
```

The Codex plugin supplies this server entry. In other harnesses, use their MCP setup instructions to configure the command and arguments. For a server entry that launches through the Windows command interpreter, use `cmd /c npx -y chrome-devtools-mcp@latest --categoryExtensions`. Verify the session exposes the tools needed for the task, such as `install_extension`, `list_extensions`, `reload_extension`, or `trigger_extension_action`. Start with a dedicated server-managed Chrome profile. If attaching to an existing development browser, check the installed server’s compatibility with that Chrome version and connection mode. [Chrome DevTools MCP configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)

## Authorize the unpacked build directory

Use MCP roots supplied by the client when they cover the unpacked build. The server also allows tools to access its OS temporary directory. If `install_extension` refuses the path because the client lacks roots support or its roots exclude the generated build, add an explicit root for the authorized output directory. Restart the server after editing its startup arguments.

```text
npx -y chrome-devtools-mcp@latest --categoryExtensions --filesystemRoot="/absolute/path/to/unpacked-build"
```

For Codex users who need a custom server entry, disable the bundled instance before enabling the custom entry:

```toml
[plugins."chrome-extension-debugger@otto-plugins".mcp_servers.chrome-devtools]
enabled = false
```

Replace older `--allowUnrestrictedPaths` arguments with a root limited to the intended build. Use a directory containing the generated output if a watcher recreates the build directories under that root. Preserve unrelated profiles and extensions.

## Recover the debugging session

- If a second browser opens, identify which instance owns the installed extension by its profile, extension ID, and loaded directory. Continue in the instance your tools can inspect.
- If the build is already loaded, reload by its ID. If the unpacked path changed, load the new path and confirm the ID before using extension URLs.
- If a popup or side panel fails to open, check the configured route and active tab, then follow the [surface instructions](surfaces.md).
- If the content script disappears after reload, refresh the target webpage and confirm it matches the current manifest.
