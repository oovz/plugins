# WXT output and browser startup

WXT defaults to `.output`. Both `outDir` and the target directory can be configured, and browser, manifest version, and mode can change the target. Use the directory reported by the active dev or build command. The build discovery helper prefers compatible Chrome output and uses recency among compatible candidates, so confirm its result against the command you ran.

WXT combines configuration, entrypoints, modules, and hooks into the generated manifest. For a missing side panel, check whether the Chrome build contains the expected `side_panel.default_path` and inspect how the side-panel entrypoint contributed it. [WXT manifest generation](https://wxt.dev/guide/essentials/config/manifest)

WXT’s dev runner may open its own Chrome profile. If the watcher and your debugging browser are separate, load the directory the watcher writes and verify HMR in that browser after a source edit. If restarting the dev server disconnects HMR, reload the extension to reconnect and refresh any webpage whose content-script context was invalidated. Use a regular Chrome build when reproducing behavior that depends on production mode. [WXT browser startup](https://wxt.dev/guide/essentials/config/browser-startup)
