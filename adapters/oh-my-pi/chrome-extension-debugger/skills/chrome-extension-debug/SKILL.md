---
name: chrome-extension-debug
description: Develop and debug a Chrome extension in a live browser. Use for loading or reloading unpacked builds, tracing popup or side-panel interactions, diagnosing content scripts, and inspecting Manifest V3 service workers.
---

# Chrome Extension Debugging

Iterate on the extension in a dedicated Chrome development profile. Use Playwright Test for automated browser regressions and CI. The [Playwright extension guide](https://playwright.dev/docs/chrome-extensions) shows how to load an unpacked extension in a persistent Chromium context and discover its ID from the service worker.

## Load the build you're developing

1. Identify the project’s package manager, development and build commands, and unpacked Chrome output. For WXT, use `wxt-extension-debug` when available to resolve the generated build and choose a watcher or rebuild loop.
2. Start the existing watcher or run the project’s Chrome build. Inspect the `manifest.json` at the root of that output for Manifest V3, the configured action or side-panel path, the worker entrypoint, and content-script match patterns and permissions relevant to the task.
3. If the output is ambiguous, run the helper commands below from this skill’s directory. Pass `--output <directory>` to select a known build. Check `compatible: true` and confirm the selected output came from the current command before loading it.

   ```sh
   node scripts/find-extension-build.mjs /absolute/path/to/project
   node scripts/inspect-extension.mjs /absolute/path/to/unpacked-extension
   ```

4. Use the available browser tools that can reach the failing interaction. Chrome DevTools MCP can install, list, reload, and trigger the extension action. With Chrome UI access, enable Developer mode in `chrome://extensions` and use **Load unpacked**, **Reload**, and **Inspect views**. Record the Chrome profile, build path, and extension ID. Read [MCP setup and troubleshooting](references/troubleshooting.md) if MCP tools are missing or the build path is refused.

## Reproduce, inspect, edit, and reload

1. For content scripts or features tied to the active tab, open a representative page that matches the generated manifest. Use a local fixture when it can reproduce the behavior. Record the steps and observed behavior, or define the expected behavior for a new feature.
2. Open the affected surface through the actual product interaction when popup or side-panel integration matters. Read [Chrome surfaces and diagnostics](references/surfaces.md) for opening paths, message tracing, and worker restart checks.
3. Inspect the context responsible for the symptom. Trace a message across its sender, worker or content-script listener, and visible result. Use the browser’s console, breakpoints, or targeted logging to find the first unexpected result.
4. After editing source, wait for the watcher or rebuild. Confirm the updated bundles landed in the loaded directory. Reload the extension when the watcher has not applied the change, refresh affected webpages to reestablish content-script contexts, and reopen the popup or panel. Repeat the same interaction and inspect the relevant diagnostics again.
5. For bugs involving worker memory, initialization, alarms, messages, or persisted state, exercise a real wake-up after stopping the service worker. Follow the [restart procedure](references/surfaces.md#check-service-worker-restart).

Report the build path, extension ID, reproduction steps, and observed result. Name the context you checked: the browser-managed surface, a directly opened extension page, or a web preview. If the tools cannot reach a requested context, report that part as unverified and continue with the diagnostics you can perform.
