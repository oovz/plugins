# WXT notes for agentic extension testing

## Output discovery

WXT's default output root is `.output`, but `outDir` is configurable. The target directory name is also templated from browser, manifest version, and mode, so discover the generated manifest instead of assuming a fixed path.

`find-extension-build.mjs` orders candidates newest-first by modification time, so `recommended` is the most recently modified build. Confirm it is the build produced by the command you just ran before loading it.

## Generated manifest

WXT composes the final `manifest.json` from configuration and entrypoints. Runtime tests should inspect the generated manifest in the unpacked build directory because that is what Chrome loads.

A sidepanel entrypoint causes WXT to generate side-panel-related manifest configuration/permission behavior. Verify the generated output rather than only source filenames.

## Browser ownership

WXT can open a browser during development through its browser-startup integration. Chrome DevTools MCP can also launch a dedicated Chrome profile. For this plugin's extension tests, treat the MCP-managed Chrome as authoritative so `install_extension`, `reload_extension`, and `trigger_extension_action` are available.

If WXT also launches a browser, do not confuse success in that window with success in the MCP-controlled window.

## Reloading content scripts

After `reload_extension`, existing content-script execution contexts may be invalid. Reload/navigate the target tab before retesting content-script interactions.
