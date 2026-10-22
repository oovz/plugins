<div align="center">

# Otto's plugins

Engineering workflows, desktop-development guidance, and browser-extension testing for coding agents.

[![Validate marketplace](https://github.com/oovz/plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/oovz/plugins/actions/workflows/validate.yml)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
[![npm version](https://img.shields.io/npm/v/%40oovz%2Fsew)](https://www.npmjs.com/package/@oovz/sew)

[Plugins](#available-plugins) · [Install](#install-plugins-and-skills) · [SEW roles](#install-sew-role-configuration) · [Documentation](#documentation)

</div>

Choose a plugin for your coding harness, or use its skills on their own. Senior Engineering Workflow (SEW) adds an engineering workflow and optional specialist roles; Tauri and Chrome Extension Tester provide guidance for those development tasks.

> [!NOTE]
> Install the SEW skill through your harness to use its workflow. The separate `@oovz/sew` CLI configures Researcher, Engineer, and Verifier role files, including model and reasoning settings.

## Available plugins

| Plugin | Version | Purpose |
|---|---:|---|
| [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | 0.14.2 | Carry engineering work through implementation and review, with optional specialists. |
| [Tauri v2 Desktop](plugins/tauri-v2-desktop/) | 1.2.2 | Build, test, upgrade, and package Tauri v2 desktop apps. |
| [Chrome Extension Tester](plugins/chrome-extension-tester/) | 0.1.3 | Test Chrome and WXT extensions through their real browser flows. |

## Available skills

These [Agent Skills](https://agentskills.io/specification) are included in the listed plugins.

| Skill | Bundled by |
|---|---|
| [Senior Engineering Workflow](skills/senior-engineering-workflow/) | `senior-engineering-workflow` |
| [Tauri v2 Desktop](skills/tauri-v2-desktop/) | `tauri-v2-desktop` |
| [Chrome Extension Test](skills/chrome-extension-test/) | `chrome-extension-tester` |
| [WXT Extension Test](skills/wxt-extension-test/) | `chrome-extension-tester` |

## Harness and platform support

SEW's CLI runs on Windows, macOS, and Linux. Plugin installation and role discovery depend on the harness:

| Harness | Plugin or skill installation | Minimum host version |
|---|---|---|
| Claude Code | Native plugin marketplace | Not specified |
| Codex | Native plugin marketplace; SEW roles installed separately | Not specified |
| OpenCode | Static `.opencode` configuration | Not specified |
| Cursor | Native marketplace or direct skill and role files | 2.5+ for marketplace plugins; direct-role minimum not established |
| Gemini CLI | Native extension | Not specified |
| Antigravity CLI (`agy`) | Native CLI plugin | CLI 2.0 custom agents |
| Oh My Pi | Native plugin marketplace | Not specified |

See the [SEW CLI guide](tools/sew/README.md#locations-and-platform-support) for user/project role locations and environment overrides. Native harness execution has not been verified for every listed host; after installation, start a session to confirm discovery.

Windsurf/Cascade can load the portable Agent Skills export under `.agents/skills`. Devin CLI/Desktop Local is not supported by this repository.

## Install plugins and skills

Choose a plugin ID: `senior-engineering-workflow`, `tauri-v2-desktop`, or `chrome-extension-tester`. The examples below use SEW unless the route is skill-only.

Commands using `npm run` or `node scripts/` require Node.js 22 or later and a local checkout. Run them from the repository root:

```text
git clone https://github.com/oovz/plugins.git
cd plugins
npm ci
```

### Claude Code

Run these commands in Claude Code. [Native marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces).

```text
/plugin marketplace add oovz/plugins
/plugin install senior-engineering-workflow@otto-plugins
/plugin install tauri-v2-desktop@otto-plugins
/plugin install chrome-extension-tester@otto-plugins
```

### Codex

From the repository root, add this local marketplace source:

```text
codex plugin marketplace add .
```

Restart the desktop app, open the Plugins Directory, choose `otto-plugins`, and install the desired plugin. Start a new chat to load it. Registering the source and installing a plugin are [separate steps](https://developers.openai.com/plugins/build/plugins). For SEW's Codex roles, also run the [role-configuration command](#install-sew-role-configuration).

### Cursor

For a team marketplace, open Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace → Import from Repo, enter `https://github.com/oovz/plugins`, review its plugins, and save access settings. Install the desired plugin from that marketplace. This route requires a Teams or Enterprise plan. [Cursor marketplace reference](https://cursor.com/docs/plugins).

For local skill and role files, run from this repository root:

```text
node scripts/install.mjs install --plugin senior-engineering-workflow --host cursor --scope project --project /absolute/path/to/project
```

The direct installer handles skills and agents. A bundle declaring commands requires the native plugin route and is rejected by the direct installer before writing.

### OpenCode

Install the plugin's static configuration into the target project:

```text
node scripts/install.mjs install --plugin senior-engineering-workflow --host opencode --scope project --project /absolute/path/to/project
```

Use `--scope user` without `--project` for the configured user directory. Restart OpenCode after installation. See its [agent](https://opencode.ai/docs/agents/) and [skill](https://opencode.ai/docs/skills/) discovery rules.

### Gemini CLI

Build the extension from this repository root, then install it with Gemini CLI:

```text
npm run build -- --plugin senior-engineering-workflow --host gemini-cli
gemini extensions install ./dist/gemini-cli/senior-engineering-workflow
```

Use the command as shown; SEW's `--scope` option applies to the separate role installer. Restart Gemini CLI after installation. [Extension reference](https://geminicli.com/docs/extensions/reference/).

### Antigravity CLI

Build and install the native plugin:

```text
npm run build -- --plugin senior-engineering-workflow --host antigravity
agy plugin install ./dist/antigravity/senior-engineering-workflow
```

Use the native manager to install the plugin. For standalone SEW roles, use the CLI installation below. [Plugin reference](https://antigravity.google/docs/plugins?tab=cli).

### Oh My Pi

```text
omp plugin marketplace add oovz/plugins
omp plugin install senior-engineering-workflow@otto-plugins
```

Start a new session to load the installed plugin. [Marketplace reference](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).

### Windsurf/Cascade portable Agent Skills

Install Tauri's skill or replace its ID with `chrome-extension-tester` to install both extension-testing skills:

```text
node scripts/install.mjs install --plugin tauri-v2-desktop --host portable-agent-skills --scope project --project /absolute/path/to/project
```

This writes `.agents/skills` for [Cascade skill discovery](https://docs.devin.ai/desktop/cascade/skills). Use one of the subagent-capable host routes above for SEW.

Chrome Extension Tester bundles MCP configuration for Codex. For other hosts, finish the [MCP setup](skills/chrome-extension-test/references/troubleshooting.md) after installing its skills.

## Install SEW role configuration

Use `@oovz/sew` for direct Researcher, Engineer, and Verifier configuration. It writes role files in a user scope or one project:

```text
npx @oovz/sew install --host codex --scope user
npx @oovz/sew install --host cursor --scope project --project /absolute/path/to/project
```

Repeated installation leaves identical files unchanged and preserves valid model/reasoning-only overrides. Review other differences before using `--force`, which replaces the three role targets with packaged defaults. Run one SEW operation at a time. If installation stops partway through, correct the reported problem and rerun it.

Configure a role's model and supported reasoning setting:

```text
npx @oovz/sew models configure --host codex --role engineer --model YOUR_MODEL_ID --reasoning high
```

The host decides whether a model is available when the role runs. Use `--reset` to remove a role's overrides. `--model inherit` preserves existing reasoning settings but is unsupported for OpenCode; use `--reset` there. See [model and reasoning settings](tools/sew/README.md#model-and-reasoning-settings) for each host's fields, values, and precedence.

Inspect local role files with the read-only doctor command. The explicit project directory must exist:

```text
npx @oovz/sew doctor --host all --project /absolute/path/to/project --json
```

Doctor reports malformed files, missing roles, and duplicate user/project definitions. Invalid files return a nonzero status; missing roles are `incomplete` with exit status 0. Confirm that the roles load in your harness after these configuration checks pass.

Use your harness's plugin manager for marketplace installation and updates. If direct files and a plugin expose the same active role, choose one source. The [SEW CLI guide](tools/sew/README.md) covers locations, dry runs, overrides, conflict recovery, and upgrades.

## Upgrade from SEW 0.12.x

Use `install` to update direct role files and your harness to manage native plugins. Follow the [CLI migration guide](tools/sew/README.md#host-plugins-and-migration-from-012x) for retired commands and [Worker-role removal](tools/sew/README.md#migration-from-013x) when upgrading older installations.

## Migrate an old Antigravity ownership record

Use this only when removing ownership entries left by the retired generic Antigravity plugin layout. Select the exact ownership record used by that install and the retired plugin directory; do not infer a project record from a guessed hash. The default state base is `${XDG_STATE_HOME:-~/.local/state}/oovz-plugins`, with `user/ownership.json` or `projects/<project-key>/ownership.json` beneath it.

The first command previews the entries. Add `--apply` only after reviewing that output:

```text
node scripts/migrate-antigravity-ownership.mjs --record "<absolute-path-to-ownership.json>" --old-root "<absolute-path-to-retired-plugin-directory>"
node scripts/migrate-antigravity-ownership.mjs --record "<absolute-path-to-ownership.json>" --old-root "<absolute-path-to-retired-plugin-directory>" --apply
```

The migration cleans the selected ownership record. It does not install or remove a native plugin.

## Documentation

- [SEW workflow and examples](plugins/senior-engineering-workflow/README.md), including use with other delivery skills.
- [Tauri desktop guide](plugins/tauri-v2-desktop/README.md).
- [Chrome Extension Tester setup and examples](plugins/chrome-extension-tester/README.md).
- Authoring guides: [add a skill](docs/adding-a-skill.md) or [add a plugin](docs/adding-a-plugin.md).
