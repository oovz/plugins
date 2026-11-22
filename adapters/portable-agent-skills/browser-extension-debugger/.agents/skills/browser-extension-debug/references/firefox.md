# Debug Firefox extensions

## Load or reload the build

Use Mozilla's Firefox MCP server with a dedicated Firefox session. The Codex plugin supplies the server entry. On another MCP-compatible host, register `npx -y @mozilla/firefox-mcp@0.11.0 --tool-preset developer` as a stdio server. Check for `install_extension`, `list_extensions`, `uninstall_extension`, and `close_firefox_session` before starting. Install the unpacked build with `type: "path"`, the absolute directory as `path`, and the default temporary installation. Record the returned ID. After a rebuild, uninstall that temporary extension and install the new output. This can affect extension state, so use the native reload loop for a reproduction that needs to preserve state. [Mozilla Firefox MCP tools](https://github.com/mozilla/firefox-mcp/blob/v0.11.0/docs/tools.md)

For automatic reload during development, run `web-ext run --source-dir /absolute/path/to/firefox-build` using the project's installed web-ext command. For manual setup, open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**, then select the build's `manifest.json`. Use **Reload** on the extension's entry after rebuilding. [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) · [Firefox extension debugging](https://extensionworkshop.com/documentation/develop/debugging/)

## Inspect the extension

Use **Inspect** next to the extension in `about:debugging` for its Add-on Debugger. Open the action using Firefox's toolbar, or use the sidebar entry when the generated manifest has `sidebar_action`. Use the affected tab's DevTools to verify content-script execution and the extension toolbox for background messages. Firefox background code uses a page or scripts. A Chrome service worker entry alone does not run that code in Firefox. [Background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)

## Shut down

Call `close_firefox_session` as the final MCP tool call. It closes Firefox when MCP launched it and releases an attached session when Firefox was already running. In an attached browser, remove the add-on and close test tabs you added before the final call. If an open test dialog prevents shutdown, dismiss it and retry. Further Firefox page tool calls can open a new session.

Stop a task-owned web-ext runner with Ctrl+C and verify its Firefox exited. For a manual session, quit a dedicated browser launched for the task. If using an existing browser, remove the temporary add-on and close the windows or tabs you opened.
