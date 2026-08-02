# Desktop runtime and delivery

Use this reference for official plugins, windows, tray, menus, sidecars, deep links, updater, signing, and desktop bundles.

## Plugins and lifecycle

For an official plugin:

1. verify desktop support and current version compatibility;
2. add the Rust crate and JavaScript package when frontend APIs are used;
3. initialize the plugin once in the builder;
4. configure it in the current Tauri configuration shape;
5. grant only the required permission identifiers and scopes;
6. test failure paths on every affected desktop system.

Do not infer permission names from function names. Use the plugin's generated permission documentation. Prefer backend-only use when the frontend does not need direct access.

Windows, webviews, menus, and tray objects have lifecycles. Avoid duplicate listeners and duplicate tray/menu creation during hot reload or window recreation. Define close-versus-hide behavior, single-instance behavior, activation on macOS, and cleanup of listeners/resources explicitly.

## Sidecars

Declare sidecars in `bundle.externalBin` and follow Tauri's target-triple naming rules. Rust and JavaScript APIs differ in whether callers include the target suffix, so use the current [sidecar documentation](https://v2.tauri.app/develop/sidecar/) rather than guessing.

For every shipped target:

- provide the correct executable architecture and `.exe` suffix on Windows;
- preserve Unix executable permissions;
- constrain allowed programs and arguments through shell-plugin permissions;
- validate input, stdout/stderr handling, exit status, cancellation, and orphan cleanup;
- test the bundled copy, not only the development binary;
- include the sidecar in OS signing/notarization and updater verification.

Do not derive a cross-build sidecar name from the host triple.

## Deep links and local assets

Deep-link configuration differs by platform and plugin version. Register schemes in the supported configuration, grant the narrow plugin permissions, validate every received URL, and route only known schemes/hosts/actions. Test cold start, already-running delivery, malformed input, duplicate delivery, and installer registration/unregistration.

For local assets, use the current `app.security.assetProtocol` configuration and narrow scopes. Never expose an unrestricted filesystem root merely to display a file. Treat file URLs and user-controlled paths as untrusted.

## Updater

Use `bundle.createUpdaterArtifacts`, a trusted public key, HTTPS endpoints, and the current platform artifact formats from the [updater guide](https://v2.tauri.app/plugin/updater/). Updater signatures are mandatory and separate from OS code signing.

Keep the private updater key outside source control and untrusted CI. Test against a signed staging feed:

- no update and a valid previous-to-candidate update;
- target/architecture selection and endpoint fallback;
- offline, timeout, malformed response, missing artifact, and rollback/recovery behavior;
- tampered artifact and invalid signature rejection;
- installer mode, relaunch, and version persistence.

Dynamic responses and static JSON have different shapes. The `signature` value is signature-file content, not a filesystem path or URL. Verify current target/architecture keys instead of copying an old example.

## Packaging and signing

Build release artifacts on the intended native operating system whenever possible. A successful bundle does not prove installation or runtime behavior.

- **Windows:** MSI must be built on Windows. Test each shipped MSI/NSIS architecture, WebView2 installation mode/minimum version, per-user/per-machine behavior, Authenticode, protocol registration, upgrade, repair where applicable, and uninstall.
- **macOS:** sign and notarize the final app and all nested code. For universal output, verify both slices in the main executable and native dependencies/sidecars, then run on Apple Silicon and Intel where both are supported.
- **Linux:** build against the oldest supported glibc/WebKitGTK baseline. Test every shipped package format on suitable distributions. ARM AppImages require an ARM machine or emulator because `linuxdeploy` does not cross-compile them.

Protect signing identities, certificates, passwords, API keys, and updater private keys with restricted release environments. Never expose them to untrusted pull requests. Retain checksums, signatures, installer logs, updater responses, and release-test evidence.

Official sources: [official plugins](https://v2.tauri.app/plugin/), [sidecars](https://v2.tauri.app/develop/sidecar/), [deep linking](https://v2.tauri.app/plugin/deep-linking/), [updater](https://v2.tauri.app/plugin/updater/), [distribution](https://v2.tauri.app/distribute/), [Windows installer](https://v2.tauri.app/distribute/windows-installer/), [macOS signing](https://v2.tauri.app/distribute/sign/macos/), and [AppImage](https://v2.tauri.app/distribute/appimage/).
