<div align="center">

# Otto's plugins

Plugins, Agent Skills, and command-line tools for agentic coding harnesses.

[![Validate marketplace](https://github.com/oovz/plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/oovz/plugins/actions/workflows/validate.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
[![npm version](https://img.shields.io/npm/v/%40oovz%2Fsew)](https://www.npmjs.com/package/@oovz/sew)

</div>

## Available plugins

| Plugin | Version | What it does |
|---|---:|---|
| [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | 0.12.2 | Keeps engineering decisions in the main agent while bounded specialists handle focused work. |
| [Tauri v2 Desktop](plugins/tauri-v2-desktop/) | 1.2.1 | Guides Tauri v2 development, security, testing, upgrades, and distribution on Windows, macOS, and Linux. |
| [Chrome Extension Tester](plugins/chrome-extension-tester/) | 0.1.1 | Tests and debugs Chrome extensions in browser-managed contexts through Chrome DevTools MCP, including WXT projects. |

## Available skills

Canonical skills are independently valid [Agent Skills](https://agentskills.io/specification). Plugins reference these skill IDs and package them for their enabled harnesses.

| Skill | Bundled by | What it does |
|---|---|---|
| [Senior Engineering Workflow](skills/senior-engineering-workflow/) | `senior-engineering-workflow` | Routes engineering work through bounded research, implementation, and verification. |
| [Tauri v2 Desktop](skills/tauri-v2-desktop/) | `tauri-v2-desktop` | Guides Tauri v2 architecture, upgrades, testing, and delivery. |
| [Chrome Extension Test](skills/chrome-extension-test/) | `chrome-extension-tester` | Tests Chrome extensions in Chrome-managed extension contexts. |
| [WXT Extension Test](skills/wxt-extension-test/) | `chrome-extension-tester` | Adds WXT-specific build discovery and debugging guidance. |

## Compatibility

The validated coding-harness targets are:

| Host | Senior Engineering Workflow | Tauri v2 Desktop | Chrome Extension Tester | Distribution |
|---|---|---|---|---|
| Claude Code | Skill + four named subagents | Skill | Skills | Native Claude marketplace |
| Codex | Skill + four companion agents | Skill | Skills + MCP | Codex marketplace plus companion/static payload |
| OpenCode | Skill + four Markdown subagents | Skill | Skills | Static host payload |
| Cursor 2.5+ | Skill + four custom subagents | Skill | Skills | Native Cursor plugin plus static host payload |
| Gemini CLI | Skill + four extension subagents | Skill | Skills | Static host payload |
| Antigravity | Skill; bounded roles use inherited generic/dynamic subagents | Skill | Skills | Native Antigravity plugin payload |
| Oh My Pi (`omp`) | Skill + four task agents | Skill | Skills | Native OMP marketplace |

Tauri v2 Desktop and Chrome Extension Tester also ship a portable Agent Skills export. Senior Engineering Workflow requires subagent support, so it targets coding harnesses instead.

## Install

`@oovz/sew` installs the host-native Senior Engineering Workflow components on every supported host. Tauri v2 Desktop and Chrome Extension Tester are skill-only and install through each host's native marketplace where available. Choose a harness below.

<details>
<summary>Claude Code</summary>

```text
/plugin marketplace add oovz/plugins
/plugin install senior-engineering-workflow@otto-plugins
/plugin install tauri-v2-desktop@otto-plugins
/plugin install chrome-extension-tester@otto-plugins
/reload-plugins
```

From the CLI:

```text
claude plugin marketplace add oovz/plugins
claude plugin install senior-engineering-workflow@otto-plugins --scope user
claude plugin install tauri-v2-desktop@otto-plugins --scope user
claude plugin install chrome-extension-tester@otto-plugins --scope user
```
</details>

<details>
<summary>Codex</summary>

Using `@oovz/sew`:

`@oovz/sew` checks the Codex plugin inventory and manages the four companion agents:

```text
npx @oovz/sew install --host codex --scope user
```

If `senior-engineering-workflow@otto-plugins` is already installed and enabled, the CLI preserves the marketplace-owned skill and installs only the companion agents. If it is missing or disabled, the CLI registers `oovz/plugins`, installs the plugin, and then installs the agents.

Use `--force` to skip the inventory check, reinstall the marketplace plugin, and replace conflicting companion-agent files:

```text
npx @oovz/sew install --host codex --scope user --force
```

`sew uninstall --host codex` removes only files managed by `@oovz/sew`; it leaves the marketplace plugin installed.

Using Codex CLI or Desktop:

```text
codex plugin marketplace add oovz/plugins
codex plugin add tauri-v2-desktop@otto-plugins
codex plugin add chrome-extension-tester@otto-plugins
```
</details>

<details>
<summary>OpenCode</summary>

```text
npx @oovz/sew install --host opencode --scope user
```

This installs one Agent Skill and four `mode: subagent` Markdown agents. Inspect them with `opencode agent list`. The CLI verifies them in a fresh OpenCode process when that command is available; restart any OpenCode session that was already running.

Add `--scope project --project /absolute/path/to/project` for a single project. Tauri v2 Desktop and Chrome Extension Tester have no CLI install; from a clone of this repository:

```text
node scripts/install.mjs install --plugin tauri-v2-desktop --host opencode --variant stable --scope user
node scripts/install.mjs install --plugin chrome-extension-tester --host opencode --variant stable --scope user
```
</details>

<details>
<summary>Cursor</summary>

```text
npx @oovz/sew install --host cursor --scope user
```

Add `--scope project --project /absolute/path/to/project` for one workspace. The command installs the Agent Skill and four custom subagents under `.cursor/skills` and `.cursor/agents` for the local editor and Cursor CLI.

The generated `.cursor-plugin` adapter supports Cursor Marketplace and team-marketplace installation in Cursor 2.5 or later. Choose the direct CLI or native plugin installation; using both creates duplicate role definitions. Cloud-agent delegation is outside this validated target. Cursor roles inherit the parent model by omitting `model` until `sew models configure` applies a live-listed model override.
</details>

<details>
<summary>Gemini CLI</summary>

```text
npx @oovz/sew install --host gemini-cli --scope user
```

Tauri v2 Desktop and Chrome Extension Tester, from a clone:

```text
npm run build -- --plugin tauri-v2-desktop --host gemini-cli
gemini extensions install ./dist/gemini-cli/tauri-v2-desktop
npm run build -- --plugin chrome-extension-tester --host gemini-cli
gemini extensions install ./dist/gemini-cli/chrome-extension-tester
```
</details>

<details>
<summary>Antigravity</summary>

```text
npx @oovz/sew install --host antigravity --scope user
```

Tauri v2 Desktop and Chrome Extension Tester, from a clone:

```text
npm run build -- --plugin tauri-v2-desktop --host antigravity
agy plugin install ./dist/antigravity/tauri-v2-desktop
npm run build -- --plugin chrome-extension-tester --host antigravity
agy plugin install ./dist/antigravity/chrome-extension-tester
```
</details>

<details>
<summary>Oh My Pi</summary>

```text
/marketplace add oovz/plugins
/marketplace install senior-engineering-workflow@otto-plugins
/marketplace install tauri-v2-desktop@otto-plugins
/marketplace install chrome-extension-tester@otto-plugins
/reload-plugins
```

From the CLI:

```text
omp plugin marketplace add oovz/plugins
omp plugin install --scope user senior-engineering-workflow@otto-plugins
omp plugin install --scope user tauri-v2-desktop@otto-plugins
omp plugin install --scope user chrome-extension-tester@otto-plugins
```
</details>

The `update` and `uninstall` commands use the same host and scope options as `install`. `npx @oovz/sew doctor` checks all seven hosts, and `--dry-run` previews an operation.

### Configure subagent models

By default, the four roles use the main agent's model, thinking level, tools, and permissions. On Codex, OpenCode, Cursor, and Gemini CLI, you can route selected roles to another model. `models configure` edits installed role agents in place and changes only supported model and thinking fields. It uses live harness values when available. It rejects a listed model or Codex reasoning effort that is unavailable and warns when the target harness cannot expose a machine-readable capability list:

```text
npx @oovz/sew models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

Three-model routing is available through `--preset three-model`. Use `--preset inherit` to remove the model/thinking fields and return to full inheritance. OpenCode variants are accepted with a validation warning because their available values are model-specific and not exposed through a documented machine-readable list. Cursor and Gemini CLI do not expose a supported per-agent thinking field. Claude Code, Oh My Pi, and Antigravity continue to use their native inheritance behavior.

## Migrate from @oovz/sew 0.9.x

Version 0.10.0 and later use installation-state schema 2 and intentionally do not migrate schema-1 state. Close the affected harness, manually delete the old managed payload and its state file, then reinstall. The exact per-host paths and commands are in [the @oovz/sew migration guide](tools/sew/README.md#migrate-a-09x-static-installation-to-0100-or-later).

## Build from source

To develop or test plugins locally:

```text
npm ci
npm run verify
```

`verify` validates manifests and host contracts, checks that committed generated files are current, runs the test suite, and builds every enabled host projection. Narrower commands:

```text
npm run generate -- --plugin <plugin-id>      # refresh committed adapters and catalogs
npm run build -- --plugin <plugin-id> --host <host>
npm run test:sew
```

Add a [skill](docs/adding-a-skill.md) or [plugin](docs/adding-a-plugin.md), regenerate affected plugin projections, and open a pull request with the refreshed files. The npm release process lives in [tools/sew/README.md](tools/sew/README.md).

## Repository layout

```text
marketplace.json                  canonical plugin and skill catalog
skills/<skill-id>/                canonical, portable Agent Skills
plugins/<plugin-id>/              plugin bundle definitions and plugin-only assets
tools/<tool-id>/                  publishable command-line tool workspaces
schemas/                          catalog, bundle-manifest, and ownership schemas
adapters/                         generated, checked-in host projections
.claude-plugin/marketplace.json   generated Claude Code catalog
.agents/plugins/marketplace.json  generated Codex catalog
.omp-plugin/marketplace.json      generated Oh My Pi catalog
.cursor-plugin/marketplace.json   generated Cursor catalog
scripts/                          generation, installation, and validation tools
test/                             marketplace, workflow, installer, and CLI tests
dist/                             disposable host bundles
```

Generated catalogs and adapters are checked in. Change canonical skills or plugin bundle definitions and run `npm run generate`; never edit generated files by hand.

## Documentation

- [Senior Engineering Workflow](plugins/senior-engineering-workflow/README.md)
- [Tauri v2 Desktop](plugins/tauri-v2-desktop/README.md)
- [Chrome Extension Tester](plugins/chrome-extension-tester/README.md)
- [Adding a standalone skill](docs/adding-a-skill.md)
- [Adding a marketplace plugin](docs/adding-a-plugin.md)
- [Migrating to catalog schema 2](docs/migrating-to-catalog-v2.md)

> [!IMPORTANT]
> Effective access always remains subject to the selected host, session configuration, sandbox, workspace trust, approval mode, and organization policy. Review generated or release-bundled payloads before installing them in a sensitive environment.
