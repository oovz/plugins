<div align="center">

# Otto's plugins

Plugins, Agent Skills, and host-configuration tools for coding harnesses.

[![Validate marketplace](https://github.com/oovz/plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/oovz/plugins/actions/workflows/validate.yml)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
[![npm version](https://img.shields.io/npm/v/%40oovz%2Fsew)](https://www.npmjs.com/package/@oovz/sew)

</div>

## Available plugins

| Plugin | Version | Purpose |
|---|---:|---|
| [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | 0.14.0 | Direct engineering ownership with three optional specialists. |
| [Tauri v2 Desktop](plugins/tauri-v2-desktop/) | 1.2.1 | Tauri architecture, security, testing, upgrades, and distribution. |
| [Chrome Extension Tester](plugins/chrome-extension-tester/) | 0.1.2 | Test extensions through browser-managed Chrome DevTools MCP. |

## Available skills

Canonical skills follow the [Agent Skills specification](https://agentskills.io/specification). Plugins reference these skill sources and package them in their own host distributions.

| Skill | Bundled by |
|---|---|
| [Senior Engineering Workflow](skills/senior-engineering-workflow/) | `senior-engineering-workflow` |
| [Tauri v2 Desktop](skills/tauri-v2-desktop/) | `tauri-v2-desktop` |
| [Chrome Extension Test](skills/chrome-extension-test/) | `chrome-extension-tester` |
| [WXT Extension Test](skills/wxt-extension-test/) | `chrome-extension-tester` |

## Harness and platform support

The repository generates native plugin adapters and independently distributes the SEW role-configuration CLI. Plugin marketplace ownership stays with each harness. The SEW CLI writes the agent files below; it does not install plugins, skills, or MCP servers.

| Harness | Native plugin/skill distribution | SEW role files (user / project) | CLI OS | Minimum host version | Last native harness acceptance |
|---|---|---|---|---|---|
| Claude Code | Native plugin marketplace | `${CLAUDE_CONFIG_DIR:-~/.claude}/agents` / `<project>/.claude/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not exercised locally |
| Codex | Native plugin marketplace | `${CODEX_HOME:-~/.codex}/agents` / `<project>/.codex/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not exercised locally |
| OpenCode | Static `.opencode` configuration | `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode}/agents` / `<project>/.opencode/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not exercised locally |
| Cursor | Native plugin marketplace and direct agent files | `~/.cursor/agents` / `<project>/.cursor/agents` | Windows/macOS/Linux | 2.5+ for marketplace plugin; direct-role minimum not established here | Not exercised locally |
| Gemini CLI | Native extension and skills | `${GEMINI_CLI_HOME:-~}/.gemini/agents` / `<project>/.gemini/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not exercised locally |
| Antigravity CLI (`agy`) | Native CLI plugin and skills | `~/.gemini/config/agents` / `<project>/.agents/agents` | Windows/macOS/Linux | CLI 2.0 custom agents | Not exercised locally |
| Oh My Pi (`omp`) | Native plugin marketplace | `~/.omp/agent/agents` / `<project>/.omp/agents` | Windows/macOS/Linux | Not specified in reviewed upstream agent docs | Not exercised locally |

The release workflow installs and smoke-tests the same npm archive on each native OS with Node 22 and 24. It validates configuration files and package invocation; it does not launch every harness. The repository's generated projections and standalone helper tests also run in its OS validation matrix.

Windsurf/Cascade can consume the portable skill exports from `.agents/skills`; this repository does not claim a Windsurf-native plugin adapter. Devin CLI/Desktop Local is not a generated target. Its current documented plugin formats include `.devin-plugin`, Claude plugins/marketplaces, and Agent Plugins. See the [Devin plugin overview](https://docs.devin.ai/cli/extensibility/plugins/overview) and [release notes](https://docs.devin.ai/cli/changelog/stable).

## Install plugins and skills

Choose a plugin ID: `senior-engineering-workflow`, `tauri-v2-desktop`, or `chrome-extension-tester`. The examples below use SEW unless the route is skill-only.

For commands using `npm run` or `node scripts/`, first clone this repository and run them from its root:

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

Restart the desktop app, open the Plugins Directory, choose the `otto-plugins` marketplace, and install the desired plugin. Start a new chat to test it. The [official packaging guide](https://developers.openai.com/plugins/build/plugins) distinguishes source registration from plugin installation. SEW's Codex roles are installed separately with the role-configuration command below.

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

This native extension command has no SEW `--scope` option. Restart Gemini CLI after installation. [Extension reference](https://geminicli.com/docs/extensions/reference/).

### Antigravity CLI

Build and install the native plugin:

```text
npm run build -- --plugin senior-engineering-workflow --host antigravity
agy plugin install ./dist/antigravity/senior-engineering-workflow
```

Use the native manager for CLI plugin registration and discovery. Project plugin discovery through the generic installer's `.agents/plugins` export remains unverified. Direct SEW role files use the documented agent directories in the support table. [Plugin reference](https://antigravity.google/docs/plugins?tab=cli).

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

This writes `.agents/skills` for [Cascade skill discovery](https://docs.devin.ai/desktop/cascade/skills). SEW uses the subagent-capable host routes above. Devin-native plugin acceptance remains unverified.

Chrome Extension Tester bundles MCP configuration for Codex. For other hosts, finish the [MCP setup](skills/chrome-extension-test/references/troubleshooting.md) after installing its skills.

## Install SEW role configuration

The CLI installs three host-native role files. It never registers a marketplace or edits plugin caches. Install in the user scope or a single project:

```text
npx @oovz/sew install --host codex --scope user
npx @oovz/sew install --host cursor --scope project --project /absolute/path/to/project
```

Repeated installation leaves identical files unchanged and preserves valid model/reasoning-only overrides. Other differences require `--force`, which replaces only the three SEW role targets. Other files and host settings remain in place. Run one SEW operation at a time and finish editing the role files before running it. SEW preflights all three targets, then writes them in sequence. A filesystem error can leave earlier writes in place; correct the reported problem and rerun the command.

Configure one role's model and, where supported, its host-native reasoning field:

```text
npx @oovz/sew models configure --host codex --role engineer --model YOUR_MODEL_ID --reasoning high
npx @oovz/sew models configure --host opencode --role researcher --model YOUR_PROVIDER/YOUR_MODEL_ID --reasoning high
npx @oovz/sew models configure --host claude-code --role verifier --model sonnet --reasoning high
npx @oovz/sew models configure --host antigravity --role engineer --model flash
```

Claude Code maps `--reasoning` to `effort`; Codex, OpenCode, and Oh My Pi use their native effort fields. Antigravity accepts `inherit`, `flash`, and `pro` model tiers. The CLI validates model syntax and local file schemas without querying a model catalog. The host determines availability when it runs the agent. `--reset` removes the selected file's model/reasoning overrides and leaves configuration resolution to the host.

`--model inherit` restores native inheritance: it writes `inherit` for Claude Code, Cursor, Gemini CLI, and Antigravity CLI, and removes the model field for Codex and Oh My Pi. Existing reasoning settings are preserved unless `--reasoning` is supplied. **`--model inherit` is not supported for OpenCode**; use `--reset` to clear both overrides and return to host-default resolution.

Use read-only doctor to inspect user/project role files, required-role coverage, and duplicate definitions. Invalid files return a nonzero status; missing roles are reported as `incomplete` with exit status 0. The explicit project directory must exist:

```text
npx @oovz/sew doctor --host all --project /absolute/path/to/project --json
```

See [SEW installation and migration](tools/sew/README.md).

## Upgrade from SEW 0.12.x

Version 0.13 is configuration-only. The old `update` and `uninstall` commands and installation-state files are retired. Run `install`; use `--force` when you have reviewed edits to a role file. Existing native marketplace plugins remain under their harness's control. Disable a duplicate marketplace role source in the harness if the direct role files are the configuration you intend to use.

## Migrate an old Antigravity ownership record

Use this only when removing ownership entries left by the retired generic Antigravity plugin layout. Select the exact ownership record used by that install and the retired plugin directory; do not infer a project record from a guessed hash. The default state base is `${XDG_STATE_HOME:-~/.local/state}/oovz-plugins`, with `user/ownership.json` or `projects/<project-key>/ownership.json` beneath it.

The first command previews the entries. Add `--apply` only after reviewing that output:

```text
node scripts/migrate-antigravity-ownership.mjs --record "<absolute-path-to-ownership.json>" --old-root "<absolute-path-to-retired-plugin-directory>"
node scripts/migrate-antigravity-ownership.mjs --record "<absolute-path-to-ownership.json>" --old-root "<absolute-path-to-retired-plugin-directory>" --apply
```

The migration removes matching retired Antigravity ownership entries from that one record and removes the obsolete `variant` property from retained entries. It does not install or remove a native plugin.

## Repository checks

```text
npm ci
npm run verify
```

`verify` checks canonical plugin schemas and generated adapters, runs tests, and builds the native marketplace/extension distributions. The SEW release builds one configuration-only package and gates publication on testing that exact archive across Windows, macOS, and Linux.

Adding guidance: [standalone skill](docs/adding-a-skill.md) · [marketplace plugin](docs/adding-a-plugin.md).
