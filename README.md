<div align="center">

# Otto's plugins

My plugins for agentic coding harnesses.

[![Validate marketplace](https://github.com/oovz/plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/oovz/plugins/actions/workflows/validate.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
[![npm version](https://img.shields.io/npm/v/%40oovz%2Fsew)](https://www.npmjs.com/package/@oovz/sew)

</div>

## Available plugins

| Plugin | Version | What it does |
|---|---:|---|
| [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | 0.9.7 | Keeps coding decisions in the capable main agent while bounded Researcher, Engineer, Verifier, and Worker roles isolate implementation and noisy evidence when useful. |
| [Tauri v2 Desktop](plugins/tauri-v2-desktop/) | 1.1.0 | Secure, evidence-driven guidance for building, testing, upgrading, and distributing Tauri v2 desktop applications on Windows, macOS, and Linux. |

## Compatibility

The validated coding-harness targets are:

| Host | Senior Engineering Workflow | Tauri v2 Desktop | Distribution |
|---|---|---|---|
| Claude Code | Skill + four named subagents | Skill | Native Claude marketplace |
| Codex | Skill + four companion agents | Skill | Codex marketplace plus companion/static payload |
| OpenCode | Skill + four Markdown subagents | Skill | Static host payload |
| Gemini CLI | Skill + four extension subagents | Skill | Static host payload |
| Antigravity | Skill; bounded roles use inherited generic/dynamic subagents | Skill | Native Antigravity plugin payload |
| Oh My Pi (`omp`) | Skill + four task agents | Skill | Native OMP marketplace |

Tauri v2 Desktop also ships a portable Agent Skills export. That format carries skills only (no harness, no subagents), which is why Senior Engineering Workflow does not target it.

## Install

`@oovz/sew` installs Senior Engineering Workflow on every host. Tauri v2 Desktop is skill-only and installs through each host's native marketplace where one exists. Pick your harness below.

<details>
<summary>Claude Code</summary>

```text
/plugin marketplace add oovz/plugins
/plugin install senior-engineering-workflow@otto-plugins
/plugin install tauri-v2-desktop@otto-plugins
/reload-plugins
```

From the CLI:

```text
claude plugin marketplace add oovz/plugins
claude plugin install senior-engineering-workflow@otto-plugins --scope user
claude plugin install tauri-v2-desktop@otto-plugins --scope user
```
</details>

<details>
<summary>Codex</summary>

Using `@oovz/sew` (recommended):

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
```
</details>

<details>
<summary>OpenCode</summary>

```text
npx @oovz/sew install --host opencode --scope user
```

Add `--scope project --project /absolute/path/to/project` for a single project. Tauri v2 Desktop has no CLI install; from a clone of this repository:

```text
node scripts/install.mjs install --plugin tauri-v2-desktop --host opencode --variant stable --scope user
```
</details>

<details>
<summary>Gemini CLI</summary>

```text
npx @oovz/sew install --host gemini-cli --scope user
```

Tauri v2 Desktop, from a clone:

```text
npm run build -- --plugin tauri-v2-desktop --host gemini-cli
gemini extensions install ./dist/gemini-cli/tauri-v2-desktop
```
</details>

<details>
<summary>Antigravity</summary>

```text
npx @oovz/sew install --host antigravity --scope user
```

Tauri v2 Desktop, from a clone:

```text
npm run build -- --plugin tauri-v2-desktop --host antigravity
agy plugin install ./dist/antigravity/tauri-v2-desktop
```
</details>

<details>
<summary>Oh My Pi</summary>

```text
/marketplace add oovz/plugins
/marketplace install senior-engineering-workflow@otto-plugins
/marketplace install tauri-v2-desktop@otto-plugins
/reload-plugins
```

From the CLI:

```text
omp plugin marketplace add oovz/plugins
omp plugin install --scope user senior-engineering-workflow@otto-plugins
omp plugin install --scope user tauri-v2-desktop@otto-plugins
```
</details>

`update` and `uninstall` mirror `install` for the same host and scope. `npx @oovz/sew doctor` checks all six hosts, and `--dry-run` previews any operation.

### Configure subagent models

By default the four roles run on your main agent's model, with its thinking level, tools, and permissions. On Codex, OpenCode, and Gemini CLI you can route some roles to another model; `models configure` edits the installed role agents in place, changing only their model and thinking fields:

```text
npx @oovz/sew models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

Three-model routing is available through `--preset three-model`. Use `--preset inherit` to remove the model/thinking fields and return to full inheritance. Claude Code, Oh My Pi, and Antigravity installs are owned by their hosts or have no editable agents, so model routing is inherit-only there.

## Build from source

For contributors who want to develop or test plugins locally:

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

Add a plugin per [Adding a marketplace plugin](docs/adding-a-plugin.md), regenerate, and open a pull request with the refreshed files. The npm release process lives in [packages/sew/README.md](packages/sew/README.md).

## Repository layout

```text
marketplace.json                  canonical marketplace catalog
schemas/                          canonical manifest and ownership schemas
plugins/<plugin-id>/              canonical plugin source
adapters/                         generated, checked-in host projections
.claude-plugin/marketplace.json   generated Claude Code catalog
.agents/plugins/marketplace.json  generated Codex catalog
.omp-plugin/marketplace.json      generated Oh My Pi catalog
packages/sew/                     source for the @oovz/sew installation CLI
scripts/                          generation, installation, and validation tools
test/                             marketplace, workflow, installer, and CLI tests
dist/                             disposable host bundles
```

Generated catalogs and adapters are checked in. Change canonical plugin source and run `npm run generate`; never edit generated files by hand.

## Documentation

- [Senior Engineering Workflow](plugins/senior-engineering-workflow/README.md)
- [Tauri v2 Desktop](plugins/tauri-v2-desktop/README.md)
- [Adding a marketplace plugin](docs/adding-a-plugin.md)

> [!IMPORTANT]
> Effective access always remains subject to the selected host, session configuration, sandbox, workspace trust, approval mode, and organization policy. Review generated or release-bundled payloads before installing them in a sensitive environment.
