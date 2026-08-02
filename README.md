<div align="center">

# Otto's plugins

My store for plugins used with agentic coding harnesses.

[![Validate marketplace](https://github.com/oovz/plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/oovz/plugins/actions/workflows/validate.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)

</div>

## Available plugins

| Plugin | Version | What it does |
|---|---:|---|
| [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | 0.6.0 | Routes repository work through seven leaf roles, using only the research, planning, implementation, testing, and review steps the task needs. |
| [Tauri v2 Desktop](plugins/tauri-v2-desktop/) | 1.0.0 | Secure, evidence-driven guidance for building, testing, upgrading, and distributing Tauri v2 desktop applications on Windows, macOS, and Linux. |

Each plugin has its own README with behavior and usage details. The rest of this document covers the marketplace and its packaging tools.

## Supported hosts

| Host | Package type | Notes |
|---|---|---|
| Claude Code | Native marketplace plugin | Installs the skill and namespaced agents together. |
| Codex | Native skill plugin plus companion agents | A standalone static mode is also available. |
| Gemini CLI | Native per-plugin extension | Subagents remain a preview host feature. |
| Antigravity 2.0 and CLI | Native per-plugin package | Built separately from the Gemini extension. |
| OpenCode stable | Static configuration bundle | Installs skills and Markdown agent profiles. |
| OpenCode V2 | Separate static bundle | Preview target with its own permission schema. |
| Agent Skills consumers | Portable skill bundle | Agents and permissions are not part of the portable specification. |

See [host compatibility](docs/host-compatibility.md) for exact layouts, host constraints, and links to upstream documentation.

## Install a plugin

### Claude Code

Run these commands in Claude Code:

```text
/plugin marketplace add oovz/plugins
/plugin install senior-engineering-workflow@otto-plugins
/reload-plugins
```

The CLI equivalents are:

```text
claude plugin marketplace add oovz/plugins
claude plugin install senior-engineering-workflow@otto-plugins --scope user
```

### Codex

Install the native skill plugin:

```text
codex plugin marketplace add oovz/plugins
codex plugin add senior-engineering-workflow@otto-plugins
```

Codex custom-agent profiles are installed separately. From a clone of this repository:

```text
node scripts/install.mjs install \
  --plugin senior-engineering-workflow \
  --host codex \
  --mode companion \
  --scope user
```

Use `--mode standalone` when native plugin support is unavailable. Standalone mode installs both the skill and agent profiles. Start a new Codex session after installing or updating them.

### Gemini CLI and Antigravity

These hosts consume a generated, per-plugin directory rather than the marketplace root:

```text
npm ci
npm run build -- --plugin senior-engineering-workflow --host gemini-cli
gemini extensions install ./dist/gemini-cli/senior-engineering-workflow
```

```text
npm run build -- --plugin senior-engineering-workflow --host antigravity
agy plugin install ./dist/antigravity/senior-engineering-workflow
```

Restart Gemini CLI after installing or updating an extension. A Gemini release archive must place `gemini-extension.json` at its root, so the repository URL itself is not a valid remote extension target.

### OpenCode

Use the local installer for the stable bundle:

```text
node scripts/install.mjs install \
  --plugin senior-engineering-workflow \
  --host opencode \
  --variant stable \
  --scope user
```

The V2 preview is an explicit variant:

```text
node scripts/install.mjs install \
  --plugin senior-engineering-workflow \
  --host opencode \
  --variant v2-beta \
  --scope project \
  --project /absolute/path/to/project
```

The installer also supports `update`, `uninstall`, project scope, and `--dry-run`. It records file ownership and content hashes, refuses unrelated existing files by default, and removes only files still owned by the selected plugin.

> [!NOTE]
> Prefer a host's native installer when one is available. The repository installer is meant for static bundles, Codex companion profiles, and isolated verification.

## Work on the marketplace

Node.js 20 or later is required.

```text
npm ci
npm run verify
```

`verify` validates manifests and host contracts, checks committed generated files, runs the test suite, and builds every enabled target. CI runs the same command on Node.js 20 and 24 across Linux, macOS, and Windows.

For a narrower iteration:

```text
npm run generate -- --plugin senior-engineering-workflow
npm run build -- --plugin senior-engineering-workflow --host antigravity
```

`generate` refreshes committed catalogs and adapters. `build` writes disposable packages under `dist/`; it does not modify host configuration directories.

Generated bundles follow the same layout for every plugin:

```text
dist/claude-code/<plugin-id>/
dist/codex/<plugin-id>/
dist/gemini-cli/<plugin-id>/
dist/antigravity/<plugin-id>/
dist/opencode/stable/<plugin-id>/
dist/opencode/v2-beta/<plugin-id>/
dist/portable-agent-skills/<plugin-id>/
```

## Add a plugin

Register the plugin in `marketplace.json`, then add its canonical manifest and components under `plugins/<plugin-id>/`. The generic discovery and rendering pipeline handles every enabled host.

The full guide covers identities, schema fields, component layout, generation, collision checks, and independent releases: [Adding a marketplace plugin](docs/adding-a-plugin.md).

## Repository layout

```text
marketplace.json                  marketplace identity and plugin catalog
schemas/                          canonical manifest and ownership schemas
plugins/<plugin-id>/              canonical plugin source
adapters/                         generated, checked-in host projections
.claude-plugin/marketplace.json   generated Claude Code catalog
.agents/plugins/marketplace.json  generated Codex catalog
scripts/                          generation, installation, and validation tools
test/                             marketplace and installer tests
dist/                             disposable host bundles
```

Canonical plugin files belong under `plugins/`. Do not edit generated catalogs, adapters, or `dist/` output by hand; change the canonical source and regenerate them.

## Documentation

- [Host compatibility](docs/host-compatibility.md)
- [Adding a marketplace plugin](docs/adding-a-plugin.md)

> [!IMPORTANT]
> Plugin capability declarations describe what an adapter requests from a host. Effective access still depends on the host, sandbox, approval mode, workspace trust, and administrator policy. Review a generated bundle before installing it in a sensitive environment.
