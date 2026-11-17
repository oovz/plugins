# Use Chrome DevTools MCP with WXT

Reuse the existing Chrome DevTools MCP server if it can inspect the target browser and perform the lifecycle operations you need. Enable the extension tools with `--categoryExtensions`. Use a dedicated development profile. Confirm `list_extensions` shows the intended build before using its extension ID for reloads or actions.

The server accepts local paths within negotiated MCP roots and its OS temporary directory. When the client supplies no applicable root and the server refuses the generated build path, add `--filesystemRoot=/absolute/path/to/wxt-output` to the server’s startup arguments. Limit the root to the authorized build directory or the output root that contains it. Restart the server after changing startup arguments. [Chrome DevTools MCP configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)

If the MCP server cannot use WXT’s browser, keep the watcher running and load its unpacked output in a browser instance you can inspect. Check the installed MCP server’s supported Chrome versions and connection modes before attaching to a running WXT browser. [WXT browser startup](https://wxt.dev/guide/essentials/config/browser-startup)
