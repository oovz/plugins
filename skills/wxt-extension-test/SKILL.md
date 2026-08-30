---
name: wxt-extension-test
description: Build, test, reproduce, verify, or debug a WXT-based Chrome extension using Chrome DevTools MCP in the actual extension runtime. Use when package.json depends on wxt or the repository contains wxt.config.* / WXT entrypoints. Handles WXT output discovery, generated manifests, sidepanel entrypoints, extension reloads, content-script reinjection, and real Chrome side-panel/popup testing.
---

# WXT Chrome Extension Test

Use this skill for WXT repositories. Apply the same real-surface rule as the general Chrome extension skill: a side panel or popup is not integration-tested if its HTML was merely opened as a normal tab.

## 1. Detect the WXT layout

Inspect:

- `package.json` scripts and dependencies;
- `wxt.config.ts` / `wxt.config.js`;
- `web-ext.config.ts` if present;
- `entrypoints/` or a configured `srcDir` / entrypoints directory;
- generated output manifests under the configured `outDir`.

WXT generates `manifest.json`; do not expect a source manifest to be authoritative.

Useful source indicators include:

- `entrypoints/background.*`;
- `entrypoints/*.content.*`;
- `entrypoints/popup/` or `popup.html`;
- `entrypoints/sidepanel/` or `sidepanel.html`;
- `defineBackground`, `defineContentScript`, and WXT browser APIs.

## 2. Resolve the actual Chrome build directory

Do not hardcode `.output/chrome-mv3`. WXT defaults to `.output`, but `outDir`, target browser, manifest version, and mode suffix are configurable.

Run:

```bash
node scripts/find-extension-build.mjs .
```

Prefer a candidate that:

- contains a valid generated `manifest.json`;
- targets Chrome/Chromium;
- matches the intended manifest version;
- is the build produced by the command you just ran.

Then inspect it:

```bash
node scripts/inspect-extension.mjs /absolute/path/to/wxt-build
```

Locate these helper scripts in the `scripts/` directory relative to this `SKILL.md`.

## 3. Build with the repository's established WXT command

Prefer package scripts such as `build`, `build:chrome`, or an equivalent existing command. If none exists, use the installed WXT CLI in the repository rather than a global install.

For acceptance testing, a normal Chrome build is the simplest reliable artifact to load through Chrome DevTools MCP.

Do not automatically rewrite `web-ext.config.ts` or WXT browser-startup settings. WXT may open its own browser during dev mode; the Chrome DevTools MCP instance used by this plugin is the authoritative browser for these tests.

If the user explicitly wants WXT dev/HMR plus MCP testing, keep WXT's build/dev watcher and MCP's Chrome as separate responsibilities. Ensure the unpacked directory loaded by MCP is the directory WXT is updating.

## 4. Install and test the generated extension

If the extension tools are unavailable in the session, configure the Chrome DevTools MCP server first: check whether one is already configured for your harness and update it in place (see the general `chrome-extension-test` skill's `references/troubleshooting.md`, section 2) instead of adding a duplicate server.

Use Chrome DevTools MCP:

1. `list_extensions`;
2. `install_extension` with the absolute WXT build directory;
3. record the extension ID;
4. open a representative webpage if content scripts are involved;
5. use `trigger_extension_action` for the extension action;
6. interact with the real popup/side panel context, if exposed;
7. inspect console, network, content-script effects, and MV3 worker logs.

### WXT side panel

If the generated manifest contains `side_panel.default_path`, verify the panel through its real opening path. Do not navigate directly to that generated HTML for integration acceptance.

WXT automatically generates/augments extension manifest data from entrypoints and config, so use the generated manifest to determine what Chrome actually receives.

## 5. Iterate after source changes

For each fix:

1. rebuild or wait for the WXT watcher to finish;
2. confirm the unpacked output changed;
3. `reload_extension`;
4. reload the normal webpage when content scripts need reinjection;
5. reopen the side panel/popup through the product-real browser flow;
6. rerun the failing interaction;
7. check extension-page and service-worker diagnostics again.

WXT content-script contexts can become invalid when an extension is reloaded. Treat a stale page after extension reload as suspect and refresh it before concluding the fix failed.

## 6. WXT-specific acceptance checks

Add these to the general extension smoke suite when applicable:

- generated manifest contains the intended WXT entrypoints and permissions;
- sidepanel entrypoint produces `side_panel.default_path` in the generated Chrome manifest;
- WXT aliases/env-dependent code behaves in the built extension, not only in unit tests;
- content script injects on the configured match patterns;
- background entrypoint/service worker survives the tested message flow;
- extension reload does not leave the tested page in an invalidated content-script state;
- the actual side panel is reopened after reload before UI assertions.

## Reporting

Include:

- WXT version when readily available from the lockfile/package metadata;
- command used to build;
- resolved generated extension directory;
- extension ID;
- relevant generated manifest fields;
- `REAL_SURFACE` versus `HTML_ONLY` provenance;
- test steps and runtime evidence.

Read `references/wxt-notes.md` when build-output or browser-startup behavior is ambiguous.
