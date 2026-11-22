---
name: browser-extension-debug
description: Debug live browser extensions in Chrome, Edge, Firefox, or macOS Safari. Use for selecting unpacked builds, loading and reloading extensions, reproducing toolbar or panel interactions, and inspecting content scripts and background contexts across browsers.
---

# Browser Extension Debugging

1. Identify the requested browsers and the project's build commands. Use Chrome for an unspecified browser unless the project targets a different one. For several browsers, run the same reproduction separately against each browser's build. Use `wxt-extension-debug` for WXT's generated output and hot reload.
2. Build for the selected browser and inspect the generated manifest. From this skill's directory, use the commands below with `chrome`, `edge`, `firefox`, or `safari`. Pass `--output <directory>` when the build command identifies a specific output. Confirm the candidate came from that command and has `compatible: true`. The helper checks directory labels, manifest version, and common background requirements. Confirm API support and installation in the target browser.

   ```sh
   node scripts/find-extension-build.mjs /absolute/path/to/project --browser firefox
   node scripts/inspect-extension.mjs /absolute/path/to/unpacked-build
   ```

3. Read the selected browser's setup and shutdown procedure before opening a session.

   | Browser | Setup and diagnostic branch |
   |---|---|
   | Chrome or Edge | [Chrome DevTools CLI, MCP setup, and native fallback](references/chromium.md). For popups, side panels, and worker restart, use [Chromium extension surfaces](references/surfaces.md). |
   | Firefox | [Firefox MCP, web-ext, and Add-on Debugger](references/firefox.md). |
   | Safari on macOS | [Temporary extensions and Web Inspector](references/safari.md). |

4. Record the build path, extension ID when available, and the session owner. Navigate to a matching page or local fixture. Exercise the actual toolbar action, panel gesture, or other product entry point when the bug depends on browser integration. Inspect the console or debugger in the context responsible for the symptom and trace messages to their receiver.
5. After changes, confirm the generated bundles landed in the loaded directory. Reload or reinstall as the browser requires, refresh pages that host content scripts, and reopen the surface. Repeat the original interaction and record the result. For background lifecycle bugs, observe the browser wake the relevant background context without a full extension reload.

## Finish the session

Collect diagnostics before teardown. On success, failure, or a blocked reproduction, run the shutdown procedure for every browser started for the task and confirm it exited. Stop task-owned watchers and development servers. For a borrowed session, remove only the test extension installs, tabs, and windows you added. Keep resources open only when the user asks, and identify them in the handoff.

Report the build and observed result for each requested browser. Name the surface you exercised, such as a toolbar popup, a directly opened extension page, or a web preview. Report any missing coverage or incomplete shutdown.
