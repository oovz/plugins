---
name: tauri-v2-desktop
description: Build, review, secure, test, upgrade, and distribute Tauri v2 desktop applications for Windows, macOS, and Linux. Use for Rust commands, JavaScript IPC, capabilities, official plugins, windows, tray, sidecars, deep links, updater, signing, packaging, OS or architecture test matrices, and visual validation. Do not use for Android or iOS work.
---

# Tauri v2 desktop

Use this skill for desktop targets only: Windows, macOS, and Linux. Do not add mobile setup, permissions, plugins, commands, or CI unless the user separately requests a mobile skill.

## Inspect before editing

Read the project rather than assuming a template:

- `package.json`, the lockfile, frontend build configuration, and scripts;
- `src-tauri/Cargo.toml`, `Cargo.lock`, `build.rs`, Rust modules, and tests;
- `src-tauri/tauri.conf.json` or its JSON5/TOML equivalent;
- `src-tauri/capabilities/`, plugin configuration, bundle targets, icons, sidecars, and updater settings;
- release workflows, supported OS/architecture policy, minimum OS versions, and existing test evidence.

Identify the installed Tauri core, CLI, API, build, and plugin versions before recommending syntax or an upgrade. Preserve the project's package manager, Rust style, command conventions, and security boundary.

## Load only the reference needed

- Read [Security, capabilities, and IPC](references/security-and-ipc.md) for commands, ACLs, scopes, remote content, state, events, and channels.
- Read [Versions and upgrades](references/versions-and-upgrades.md) for dependency alignment, release review, migrations, and security floors.
- Read [Desktop runtime and delivery](references/desktop-runtime-and-delivery.md) for plugins, windows, tray, sidecars, deep links, updater, signing, and packaging.
- Read [Testing and visual validation](references/testing-and-visual-validation.md) for layered tests, OS/architecture coverage, native artifacts, WebDriver, and image-capability-aware visual review.

Use the official documentation links in those references for uncommon details. Verify any unstable API, schema, artifact name, platform requirement, or version claim against current official documentation before implementation.

## Non-negotiable boundaries

- Register application commands once with `invoke_handler(tauri::generate_handler![...])`; use the command's defining module path when it is not at crate root.
- Treat every frontend argument as untrusted. Validate shape, length, ranges, paths, URLs, identifiers, authorization, and resource ownership in Rust.
- Do not claim that capabilities automatically restrict ordinary application commands registered through `invoke_handler`. If application commands must enter the capability ACL, explicitly declare them through `tauri_build::AppManifest::commands` and define permissions.
- Grant only the core/plugin permissions, windows/webviews, URL origins, targets, and scopes the feature needs. Capability platform names are `linux`, `macOS`, and `windows`.
- Treat remote origins and navigated remote content as hostile. Avoid exposing native APIs to them; use narrow remote URL patterns only when unavoidable.
- Keep secrets and privileged operations in Rust or the operating-system credential store, never in frontend source, logs, events, or updater metadata.
- Do not hold a synchronous mutex guard across `.await`. Prefer immutable state, short critical sections, or an async mutex when truly required.
- Use commands for request/response, events for small notifications, and channels for ordered or streaming data. Validate event and channel payloads too.
- Prefer maintained official plugins over custom native code when they meet the need. Install both Rust and JavaScript halves when a plugin exposes frontend APIs, initialize it, configure it, and grant only its required permissions.
- Do not weaken CSP, capability scopes, updater signature verification, OS code signing, or installer behavior to make a test pass.

## Implementation sequence

1. State the affected desktop targets, architectures, trust boundaries, and native integrations.
2. Confirm current syntax in official documentation and installed crate/package sources.
3. Implement the smallest backend contract and return serializable data or stable errors.
4. Register commands and initialize plugins once; add narrow capabilities and scopes.
5. Add a typed frontend wrapper and lifecycle cleanup for listeners, windows, child processes, and resources.
6. Add logic tests, native integration coverage, and release-artifact checks proportional to the change.
7. Derive the native test matrix from what the project actually ships. Do not treat mocks, a successful cross-build, Rosetta, or CPU emulation as native runtime coverage.
8. For visual behavior, check whether the current agent and its available tools can inspect image pixels before requesting or capturing screenshots. Inspect native screenshots when capable; otherwise preserve evidence for an image-capable reviewer and report visual inspection as pending.
9. Report commands run, host and target OS/architectures, artifacts exercised, native versus emulated coverage, visual evidence reviewed, and every untested target.

## Upgrade review

When upgrading, inspect release notes from the installed version through the proposed version. Separate:

- security fixes and minimum safe versions;
- breaking or behavior-changing core, CLI, plugin, schema, and bundler changes;
- deprecated APIs and required migrations;
- platform-specific packaging, signing, updater, and webview changes;
- version coupling between `tauri`, `tauri-build`, `tauri-cli`, `@tauri-apps/api`, and official plugin Rust/JavaScript packages.

Do not blindly replace every Tauri dependency with one shared number. Align core packages by compatible major/minor guidance and keep the two halves of each official plugin on matching releases. Use the project's package manager and `cargo update -p ... --precise ...` or an equivalent controlled update when reproducibility matters.

## Completion gate

Adapt commands to the repository and run all relevant checks:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run typecheck
npm test
npm run tauri build
```

Do not run an unsupported script merely because it appears above. Use the lockfile's package manager, record skipped checks, and never report success from a command that did not run.

Use the repository's supported Rust feature matrix. Add `--all-features` only when the features are designed to coexist; mutually exclusive or OS-specific features require separate jobs.

Before completion, apply the risk-based matrix in the testing reference. Every released OS/architecture artifact must eventually be installed, launched, and smoke-tested on that native target or be explicitly marked as unverified. UI checks must say whether screenshots were actually inspected by an image-capable agent or person; screenshot existence alone is not visual validation.

## Primary official sources

- [Tauri v2 documentation](https://v2.tauri.app/)
- [Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tests](https://v2.tauri.app/develop/tests/)
- [Updating dependencies](https://v2.tauri.app/develop/updating-dependencies/)
- [Distribute](https://v2.tauri.app/distribute/)
- [Tauri releases](https://v2.tauri.app/release/)
