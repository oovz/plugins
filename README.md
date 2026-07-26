# Agent Plugins

Cross-host packaging for the Senior Engineering Workflow plugin and its skills, specialist agents, and adapters for Claude Code, Codex, Gemini CLI, and OpenCode.

## Plugin

| Plugin | Description |
|---|---|
| [senior-engineering-workflow](plugins/senior-engineering-workflow/) | Proportional, evidence-driven delivery for repository engineering work |

The main coding agent remains the Engineering Manager: it owns user dialogue, routing, decisions, integration, and completion. The plugin supplies five conditional specialists:

- `workflow-researcher` — bounded evidence gathering and codebase exploration;
- `workflow-architect` — architecture analysis and explicitly assigned planning or design artifacts when a contract or boundary changes;
- `workflow-engineer` — production implementation plus first-line regression, unit, and affected integration tests;
- `workflow-tester` — independent verification, missing risk coverage, and broader test execution;
- `workflow-reviewer` — candidate-preserving adversarial correctness, security, scope, and prohibited-pattern review.

Roles activate according to uncertainty and risk. A small local change does not automatically run the full team.

## Install

### Claude Code

Add the marketplace and install the plugin from a Claude Code session:

```text
/plugin marketplace add oovz/agents
/plugin install senior-engineering-workflow@oovz-agents
```

To install without the interactive picker:

```text
claude plugin install senior-engineering-workflow@oovz-agents
```

The plugin installs the skill and all five specialist agents. Run `/reload-plugins` after installing or updating the plugin so Claude Code reloads its skills and agents; restart the session if needed.

### Codex

```text
codex plugin marketplace add oovz/agents
codex plugin add senior-engineering-workflow@oovz-agents
```

The Codex plugin installs the skill. Codex plugins do not currently package custom-agent TOML files, so install the five agents separately:

```text
node scripts/install-adapters.mjs codex --scope user
```

Use `--scope project --project <path>` for one project's `.codex/agents/` directory. Start a new Codex task after installing or updating the agents.

You can also install **Senior Engineering Workflow** from the ChatGPT desktop plugin directory, then run the adapter command for local Codex custom agents.

### Gemini CLI

Gemini extensions load skills and agents from the extension root. Generate that tree from the canonical sources, then install the extension:

```text
git clone https://github.com/oovz/agents
cd agents
npm run generate:gemini
gemini extensions install .
```

For local development, use `gemini extensions link .`. Restart Gemini CLI after installation or update.

### OpenCode

OpenCode's executable plugin API does not package skills and agents, so install them through its documented configuration directories:

```text
git clone https://github.com/oovz/agents
cd agents
node scripts/install-adapters.mjs opencode --scope user
```

Use `--scope project --project <path>` for a project-local `.opencode/` installation. The installer refuses to overwrite changed files unless `--force` is supplied.

## Host integration

| Host | Native integration | Skill | Five specialist agents |
|---|---|---|---|
| Claude Code | Host plugin catalog | Installed by plugin | Installed by plugin |
| Codex | Host plugin catalog | Installed by plugin | Installed separately as TOML adapters |
| Gemini CLI | Extension | Generated into extension root | Generated into extension root |
| OpenCode | Configuration bundle | Installed by adapter script | Installed by adapter script |

Agent definitions inherit the user's selected model and, where supported, reasoning effort. The plugin sets no turn or step caps. Architect, Engineer, and Tester retain the tools needed to write their assigned artifacts; Researcher and Reviewer preserve the implementation candidate while retaining evidence-gathering and validation tools. Nested delegation is available where the host supports it and remains subject to host/user depth and permission controls.

When upgrading from the previous three-role release, remove the obsolete executor agent file from user or project configuration. Version 0.3 does not install a legacy alias, and the installer does not delete user files automatically. The host catalog is now named `oovz-agents`, so installation targets use `senior-engineering-workflow@oovz-agents`.

## Repository layout

```text
plugins/<name>/                     canonical Claude plugin, skill, references, and agents
adapters/codex/agents/              Codex TOML definitions for five specialist roles
adapters/gemini/agents/             Gemini Markdown definitions for five specialist roles
adapters/opencode/agents/           OpenCode Markdown definitions for five specialist roles
.claude-plugin/marketplace.json     Claude host catalog manifest
.agents/plugins/marketplace.json    Codex host catalog manifest
gemini-extension.json               Gemini extension manifest
scripts/install-adapters.mjs        host adapter installer and Gemini generator
scripts/validate.mjs                manifests, topology, policy, and install-plan validation
```

The root `skills/` and `agents/` directories are generated for Gemini CLI and are gitignored. Edit canonical sources under `plugins/` and `adapters/`, then regenerate.

## Development

Run the repository validation after changing canonical sources, adapters, installers, manifests, or documentation:

```text
npm run validate
```

Validation checks synchronized versions, host catalog paths, parseable YAML/TOML, the exact five-role topology, model and effort inheritance, absence of plugin-authored turn caps, scoped candidate ownership and nested delegation, required skill references, and both dry-run and isolated integration installs. GitHub Actions runs the same command on pushes and pull requests.
