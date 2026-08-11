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
| [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | 0.8.3 | Keeps coding decisions in the capable main agent while bounded Researcher, Engineer, Verifier, and Worker roles isolate implementation and noisy evidence when useful. |
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

Skill plugins come from the marketplace:

```text
codex plugin marketplace add oovz/plugins
codex plugin add senior-engineering-workflow@otto-plugins
codex plugin add tauri-v2-desktop@otto-plugins
```

The four Senior Engineering Workflow companion agents are installed by the CLI:

```text
npx @oovz/sew install --host codex --scope user
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

Canonical roles add no host-level thinking, tool, permission, sandbox, hook, or turn-limit overrides. They default to the main model where the host provides model inheritance, and the host/session remains authoritative. Optional model-only aliases are configured with the same CLI:

```text
npx @oovz/sew models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

Three-model routing is available through `--preset three-model`. Use `--preset inherit` to remove only aliases generated by `@oovz/sew` and return to canonical inheritance. Antigravity gets no model aliases: its custom-agent format requires an explicit tool list, which would strip the parent tool set. There the workflow relies on inherited generic or dynamic subagents.

[`packages/sew/`](packages/sew/) is private build source. Release CI builds host projections into `dist/`, stages the publishable package at `release-build/sew/package/`, and writes the tarball plus checksum to `release-build/sew/artifacts/`. The exact same tarball is published to npm and attached to a GitHub Release.

## Build from source

Cloning is only needed for marketplace development or direct bundle inspection.

```text
npm ci
npm run verify
```

After pulling a change that adds, removes, or renames a workspace package, run `npm ci` before using workspace scripts. The `packages/sew/` workspace is private source, not the release package. To exercise the complete CLI locally, run `npm run bundle:sew` and then `node release-build/sew/package/bin/sew.mjs ...`.

Useful narrower commands:

```text
npm run generate -- --plugin senior-engineering-workflow
npm run test:sew
npm run bundle:sew
npm run pack:sew
npm run build -- --plugin senior-engineering-workflow --host gemini-cli
npm run build -- --plugin senior-engineering-workflow --host antigravity
npm run build -- --plugin senior-engineering-workflow --host oh-my-pi
```

`bundle:sew` first builds the current Senior Engineering Workflow host projections under `dist/`, then stages a publishable npm package under `release-build/sew/package/`. `pack:sew` creates the release tarball and `SHA256SUMS.txt` under `release-build/sew/artifacts/`. The private source workspace itself is never published.

Release staging lives outside `dist/`, so `npm run build -- --all` can replace every host projection without touching the staged package or release artifacts. After changing canonical plugin or adapter source, re-run `bundle:sew` before running the staged CLI.

Generated targets:

```text
adapters/claude-code/<plugin-id>/
adapters/codex/<plugin-id>/
adapters/gemini-cli/<plugin-id>/
adapters/antigravity/<plugin-id>/
adapters/oh-my-pi/<plugin-id>/
adapters/opencode/stable/<plugin-id>/
adapters/portable-agent-skills/<plugin-id>/   # only when enabled by the plugin
```

`build` produces the corresponding disposable packages under `dist/`.

## Release `@oovz/sew`

The npm package is assembled only in GitHub Actions from the tagged source revision. The source workspace contains no committed host payloads or duplicated role templates.

1. Bump `packages/sew/package.json#version`.
2. Push the source changes and create a tag named `sew-v<version>`.
3. The `release-sew.yml` build job runs the complete repository verification, rebuilds Senior Engineering Workflow host projections, stages and packs `@oovz/sew`, and uploads the tarball plus checksum as an immutable workflow artifact.
4. A separate release job downloads and verifies that artifact, publishes the exact tarball through npm trusted publishing, and attaches the same tarball and checksum to a GitHub Release.

Configure `@oovz/sew` on npm with `.github/workflows/release-sew.yml` as its trusted GitHub Actions publisher before creating the release tag.

## Repository layout

```text
marketplace.json                  canonical marketplace catalog
schemas/                          canonical manifest and ownership schemas
plugins/<plugin-id>/              canonical plugin source
adapters/                         generated, checked-in host projections
.claude-plugin/marketplace.json   generated Claude Code catalog
.agents/plugins/marketplace.json  generated Codex catalog
.omp-plugin/marketplace.json      generated Oh My Pi catalog
packages/sew/                     private source for the CI-built installation/model CLI
scripts/                          generation, developer installation, and validation tools
test/                             marketplace, workflow, installer, and CLI tests
dist/                             disposable host bundles
```

Do not edit generated catalogs or adapters by hand. Change canonical plugin source and run `npm run generate`.

## Documentation

- [Senior Engineering Workflow](plugins/senior-engineering-workflow/README.md)
- [Tauri v2 Desktop](plugins/tauri-v2-desktop/README.md)
- [Adding a marketplace plugin](docs/adding-a-plugin.md)

> [!IMPORTANT]
> Effective access always remains subject to the selected host, session configuration, sandbox, workspace trust, approval mode, and organization policy. Review generated or release-bundled payloads before installing them in a sensitive environment.
