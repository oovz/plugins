# Tauri v2 Desktop

Version 1.2.1 is a host-neutral Agent Skill for Tauri v2 desktop development on Windows, macOS, and Linux.

## What it covers

- Secure Rust commands and JavaScript IPC with typed, validated boundaries.
- Capability and permission design for core APIs, official plugins, windows, and remote content.
- Desktop lifecycle guidance for windows, menus, tray items, sidecars, deep links, and local assets.
- Dependency and upgrade reviews that distinguish compatible release families from historical security floors.
- Risk-based testing across operating systems, architectures, webviews, packaged artifacts, installers, and updaters.
- Visual validation that distinguishes image inspection from screenshot capture and pairs visual evidence with interaction and accessibility checks.

## Install

Per-harness steps are in the [root README](../../README.md#install-plugins-and-skills).

## Scope

The skill covers Windows, macOS, and Linux. It runs directly on every supported host and requires no dependency installation, background process, or subagent.

## Use

After installation, the skill is addressed by the host-specific plugin namespace. For hosts using the marketplace namespace convention, use `tauri-v2-desktop:tauri-v2-desktop`.

Read only the reference needed for the task:

- [Security, capabilities, and IPC](../../skills/tauri-v2-desktop/references/security-and-ipc.md)
- [Versions and upgrades](../../skills/tauri-v2-desktop/references/versions-and-upgrades.md)
- [Desktop runtime and delivery](../../skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md)
- [Testing and visual validation](../../skills/tauri-v2-desktop/references/testing-and-visual-validation.md)

## Official sources

- [Tauri v2 documentation](https://v2.tauri.app/)
- [Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tests](https://v2.tauri.app/develop/tests/)
- [Updating dependencies](https://v2.tauri.app/develop/updating-dependencies/)
- [Distribution](https://v2.tauri.app/distribute/)
- [Updater](https://v2.tauri.app/plugin/updater/)
