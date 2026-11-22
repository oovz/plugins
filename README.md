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

Follow the steps for your coding agent. Where an example uses `senior-engineering-workflow`, you can substitute another plugin ID from the table.

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
/plugin install senior-engineering-workflow@otto-plugins
```

### Codex

```sh
codex plugin marketplace add .
```

Restart the desktop app, open the Plugins Directory, and install the plugin from `otto-plugins`. Start a new chat to use it. For the optional SEW specialist roles, run the [role installer](#install-sew-role-configuration) too.

### Cursor

On Teams or Enterprise with Cursor 2.5 or later, import `https://github.com/oovz/plugins` as a team marketplace, then install the plugin from **Customize**. [Cursor team marketplace setup](https://cursor.com/docs/plugins#add-a-team-marketplace)

To install skills and agents directly into a project, run the local installer.

```sh
node scripts/install.mjs install --plugin senior-engineering-workflow --host cursor --scope project --project /absolute/path/to/project
```

### OpenCode

Install into your project, then restart OpenCode.

```sh
node scripts/install.mjs install --plugin senior-engineering-workflow --host opencode --scope project --project /absolute/path/to/project
```

For a user-wide installation, use `--scope user` and omit `--project`.

### Gemini CLI

Build and install the extension, then restart Gemini CLI.

```sh
npm run build -- --plugin senior-engineering-workflow --host gemini-cli
gemini extensions install ./dist/gemini-cli/senior-engineering-workflow
```

### Antigravity CLI

```sh
npm run build -- --plugin senior-engineering-workflow --host antigravity
agy plugin install ./dist/antigravity/senior-engineering-workflow
```

### Oh My Pi

```sh
omp plugin marketplace add oovz/plugins
omp plugin install senior-engineering-workflow@otto-plugins
```

Start a new session to use the plugin.

### Windsurf/Cascade portable Agent Skills

Install the Tauri or browser extension debugging skills into your project's `.agents/skills`.

```sh
node scripts/install.mjs install --plugin tauri-v2-desktop --host portable-agent-skills --scope project --project /absolute/path/to/project
```

Use `browser-extension-debugger` to install both extension debugging skills.

## Install SEW role configuration

Use `@oovz/sew` to install the Researcher, Engineer, and Verifier role files. Use the plugin installation above for the workflow skill. The CLI requires Node.js 22 or later.

```sh
npx @oovz/sew install --host codex --scope user
```

See the [SEW CLI guide](tools/sew/README.md) for project and host options, model and reasoning settings, diagnostics, and upgrades.

## Documentation

To extend the marketplace, see [Add a skill](docs/adding-a-skill.md) and [Add a plugin](docs/adding-a-plugin.md).
