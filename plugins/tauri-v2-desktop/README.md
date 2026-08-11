# Tauri v2 Desktop

Version 1.1.0 is a host-neutral Agent Skill for building, reviewing, securing, testing, upgrading, and distributing Tauri v2 desktop applications on Windows, macOS, and Linux.

## Release notes

### 1.1.0

- Adds an Oh My Pi marketplace projection alongside Claude Code, Codex, Gemini CLI, Antigravity, OpenCode, and the portable Agent Skills export.
- Keeps the plugin skill-only; it does not require subagent support.

### 1.0.2

- Removes the redundant OpenCode V2 preview projection. This plugin is skill-only, so its V2 output was byte-for-byte equivalent to the stable OpenCode bundle and provided no additional behavior.

### 1.0.1

- Clarifies that bundled local commands and remote-origin IPC follow different Tauri ACL paths, with remote origins on Tauri 2.11.1 and later requiring an explicit, narrowly scoped remote capability.
- Adds deterministic semantic guidance checks and a platform-safe test launcher for release verification.

## What it covers

- Secure Rust commands and JavaScript IPC with typed, validated boundaries.
- Capability and permission design for core APIs, official plugins, windows, and remote content.
- Desktop lifecycle guidance for windows, menus, tray items, sidecars, deep links, and local assets.
- Dependency and upgrade reviews that distinguish compatible release families from historical security floors.
- Risk-based testing across operating systems, architectures, webviews, packaged artifacts, installers, and updaters.
- Visual validation that distinguishes image inspection from screenshot capture and pairs visual evidence with interaction and accessibility checks.

## Install

Per-harness steps are in the [root README](../README.md#install).

## Scope

The skill covers desktop targets only: Windows, macOS, and Linux. No Android or iOS guidance. It does not install dependencies, run a background process, or require a subagent; any supported host can use it directly.

## Layout

```text
plugins/tauri-v2-desktop/
├── LICENSE
├── plugin.json
├── README.md
├── evals/
│   └── security-guidance.yaml
└── skills/tauri-v2-desktop/
    ├── SKILL.md
    └── references/
        ├── security-and-ipc.md
        ├── versions-and-upgrades.md
        ├── desktop-runtime-and-delivery.md
        └── testing-and-visual-validation.md
```

The deterministic validation suite is `evals/security-guidance.yaml`.

The marketplace generates host-specific packages from this canonical source. Do not edit generated adapters or `dist/` output by hand.

## Use

After installation, the skill is addressed by the host-specific plugin namespace. For hosts using the marketplace namespace convention, use `tauri-v2-desktop:tauri-v2-desktop`.

Read only the reference needed for the task:

- [Security, capabilities, and IPC](skills/tauri-v2-desktop/references/security-and-ipc.md)
- [Versions and upgrades](skills/tauri-v2-desktop/references/versions-and-upgrades.md)
- [Desktop runtime and delivery](skills/tauri-v2-desktop/references/desktop-runtime-and-delivery.md)
- [Testing and visual validation](skills/tauri-v2-desktop/references/testing-and-visual-validation.md)

## Official sources

- [Tauri v2 documentation](https://v2.tauri.app/)
- [Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tests](https://v2.tauri.app/develop/tests/)
- [Updating dependencies](https://v2.tauri.app/develop/updating-dependencies/)
- [Distribution](https://v2.tauri.app/distribute/)
- [Updater](https://v2.tauri.app/plugin/updater/)
