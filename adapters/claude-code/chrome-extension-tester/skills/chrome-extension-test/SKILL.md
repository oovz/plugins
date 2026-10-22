---
name: chrome-extension-test
description: Test or debug Chrome extension runtime behavior through Chrome DevTools MCP, including browser-managed surfaces, content scripts, and service-worker interactions.
---

# Chrome Extension Test

Use Chrome DevTools MCP as the browser control plane. Keep source edits within the requested scope: testing and diagnosis produce evidence; a requested fix includes rebuilding and retesting.

## Establish the tool connection

Confirm the session exposes `list_extensions`, `install_extension`, `reload_extension`, `trigger_extension_action`, and `uninstall_extension`. If any is missing, read [MCP setup and troubleshooting](references/troubleshooting.md), section 2, to inspect the harness's existing server entry and required `--categoryExtensions` and `--allowUnrestrictedPaths` flags. Reuse an existing server; multiple instances can contend for the same Chrome profile or port. Keep configuration changes within the user's authorized setup scope and report unavailable capabilities.

## Test provenance

Classify every extension UI verification as one of these:

- `REAL_SURFACE`: Chrome opened the extension surface through the browser-managed flow being tested, such as `trigger_extension_action`, a user click that invokes `chrome.sidePanel.open`, or another product-real interaction.
- `HTML_ONLY`: the agent navigated directly to `chrome-extension://<id>/<page>.html` or served the UI as a normal web page.

Only `REAL_SURFACE` evidence can establish popup or side-panel integration. Label direct-page diagnostics `HTML_ONLY` and leave browser integration unverified.

## Workflow

### 1. Inspect the project before launching Chrome

Determine:

- whether this is a WXT project;
- the package manager and existing build/test scripts;
- the unpacked extension output directory containing `manifest.json`;
- the manifest version; current Chrome requires Manifest V3;
- configured surfaces: `action`, `side_panel`, `options_ui`, background service worker, and content scripts.

Use existing project scripts and dependencies. Report missing build prerequisites before expanding setup scope.

If build output is unclear, run the bundled helper from this skill directory (the directory containing `SKILL.md`) and pass the extension project path:

```bash
node scripts/find-extension-build.mjs /absolute/path/to/project
```

The helper prefers an explicitly selected output (`--output <directory>`), then a Chrome-compatible generated manifest, and uses recency only among compatible candidates. Require `compatible: true` before loading the selected build. Inspect `recommended` and its `browser`/`manifestCompatibility` fields:

```bash
node scripts/inspect-extension.mjs /absolute/path/to/unpacked-extension
```

Locate these helper scripts in the `scripts/` directory relative to this `SKILL.md`.

### 2. Build before install

If no valid unpacked build exists, run the repository's existing Chrome build command. For generic projects, infer the command from `package.json`, project docs, or build tooling rather than guessing.

Require a parseable `manifest.json` in the directory passed to `install_extension`.

### 3. Install or reload through Chrome DevTools MCP

Use extension tools in this order:

1. `list_extensions` to identify an existing installation.
2. `install_extension` with the absolute unpacked extension directory if not installed.
3. Record the extension ID.
4. After subsequent rebuilds, use `reload_extension` rather than reinstalling when possible.

Use the MCP extension tools for installation and reload while preserving Chrome profile files.

### 4. Establish a baseline tab

For extensions that operate on webpages, open or select a representative normal `https://` page first. Capture a baseline with `take_snapshot` and, when relevant, `list_console_messages` and `list_network_requests`.

Use a harmless local/test page when the product does not require a specific site.

### 5. Open the real extension surface

Read [surface opening and acceptance](references/surfaces.md) for the configured surface. Open it through the product's browser/user flow, select the resulting context, and verify its extension ID. If the tool cannot expose that context, stop the affected integration assertion and report the limitation. UI-only diagnostics can still proceed with `HTML_ONLY` provenance.

### 6. Interact like a user

For each page/context:

1. `take_snapshot` to obtain the current accessibility tree and UIDs.
2. Use UIDs from the latest snapshot/action response for `click`, `fill`, `type_text`, `press_key`, and similar tools.
3. Take a fresh snapshot after meaningful state changes or if a UID becomes stale.
4. Use `take_screenshot` for visual/layout validation, not as the primary mechanism for locating controls.
5. Use `evaluate_script` only for state that cannot be observed through normal UI or diagnostics. Exercise the tested user flow through its actual controls.

### 7. Observe all relevant extension contexts

Check, as applicable:

- side-panel/popup/extension-page console messages;
- MV3 service-worker console messages, using `serviceWorkerId` filters when Chrome DevTools MCP reports a worker ID;
- content-script effects on the active tab;
- network requests initiated by the selected extension page;
- storage/message-driven state through observable UI or targeted runtime inspection.

For messaging bugs, verify both ends of the flow rather than only the initiating UI.

### 8. Rebuild → reload → retest after fixes

After modifying source:

1. rebuild using the project's established command;
2. wait until the output `manifest.json` and bundles are updated;
3. `reload_extension`;
4. refresh/reopen the target webpage if content scripts require reinjection;
5. reopen the popup/side panel through the real browser flow;
6. rerun the failing steps;
7. inspect console/service-worker output again.

Confirm the fix by rerunning the available runtime reproduction; report static-only evidence when runtime access is unavailable.

## Minimum smoke suite

For a smoke-test request, run the applicable subset below. For a focused reproduction, select checks that cover the failing flow and affected boundaries; preserve any broader repository-required gate:

1. Extension installs and is enabled.
2. Background service worker starts without uncaught errors.
3. Browser action performs its configured behavior.
4. Side panel or popup opens through the real browser-managed flow.
5. Primary controls are keyboard/click operable.
6. Core happy-path action produces the expected visible result.
7. Content script injects/updates the intended page correctly.
8. UI ↔ service worker ↔ content script messaging works when used by the product.
9. No unexpected console errors occur during the flow.
10. Reloading the extension and reopening the surface leaves it usable.

## Reporting contract

Report:

- build directory and detected framework;
- extension ID;
- Chrome surface tested;
- provenance: `REAL_SURFACE` or `HTML_ONLY`;
- exact reproduction steps;
- observed versus expected behavior;
- console/service-worker/network evidence that materially explains failures;
- pass/fail per assertion;
- any assertion not actually tested.

A pass without provenance is incomplete for side-panel and popup integration tests.

## Safety and state

The MCP browser may contain cookies, extension storage, and page data. Avoid opening unrelated sensitive accounts. Do not delete unrelated installed extensions or profile data. Prefer a dedicated test profile managed by Chrome DevTools MCP.

## References

Read [troubleshooting](references/troubleshooting.md) when connection, target discovery, reload, or diagnostics fail.
