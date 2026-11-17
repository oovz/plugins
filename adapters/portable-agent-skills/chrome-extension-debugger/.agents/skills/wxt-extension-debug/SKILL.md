---
name: wxt-extension-debug
description: Develop and debug a WXT Chrome extension in a live browser. Use for generated Chrome builds, WXT watchers and hot reload, browser-managed surfaces, and stale content-script contexts.
---

# WXT Extension Debugging

Use WXT’s generated Chrome manifest to determine what runs in the browser. Use Playwright Test for automated browser regressions and CI. [WXT end-to-end testing guide](https://wxt.dev/guide/essentials/e2e-testing)

## Start the right WXT loop

1. Inspect the project’s scripts, WXT version, `wxt.config.*`, entrypoints, and any browser-startup configuration. Use the project’s Chrome dev script for live iteration or its Chrome build command for a reproduction involving packaged output. Read [WXT output and browser startup](references/wxt-notes.md) when the mode or browser differs from what you expected.
2. Find the unpacked Chrome Manifest V3 output from that command. If the path is ambiguous, run the helper commands from this skill’s directory. Use `--output <directory>` when configuration and build output identify a specific candidate. Confirm the result has `compatible: true` and came from the command you ran.

   ```sh
   node scripts/find-extension-build.mjs /absolute/path/to/project
   node scripts/inspect-extension.mjs /absolute/path/to/wxt-build
   ```

3. Inspect the generated manifest fields relevant to the bug. Check `side_panel.default_path`, `action.default_popup`, worker entrypoint, content-script matches, permissions, or build-mode settings as applicable. Trace an incorrect manifest entry back to the WXT config, entrypoint, module, or build hook that produced it.
4. Use the WXT-started browser when your tools can inspect it. Otherwise load the unpacked output in a dedicated Chrome profile you control, using **Load unpacked** in `chrome://extensions` or the available extension lifecycle tools. Use [Chrome DevTools MCP setup](references/chrome-devtools-mcp.md) if you need those tools. Record which browser loaded the build, its path, and the extension ID.

## Reproduce and iterate

1. Open the target webpage for tab-dependent behavior, then use the real toolbar action or product gesture if the issue concerns a browser-managed popup or side panel. Follow messages across the UI, content script, and worker as applicable. Inspect the specific extension or tab console and check what the user observes.
2. Change the source entrypoint or config responsible for the behavior. Wait for WXT to finish and confirm the generated output reflects the edit. Reload the extension when HMR did not apply the change, refresh affected webpages for content-script injection, and reopen the popup or side panel. Replay the same interaction.
3. For worker-lifecycle bugs, close any debugger attached to the worker, confirm the worker stops, then trigger the normal event and observe recovery. Use Chrome’s **Application → Service Workers** controls when available. [Chrome’s extension debugging guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug#check-the-service-worker-status)

Report the WXT command, the generated build and relevant manifest fields, extension ID, and observed result. Distinguish a browser-managed popup or panel, a directly opened extension page, and a web preview so the user knows which interaction you verified.
