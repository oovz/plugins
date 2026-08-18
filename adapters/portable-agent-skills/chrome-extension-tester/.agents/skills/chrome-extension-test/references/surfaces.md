# Chrome extension surface test matrix

| Surface | Real integration opening path | Direct URL acceptable? | What real-surface testing adds |
|---|---|---|---|
| Side panel | Extension action configured for side panel, or product user gesture invoking Side Panel API | UI-only checks only | Browser-managed panel lifecycle, active-tab association, user gesture requirements, reopen behavior |
| Action popup | `trigger_extension_action` | UI-only checks only | Action/popup lifecycle, actual popup context |
| Options page | Product navigation or options API when route matters | Usually yes for UI-only checks | Navigation/integration behavior if product depends on it |
| Content script | Navigate a matching normal webpage and observe injection | No substitute | Match patterns, permissions, isolated-world behavior, reinjection after reload |
| MV3 service worker | Load/trigger extension behavior and inspect worker diagnostics | N/A | Worker startup, lifecycle, message handling, background errors |

## Side-panel acceptance rules

A side-panel assertion is valid only when:

1. the extension is loaded as an unpacked extension;
2. the panel is opened by the extension's real Chrome interaction path;
3. the agent interacts with the extension context that results from that action;
4. the agent does not replace the panel with a normal tab pointed at the same HTML file;
5. any limitation in exposing the panel target is reported rather than hidden.

If a test only checks the HTML application, label it `HTML_ONLY`.
