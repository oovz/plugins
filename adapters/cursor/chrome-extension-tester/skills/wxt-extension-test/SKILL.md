---
name: wxt-extension-test
description: Test or debug Chrome runtime behavior in WXT extension projects. Use for generated builds, browser-managed surfaces, and reload or content-script failures.
---

# WXT Chrome Extension Test

Use this self-contained workflow when the extension repository uses WXT. Testing and diagnosis stay within their requested scope; a requested fix includes rebuilding and retesting.

Classify each UI check as `REAL_SURFACE` when Chrome opens the actual surface through the product flow, or `HTML_ONLY` for direct page navigation. Only `REAL_SURFACE` evidence establishes popup or side-panel integration.

## 1. Detect the WXT layout

Inspect:

- `package.json` scripts and dependencies;
- `wxt.config.ts` / `wxt.config.js`;
- `web-ext.config.ts` if present;
- `entrypoints/` or a configured `srcDir` / entrypoints directory;
- generated output manifests under the configured `outDir`.

Use WXT’s generated `manifest.json` as the runtime authority.

## 2. Resolve the actual Chrome build directory

Discover the generated directory from the build and configuration. Read [WXT output notes](references/wxt-notes.md) when `outDir`, target browser, manifest version, or mode makes the output ambiguous.

Run from this skill directory (the directory containing `SKILL.md`) and pass the WXT project path:

```bash
node scripts/find-extension-build.mjs /absolute/path/to/project
```

Prefer a candidate that:

- contains a valid generated `manifest.json`;
- targets Chrome/Chromium;
- uses Manifest V3, required by current Chrome;
- is the build produced by the command you just ran.

Require the helper result to have `compatible: true`, including for an explicit `--output` selection. Then inspect it:

```bash
node scripts/inspect-extension.mjs /absolute/path/to/wxt-build
```

Locate these helper scripts in the `scripts/` directory relative to this `SKILL.md`.

## 3. Build with the repository's established WXT command

Prefer package scripts such as `build`, `build:chrome`, or an equivalent existing command. If none exists, use the installed WXT CLI in the repository rather than a global install.

For acceptance testing, load a normal Chrome build through Chrome DevTools MCP.

Preserve existing WXT browser-startup settings. Use the MCP-managed Chrome as the authoritative test browser; read [WXT browser ownership](references/wxt-notes.md) when a separate dev browser causes ambiguity.

If the user explicitly wants WXT dev/HMR plus MCP testing, keep WXT's build/dev watcher and MCP's Chrome as separate responsibilities. Load the unpacked directory that WXT is updating.

## 4. Install and test the generated extension

Confirm the session exposes `list_extensions`, `install_extension`, `reload_extension`, `trigger_extension_action`, and `uninstall_extension`. If tools are missing, read [MCP setup](references/chrome-devtools-mcp.md), reuse the existing server entry, and keep configuration changes within authorized setup scope.

Use Chrome DevTools MCP:

1. `list_extensions`;
2. `install_extension` with the absolute WXT build directory, or `reload_extension` when already installed;
3. record the extension ID;
4. open a representative webpage if content scripts are involved;
5. use `trigger_extension_action` for the extension action;
6. select the resulting popup/side-panel context, verify its extension ID, and interact using fresh snapshots;
7. inspect console, network, content-script effects, and MV3 worker logs.

### WXT side panel

If the generated manifest contains `side_panel.default_path`, trigger the configured action or product user gesture that opens it, then select the resulting context. If the real context is unavailable, report integration as unverified; direct HTML diagnostics remain `HTML_ONLY`.

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

For smoke testing, cover the applicable checks below. For focused debugging, cover the failing interaction and affected boundaries, plus required repository gates. Report any requested coverage left untested:

- generated manifest contains the intended WXT entrypoints and permissions;
- sidepanel entrypoint produces `side_panel.default_path` in the generated Chrome manifest;
- WXT aliases and environment-dependent code behave in the built extension, with unit tests as supporting coverage;
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

Use a dedicated test profile when available. Preserve unrelated extensions, profile data, and accounts.
