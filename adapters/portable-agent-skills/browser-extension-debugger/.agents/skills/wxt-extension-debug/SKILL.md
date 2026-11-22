---
name: wxt-extension-debug
description: Debug WXT extensions in Chrome, Edge, Firefox, or macOS Safari. Use for browser-specific generated manifests, WXT watchers and hot reload, and stale content-script or background contexts.
---

# WXT Extension Debugging

1. Identify the requested browser or browsers, the project's package manager, WXT version, scripts, and `wxt.config.*`. Use Chrome for an unspecified browser unless the project targets a different one. Run the project equivalent of `wxt -b <browser>` for live iteration or `wxt build -b <browser>` for a production reproduction. For macOS Safari, build the Safari output and load it manually. Read [WXT output and browser startup](references/wxt-notes.md) for browser configuration and HMR recovery.
2. Confirm the build directory reported by WXT. Use these helpers from this skill's directory if the output is ambiguous. Pass `--output <directory>` to select a known path, check `compatible: true`, and verify that the path belongs to the current command.

   ```sh
   node scripts/find-extension-build.mjs /absolute/path/to/project --browser firefox
   node scripts/inspect-extension.mjs /absolute/path/to/wxt-build
   ```

3. Inspect the generated manifest's action, side panel or sidebar, background entrypoint, and content-script match patterns relevant to the issue. Trace incorrect generated values to their WXT entrypoint, config, module, or build hook.
4. Use [the WXT browser notes](references/wxt-notes.md#load-the-generated-extension) to debug in the WXT browser or load into a dedicated session. When available, use `browser-extension-debug` to choose the backend and inspect browser-specific surfaces. For multiple browsers, record the WXT command, output, and browser separately.
5. Reproduce on a matching webpage and through the real toolbar or panel interaction when relevant. After editing, confirm WXT wrote the updated bundles. Reload the extension when HMR did not apply the change, refresh affected webpages to recreate content-script contexts, and reopen the surface. Replay the interaction and inspect the context that owns the behavior. For background lifecycle issues, trigger the normal browser event and observe recovery without a full extension reload.

Before reporting success, failure, or a blocker, stop any WXT watcher or other server started for the task and confirm its browser exited. Close other task-owned browser sessions using their backend's shutdown procedure. In a borrowed browser remove only test resources you added. Keep the watcher or browser running when the user explicitly asks. Report the build, surface exercised, result, and any incomplete cleanup for each browser.
