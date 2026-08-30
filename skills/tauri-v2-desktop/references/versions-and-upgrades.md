# Versions and upgrades

Use this reference when auditing, selecting, or upgrading Tauri v2 dependencies.

## Inventory first

Collect the versions actually resolved, not just loose manifest ranges:

```bash
cargo tree -p tauri -p tauri-build
cargo tree -d
npm ls @tauri-apps/api @tauri-apps/cli
```

Adapt the package-manager command to the lockfile. Also inventory every official plugin in both `Cargo.toml` and `package.json`, the Rust toolchain, Node/package-manager version, platform runners, and updater/bundler configuration.

## Align compatible families

- Keep `tauri` and `@tauri-apps/api` on compatible major/minor releases as directed by the current [updating dependencies guide](https://v2.tauri.app/develop/updating-dependencies/).
- Keep the Rust crate and JavaScript package for each official plugin on the same plugin release.
- Treat `tauri-cli`, `@tauri-apps/cli`, and `tauri-build` as independently versioned packages; do not force them to the core crate's exact patch number.
- Commit lockfile updates and review transitive duplicates or unexpectedly downgraded packages.

Use the newest compatible stable patch unless the repository has a tested pin. Never state a "latest" version without checking the current official release index and package registries at the time of the task.

## Current security floors to recognize

When reviewing a project below these releases, call out the reason and verify whether newer advisories supersede them:

- Tauri core `2.11.1` corrected command ACL enforcement for remote-origin requests and a Windows `.localhost` origin classification issue. Prefer the newest stable `2.11.x` or later compatible release, not merely the floor. See the [2.11.1 release](https://v2.tauri.app/release/tauri/v2.11.1/).
- Tauri CLI `2.10.1` fixed updater signing keys generated with empty passwords by CLI `2.9.3` through `2.10.0`. Projects affected by that window must rotate/recreate keys and verify their release process; upgrading the CLI alone does not repair an already exposed or unusable key. See the [2.10.1 release](https://v2.tauri.app/release/tauri-cli/v2.10.1/).

These are historical review markers, not permanent claims that those versions remain current.

## Upgrade procedure

1. Read every relevant core, CLI, build, API, plugin, and bundler release note between the installed and proposed versions.
2. Identify security fixes, schema migrations, changed defaults, deprecations, minimum Rust/Node/OS changes, and platform-specific behavior.
3. Upgrade one compatible family at a time. Regenerate schemas and validate capability identifiers.
4. Compile all declared targets. Run logic tests, native tests, and packaging checks from the testing reference.
5. Re-test installer upgrade paths, updater signatures/metadata, sidecars, deep links, capabilities, CSP, signing, notarization, and Linux runtime baselines when affected.
6. Report before/after versions, major changes reviewed, migrations made, skipped targets, and rollback steps.

Do not recommend an upgrade solely because a higher number exists. Explain security, compatibility, support, and migration impact. Conversely, do not retain a vulnerable release merely to avoid testing.

Official sources: [updating dependencies](https://v2.tauri.app/develop/updating-dependencies/), [release index](https://v2.tauri.app/release/), [Tauri GitHub releases](https://github.com/tauri-apps/tauri/releases), and [plugins workspace releases](https://github.com/tauri-apps/plugins-workspace/releases).
