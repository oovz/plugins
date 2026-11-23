---
name: tauri-v2-desktop
description: Build, debug, review, or upgrade Tauri v2 desktop applications, including IPC, native integrations, packaging, and platform validation. Desktop targets are Windows, macOS, and Linux.
---

# Tauri v2 desktop

Keep the work within the requested desktop change or investigation. Identify affected shipping targets and preserve the project's package manager, Rust conventions, and security boundaries. Mobile-specific work needs its own guidance.

## Inspect the affected boundary

Start with applicable instructions, existing changes, and the code/configuration involved. Use `package.json`, Cargo manifests, lockfiles, and native scripts when dependency syntax or validation depends on them. Read capabilities for IPC changes, bundle/updater settings for delivery changes, and release workflows for the affected OS/architecture matrix.

Before recommending API syntax or an upgrade, identify the installed versions of the involved core, CLI, API, build, and plugin packages. A small frontend change needs only its relevant sources and checks.

## Load only the reference needed

- Before changing commands, permissions, remote content, managed state, events, or channels, read [Security, capabilities, and IPC](references/security-and-ipc.md).
- For dependency selection, upgrades, or advisory review, read [Versions and upgrades](references/versions-and-upgrades.md).
- For plugins, windows, tray, sidecars, deep links, updater, signing, or packaging, read [Desktop runtime and delivery](references/desktop-runtime-and-delivery.md).
- When selecting native runtime, artifact, platform, or visual checks, read [Testing and visual validation](references/testing-and-visual-validation.md).

Use the official documentation links in those references for uncommon details. Verify any unstable API, schema, artifact name, platform requirement, or version claim against current official documentation before implementation.

## Security boundaries

Keep external-input validation and authorization in Rust. Grant only the permissions and scopes the feature needs; preserve CSP, updater signature verification, and OS signing. Keep secrets in Rust or the operating-system credential store.

Bundled local application content may invoke ordinary custom commands registered through `invoke_handler` by default. Per-command capability control requires enrollment through `tauri_build::AppManifest::commands` and explicit permissions. On Tauri 2.11.1 and later, remote-origin IPC is always ACL-resolved and requires an explicit, narrowly scoped remote capability. Apply the detailed rules in the security reference before changing this boundary.

## Implement and validate

For an IPC or native feature, settle the backend contract and stable serializable errors, register commands and initialize plugins once, grant narrow capabilities, and connect the frontend using the project's existing conventions. Include lifecycle cleanup for listeners, windows, child processes, and resources the feature creates. Use the security and runtime references for the applicable mechanics.

Keep implementation and immediate tests together. Select logic, native integration, or artifact checks from the changed behavior and required project gates. Run actual repository commands with its package manager and supported Rust feature combinations; `--all-features` is appropriate only when those features coexist.

For visual behavior, establish whether the available tools can inspect image pixels. Inspect actual native screenshots when capable; otherwise preserve evidence for an image-capable reviewer and report visual inspection as pending. Follow the testing reference's affected-target matrix for native and delivery changes. Complete release acceptance against installed artifacts on every shipped OS/architecture, or report the unverified targets and required release decision.

## Completion evidence

Report the requested outcome, commands and observed results, affected host/target OS and architectures, and remaining gaps. Distinguish logic/mocked, cross-built, emulated, native runtime, and installed-artifact evidence. State whether screenshots were actually inspected; capture alone is insufficient. A local implementation check and release acceptance have different completion boundaries.

## Primary official sources

- [Tauri v2 documentation](https://v2.tauri.app/)
- [Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tests](https://v2.tauri.app/develop/tests/)
- [Updating dependencies](https://v2.tauri.app/develop/updating-dependencies/)
- [Distribute](https://v2.tauri.app/distribute/)
- [Tauri releases](https://v2.tauri.app/release/)
