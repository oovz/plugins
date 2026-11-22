# Debug Chrome and Edge extensions

## Start an isolated browser with a stop command

Use the Chrome DevTools CLI when you need to start Chrome or Edge for a task. It exposes the Chrome DevTools MCP tools and can stop the daemon and the browser it launched. Use a fresh session ID for each browser and task. Carry the same ID into every command, including cleanup. The examples use Chrome DevTools MCP 1.13.0, which supports `--session-id`.

```sh
node -p "require('node:crypto').randomBytes(8).toString('hex')"
npm exec --yes --package=chrome-devtools-mcp@1.13.0 -- chrome-devtools start --session-id=<id> --no-headless --isolated --categoryExtensions --filesystemRoot="/absolute/path/to/unpacked-build"
npm exec --yes --package=chrome-devtools-mcp@1.13.0 -- chrome-devtools install_extension "/absolute/path/to/unpacked-build" --session-id=<id>
```

Replace `<id>` with the generated ID. For Edge, add `--executablePath="/absolute/path/to/Microsoft Edge binary"` to `start`. Verify the executable and browser before loading the build. Extension tools depend on the browser version and its Extensions protocol support. Check installation and the relevant tool on the actual Edge instance. Use the native workflow below if the protocol operation fails.

Use `list_extensions` to confirm the ID. Run `reload_extension <extension-id>` after a rebuild and use `trigger_extension_action <extension-id>` or the browser toolbar to exercise the real action. Check the installed CLI's command help for tool syntax. Use a filesystem root scoped to the generated output, or to its parent when the build recreates that directory. [Chrome DevTools CLI](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/cli.md)

## Use an existing development browser or the native UI

If the harness already exposes Chrome DevTools MCP, use it with the intended development browser when its owner can close it. For a manual MCP entry, enable extension tools with `npx -y chrome-devtools-mcp@1.13.0 --categoryExtensions --isolated`. Confirm the session's tool list and browser. If the client does not negotiate a root that covers the build, add `--filesystemRoot=/absolute/path/to/unpacked-build` and restart the MCP server. For Edge attachment, check the dedicated profile and the documented connection options. [Chrome connection options](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md) · [Microsoft Edge MCP setup](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/devtools-mcp-server)

For native debugging, use Developer mode and **Load unpacked** in `chrome://extensions` or `edge://extensions`. Use **Reload** and the extension's inspection links after rebuilding. For a browser-managed surface the tool cannot inspect, use the actual browser toolbar and DevTools. [Chrome debugging guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug) · [Edge sideloading guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)

## Shut down

For each CLI session created for the task, stop it and check its status with the same ID. Run these commands even after a setup failure. A page tool call after `stop` can launch the browser again.

```sh
npm exec --yes --package=chrome-devtools-mcp@1.13.0 -- chrome-devtools stop --session-id=<id>
npm exec --yes --package=chrome-devtools-mcp@1.13.0 -- chrome-devtools status --session-id=<id>
```

If WXT or another task-owned launcher started the browser, stop that launcher and confirm the browser exited. For a task-owned browser opened through native UI or standalone MCP, quit the dedicated instance through its UI or stop the server that launched it, then confirm the browser exited. Chrome DevTools MCP's `close_page` only closes a tab. In a borrowed browser, close test tabs and remove the build only if you installed it during this task. Use the session ID to run `stop` if an interrupted CLI task leaves its browser open.
