# Chrome extension surface test matrix

| Surface | Real integration opening path | Direct URL acceptable? | What real-surface testing adds |
|---|---|---|---|
| Side panel | Extension action configured for side panel, or product user gesture invoking Side Panel API | UI-only checks only | Browser-managed panel lifecycle, active-tab association, user gesture requirements, reopen behavior |
| Action popup | `trigger_extension_action` | UI-only checks only | Action/popup lifecycle, actual popup context |
| Options page | Product navigation or options API when route matters | Usually yes for UI-only checks | Navigation/integration behavior if product depends on it |
| Content script | Navigate a matching normal webpage and observe injection | No substitute | Match patterns, permissions, isolated-world behavior, reinjection after reload |
| MV3 service worker | Load/trigger extension behavior and inspect worker diagnostics | N/A | Worker startup, lifecycle, message handling, background errors |

## Open and verify a side panel

1. Load the unpacked extension and record its ID.
2. Capture `list_pages` before opening.
3. Use `trigger_extension_action` when the extension action opens the panel; otherwise reproduce the product user gesture that calls the Side Panel API.
4. Call `list_pages` again and select the resulting extension context when exposed.
5. Verify that context belongs to the installed extension ID, then interact with the panel.

Classify the check as `REAL_SURFACE` because of the opening path and resulting context. A `chrome-extension://` URL alone does not establish provenance. If the real panel target cannot be exposed or controlled, report that assertion as unverified. Direct HTML diagnostics remain `HTML_ONLY`.

## Action popup

Use `trigger_extension_action`, select the newly exposed extension context, and interact with it. Direct popup HTML navigation covers UI-only behavior; popup lifecycle acceptance requires the browser action path.

## Options and standalone extension pages

Use the product navigation route when that route is under test. Direct navigation is sufficient for an explicitly scoped UI-only check and is reported as `HTML_ONLY`.
