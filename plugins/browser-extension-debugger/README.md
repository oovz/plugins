# Browser Extension Debugger

Debug live extensions in Chrome, Edge, Firefox, and Safari on macOS. Select a build for each browser, reproduce the interaction, inspect the affected context, and verify the fix after reloading. The WXT skill covers browser-specific builds and hot reload.

## Install

Use the plugin ID `browser-extension-debugger` with the [installation route for your harness](../../README.md#install-plugins-and-skills). Install the browsers you want to test and make Node.js 22.12 or later available to your harness.

| Browser | Debugging tools |
|---|---|
| Chrome | Chrome DevTools CLI, with optional MCP setup and native DevTools. |
| Edge | Native Edge DevTools. The Chrome DevTools CLI can launch Edge, and extension commands depend on the installed Edge version. |
| Firefox | Mozilla Firefox MCP or web-ext and the Add-on Debugger. The native Codex bundle configures Firefox MCP. |
| Safari on macOS | Temporary extensions and Web Inspector. Safari 27 or Safari Technology Preview 247 supports optional MCP page inspection. |

See the [Chrome and Edge](../../skills/browser-extension-debug/references/chromium.md), [Firefox](../../skills/browser-extension-debug/references/firefox.md), and [Safari](../../skills/browser-extension-debug/references/safari.md) setup guides for installation, debugging, and shutdown.

### Upgrade from Chrome Extension Debugger

Uninstall `chrome-extension-debugger` through the harness you used to install it, refresh the marketplace, and install `browser-extension-debugger`. If you used the repository installer, run `node scripts/install.mjs uninstall --plugin chrome-extension-debugger` with your original `--host`, `--scope`, and any `--project` or Codex `--mode` options before installing the new ID.

Replace standalone copies of `chrome-extension-debug` with `browser-extension-debug`. Update saved prompts to use that new skill name. Reinstall `wxt-extension-debug` to get its cross-browser workflow. If you customized the old Codex plugin's Chrome MCP entry, use the [Chrome and Edge setup guide](../../skills/browser-extension-debug/references/chromium.md) to configure it for the new workflow.

For an installation still on `chrome-extension-tester`, use that ID in the uninstall step. Replace `chrome-extension-test` and `wxt-extension-test` in saved prompts with `browser-extension-debug` and `wxt-extension-debug`.

## Use the skills

```text
Use browser-extension-debug to reproduce the popup bug through the toolbar action in Chrome and Firefox. Verify the fix in both browsers.
```

```text
Use wxt-extension-debug to find out why my Edge content script goes stale after a rebuild. Verify the fix on a matching webpage.
```

Sessions started for a task close at the end of debugging. Ask to keep the browser or watcher open if you want to continue in the same session.
