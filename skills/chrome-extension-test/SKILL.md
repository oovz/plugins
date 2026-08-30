---
name: chrome-extension-test
description: Test, reproduce, verify, or debug a Chrome extension in a real Chrome extension context using Chrome DevTools MCP. Use for side panels, action popups, extension pages, MV3 service workers, content scripts, browser-action flows, and extension integration bugs. Prefer the real browser-managed surface; do not substitute direct chrome-extension:// navigation when the browser-managed lifecycle is part of the test.
---

# Chrome Extension Test

Use Chrome DevTools MCP as the browser control plane. It must be started with extension tools enabled via `--categoryExtensions` and `--allowUnrestrictedPaths`.

Before using extension tools, verify the server: if `list_extensions`, `install_extension`, `reload_extension`, `trigger_extension_action`, or `uninstall_extension` are absent from the session, the Chrome DevTools MCP server is missing or lacks the required flags. Check whether a server is already configured for your harness (check commands and file locations in `references/troubleshooting.md`, section 2), add it only if none exists, and update an existing entry in place so both flags are present. Never register a second server under a different name: two Chrome DevTools MCP instances contend for the same Chrome profile and debugging port.

## Non-negotiable test provenance

Classify every extension UI verification as one of these:

- `REAL_SURFACE`: Chrome opened the extension surface through the browser-managed flow being tested, such as `trigger_extension_action`, a user click that invokes `chrome.sidePanel.open`, or another product-real interaction.
- `HTML_ONLY`: the agent navigated directly to `chrome-extension://<id>/<page>.html` or served the UI as a normal web page.

Never report an `HTML_ONLY` check as proof that popup or side-panel browser integration works. Direct extension-page navigation is acceptable for UI-only diagnostics when explicitly labeled `HTML_ONLY`.

## Workflow

### 1. Inspect the project before launching Chrome

Determine:

- whether this is a WXT project;
- the package manager and existing build/test scripts;
- the unpacked extension output directory containing `manifest.json`;
- Manifest V2 or V3;
- configured surfaces: `action`, `side_panel`, `options_ui`, background service worker, and content scripts.

Prefer existing project scripts. Do not add dependencies or rewrite project configuration merely to run a smoke test.

If build output is unclear, run the bundled helper:

```bash
node scripts/find-extension-build.mjs .
```

The helper orders candidates newest-first by modification time, so `recommended` is the most recently produced build — normally the one you just built. Then inspect the selected build:

```bash
node scripts/inspect-extension.mjs /absolute/path/to/unpacked-extension
```

Locate these helper scripts in the `scripts/` directory relative to this `SKILL.md`.

### 2. Build before install

If no valid unpacked build exists, run the repository's existing Chrome build command. For generic projects, infer the command from `package.json`, project docs, or build tooling rather than guessing.

Require a parseable `manifest.json` in the directory passed to `install_extension`.

### 3. Install or reload through Chrome DevTools MCP

Use extension tools in this order:

1. `list_extensions` to avoid duplicate installs.
2. `install_extension` with the absolute unpacked extension directory if not installed.
3. Record the extension ID.
4. After subsequent rebuilds, use `reload_extension` rather than reinstalling when possible.

Do not manually edit Chrome profile files or use `chrome://extensions` if MCP extension tools are available.

### 4. Establish a baseline tab

For extensions that operate on webpages, open or select a representative normal `https://` page first. Capture a baseline with `take_snapshot` and, when relevant, `list_console_messages` and `list_network_requests`.

Use a harmless local/test page when the product does not require a specific site.

### 5. Open the real extension surface

#### Side panel

Preferred path:

1. Capture `list_pages` before opening.
2. Use `trigger_extension_action` if the extension action is configured to open the side panel.
3. Otherwise reproduce the extension's real user-gesture path that calls the Side Panel API.
4. Call `list_pages` again and select the resulting extension context when exposed.
5. Verify the selected context belongs to the installed extension ID.
6. Mark the test `REAL_SURFACE` only because the surface was opened through the real user/browser flow, not merely because its URL is a `chrome-extension://` URL.

Do **not** use `new_page` or `navigate_page` to the side-panel HTML as a fallback and still call the test successful. If Chrome DevTools MCP cannot expose/interact with the real side-panel context, report the limitation and stop that assertion.

#### Action popup

Use `trigger_extension_action`. Do not navigate directly to the popup HTML for popup-lifecycle verification. After triggering, select the newly exposed extension page/context and interact with it.

#### Options or other standalone extension pages

Prefer the product-real navigation route when the route itself matters. Direct `chrome-extension://` navigation may be used for UI-only checks if reported as `HTML_ONLY`.

### 6. Interact like a user

For each page/context:

1. `take_snapshot` to obtain the current accessibility tree and UIDs.
2. Use UIDs from the latest snapshot/action response for `click`, `fill`, `type_text`, `press_key`, and similar tools.
3. Take a fresh snapshot after meaningful state changes or if a UID becomes stale.
4. Use `take_screenshot` for visual/layout validation, not as the primary mechanism for locating controls.
5. Use `evaluate_script` only for state that cannot be observed through normal UI or diagnostics. Do not use it to bypass the user flow being tested.

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

Do not claim a fix based only on static analysis when runtime reproduction is available.

## Minimum smoke suite

Run the applicable subset:

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

Read `references/surfaces.md` when the distinction between extension surfaces is material. Read `references/troubleshooting.md` for cross-harness MCP server setup instructions, server updates, and debugging.
