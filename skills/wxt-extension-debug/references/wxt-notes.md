# WXT output and browser startup

WXT defaults to `.output`. Custom output directories, target browser, manifest version, and build mode can change the path. Use the output reported by the command you ran. Named compatible outputs rank ahead of shared output in the discovery helper. For a specific build or mode use `--output`. [WXT build CLI](https://wxt.dev/api/cli/wxt-build)

WXT generates its manifest from configuration, entrypoints, modules, and hooks. For example, inspect `side_panel.default_path` for Chrome or Edge, `sidebar_action.default_panel` for Firefox, and the generated background page or worker for the selected browser. [WXT manifest generation](https://wxt.dev/guide/essentials/config/manifest)

## Load the generated extension

When WXT starts a development browser, use that instance if you can inspect the requested surface. Confirm its loaded build and extension ID. WXT uses web-ext for browser startup. Set the Edge executable in `webExt.binaries.edge` when the installed version requires it. Use the project's existing startup settings and inspect the installed WXT version's browser options. [WXT browser startup](https://wxt.dev/guide/essentials/config/browser-startup)

If you need a separate browser, use the runtime procedure in `browser-extension-debug` when available. In a standalone WXT skill, load unpacked through `chrome://extensions` or `edge://extensions`, load the generated manifest as a temporary add-on through Firefox's `about:debugging`, or use **Safari → Settings → Developer → Add Temporary Extension** with the Safari output. Open the native DevTools for the extension surface. After rebuilding, reload the extension through its settings entry, then refresh the matching page. For Safari versions without temporary loading, run the project's Xcode extension app. [Apple's Safari extension installation guide](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)

If the watcher and debugger run separately, verify HMR after a source edit. When restarting the dev server disconnects HMR, reload the extension to reconnect and refresh pages with invalidated content-script contexts. Use a build command for reproductions that depend on production output.

## Stop the WXT loop

Stop the task-owned dev command with Ctrl+C or the process tool that started it. Confirm the browser WXT launched exited. If still open, quit that dedicated instance. For separately launched browsers, stop their launcher or quit their dedicated instance. In borrowed browsers, remove task-installed extensions and close task-opened tabs or windows.
