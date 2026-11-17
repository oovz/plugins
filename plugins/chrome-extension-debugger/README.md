# Chrome Extension Debugger

Develop and debug unpacked Chrome extensions in a live browser. The skills guide you through build selection, extension reloads, browser-managed popups and side panels, content scripts, and Manifest V3 worker diagnostics.

Use [Playwright Test](https://playwright.dev/docs/chrome-extensions) for automated browser regressions and CI.

## Install

Follow the [per-host installation routes](../../README.md#install-plugins-and-skills) with the plugin ID `chrome-extension-debugger`. Codex bundles the Chrome DevTools MCP server with its extension tools enabled. If you use a different harness, or your Codex MCP client needs an explicit root for the build directory, follow the [MCP setup guide](../../skills/chrome-extension-debug/references/troubleshooting.md).

The skills can use Chrome’s extension management page and built-in DevTools when you have browser UI access.

### Upgrade from Chrome Extension Tester

Uninstall `chrome-extension-tester` through your harness, then install `chrome-extension-debugger`. If you used the repository installer, run its `uninstall --plugin chrome-extension-tester` operation with the same host and scope options you used to install it.

Update saved prompts and standalone skill installations to use `chrome-extension-debug` and `wxt-extension-debug` in place of `chrome-extension-test` and `wxt-extension-test`. Update any Codex settings keyed to `chrome-extension-tester@otto-plugins` to use `chrome-extension-debugger@otto-plugins`.

## Use the skills

- `chrome-extension-debug` guides live Chrome extension development and debugging.
- `wxt-extension-debug` guides live development with WXT’s generated manifests, dev browser, and hot reload.

```text
Use chrome-extension-debug to reproduce the popup bug through the toolbar action. Find the cause, fix it, and repeat the interaction after reloading.
```

```text
Use wxt-extension-debug to check why my content script goes stale after a WXT rebuild. Keep the dev loop running and verify the behavior on the matching webpage.
```

When the output path is unclear, run these helpers from the installed skill directory:

```sh
node scripts/find-extension-build.mjs /absolute/path/to/project
node scripts/inspect-extension.mjs /absolute/path/to/unpacked-extension
```
