<div align="center">

# Otto's plugins

Engineering workflows, Tauri desktop development, and browser extension debugging for coding agents.

[![Validate marketplace](https://github.com/oovz/plugins/actions/workflows/validate.yml/badge.svg)](https://github.com/oovz/plugins/actions/workflows/validate.yml)

[Plugins](#available-plugins) · [Install](#install-plugins-and-skills) · [SEW CLI](#install-sew-role-configuration)

</div>

## Available plugins

| Plugin | Plugin ID | Use it to |
| --- | --- | --- |
| <img src="plugins/senior-engineering-workflow/assets/icon.svg" alt="" width="24" height="24"> [Senior Engineering Workflow](plugins/senior-engineering-workflow/) | `senior-engineering-workflow` | Investigate, implement, and verify changes with optional specialist roles. |
| <img src="plugins/tauri-v2-desktop/assets/icon.svg" alt="" width="24" height="24"> [Tauri v2 Desktop](plugins/tauri-v2-desktop/) | `tauri-v2-desktop` | Build, test, upgrade, and package Tauri v2 desktop apps. |
| <img src="plugins/browser-extension-debugger/assets/icon.svg" alt="" width="24" height="24"> [Browser Extension Debugger](plugins/browser-extension-debugger/) | `browser-extension-debugger` | Debug live extensions and WXT builds in Chrome, Edge, Firefox, and Safari on macOS. |

You can also use the [Agent Skills](skills/) on their own.

## Install plugins and skills

Choose a plugin from the table above. Replace `PLUGIN_ID` in the commands and paths below with that plugin's ID.

For local installation, clone the repository. Run the local commands below from this checkout.

```sh
git clone https://github.com/oovz/plugins.git
cd plugins
```

Before running a repository script or build command, install Node.js 22 or later and run `npm ci` in the checkout.

### Claude Code

Run in Claude Code.

```text
/plugin marketplace add oovz/plugins
/plugin install PLUGIN_ID@otto-plugins
```

### Codex

```sh
codex plugin marketplace add .
```

Restart the desktop app, open the Plugins Directory, and install the plugin from `otto-plugins`. Start a new chat to use it.

### Cursor

On Teams or Enterprise with Cursor 2.5 or later, import `https://github.com/oovz/plugins` as a team marketplace, then install the plugin from **Customize**. [Cursor team marketplace setup](https://cursor.com/docs/plugins#add-a-team-marketplace)

To install skills and agents directly into a project, run the local installer.

```sh
node scripts/install.mjs install --plugin PLUGIN_ID --host cursor --scope project --project /absolute/path/to/project
```

### Devin Desktop

1. Open [Customize → Plugins](https://app.devin.ai/customize) and select **Add plugin → From repository**.
2. Enter `oovz/plugins` as the repository and `adapters/devin/PLUGIN_ID` as the subdirectory. Install to your personal scope.
3. Sign in with the same account in Devin Desktop and start a Devin Local session. [Devin Desktop customizations](https://docs.devin.ai/desktop/devin-local/customizations)

### Devin CLI

Sign in with `devin auth login`, then install the plugin and start a new local session. [Devin CLI plugin installation](https://docs.devin.ai/cli/extensibility/plugins/overview#installing-a-plugin)

```sh
devin plugins install "oovz/plugins#adapters/devin/PLUGIN_ID"
```

In either Devin client, invoke a skill with `/PLUGIN_ID:SKILL_ID`. For example, `/browser-extension-debugger:browser-extension-debug` opens the browser debugging workflow.

### OpenCode

Install into your project, then restart OpenCode.

```sh
node scripts/install.mjs install --plugin PLUGIN_ID --host opencode --scope project --project /absolute/path/to/project
```

For a user-wide installation, use `--scope user` and omit `--project`.

### Gemini CLI

Build and install the extension, then restart Gemini CLI.

```sh
npm run build -- --plugin PLUGIN_ID --host gemini-cli
gemini extensions install ./dist/gemini-cli/PLUGIN_ID
```

### Antigravity CLI

```sh
npm run build -- --plugin PLUGIN_ID --host antigravity
agy plugin install ./dist/antigravity/PLUGIN_ID
```

### Oh My Pi

```sh
omp plugin marketplace add oovz/plugins
omp plugin install PLUGIN_ID@otto-plugins
```

Start a new session to use the plugin.

### Windsurf/Cascade portable Agent Skills

Use `tauri-v2-desktop` or `browser-extension-debugger` as the plugin ID to install its skills into your project's `.agents/skills`.

```sh
node scripts/install.mjs install --plugin PLUGIN_ID --host portable-agent-skills --scope project --project /absolute/path/to/project
```

## Install SEW role configuration

`@oovz/sew` is the separate CLI for installing the Senior Engineering Workflow's Researcher, Engineer, and Verifier role files directly. Install the plugin through your coding agent to get the workflow skill. On Codex, use the CLI to add the optional specialist roles. The CLI requires Node.js 22 or later.

```sh
npx @oovz/sew install --host codex --scope user
```

See the [SEW CLI guide](tools/sew/README.md) for project and host options, model and reasoning settings, diagnostics, and upgrades.

## Documentation

To extend the marketplace, see [Add a skill](docs/adding-a-skill.md) and [Add a plugin](docs/adding-a-plugin.md).
