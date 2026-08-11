# Host compatibility

This matrix describes the host contracts reviewed on 2026-08-02. It distinguishes a host-native package from a marketplace-generated companion bundle. A green build in this repository proves that files match the documented shape; it cannot prove that a user's installed host version, account, model provider, organization policy, or preview flag exposes every capability.

## Summary

| Target | Host status | Delivery used here | Generated bundle | Important boundary |
|---|---|---|---|---|
| Claude Code | Stable plugin and marketplace APIs | Native plugin | `dist/claude-code/<plugin-id>/` | Skills and agents are plugin-namespaced; some agent security fields are ignored in plugin agents. |
| Codex | Stable plugin catalog; local custom-agent configuration | Native skill plugin with companion agents, or fully standalone static install | `dist/codex/<plugin-id>/` | A Codex plugin packages the skill; custom-agent TOML profiles are installed separately. |
| Gemini CLI | Stable extensions and skills; subagents are preview | Native extension | `dist/gemini-cli/<plugin-id>/` | An extension manifest must be at the installed root; remote monorepo-subdirectory extension install is not documented. |
| Antigravity 2.0 | Native workspace/global customizations | Native plugin directory | `dist/antigravity/<plugin-id>/` | Antigravity is not Gemini CLI and does not consume `gemini-extension.json`. |
| Antigravity CLI | Native staged plugins | Native plugin via `agy` | `dist/antigravity/<plugin-id>/` | `agy plugin install` stages a bundle under its own profile; no update subcommand is documented. |
| OpenCode stable | Stable static agents/skills and executable JS/TS hooks | Static configuration bundle | `dist/opencode/stable/<plugin-id>/` | The stable JS plugin API is executable code, not a package container for Markdown agents and skills. |
| Portable Agent Skills | Open specification | Skill-only bundle | `dist/portable-agent-skills/<plugin-id>/` | The specification standardizes a skill directory, not subagents, permissions, or installation. |

The repository root is a marketplace source. It is never a Gemini extension, Antigravity plugin, Claude plugin, Codex plugin, or OpenCode module. Install a generated per-plugin bundle or use a host marketplace whose checked-in catalog resolves the matching generated adapter directory.

## Claude Code

### Native layout and installation

A Claude plugin has this layout:

```text
<plugin-root>/
├── .claude-plugin/plugin.json
├── skills/<skill-id>/SKILL.md
└── agents/<agent-id>.md
```

Only `plugin.json` belongs in `.claude-plugin/`; component directories remain at the native plugin root. This marketplace publishes a generated `.claude-plugin/marketplace.json` whose local entries point at `adapters/claude-code/<plugin-id>/`. Canonical prompts remain under `plugins/<plugin-id>/`; the adapter is the self-contained, capability-checked native package.

```text
claude plugin marketplace add oovz/plugins
claude plugin install senior-engineering-workflow@otto-plugins --scope user
```

The equivalent interactive commands begin with `/plugin`; run `/reload-plugins` to activate a newly installed or updated plugin in the current session. Validate the marketplace with `claude plugin validate .` and an individual bundle with `claude plugin validate dist/claude-code/<plugin-id>`.

Claude namespaces a plugin skill as `/plugin-name:skill-name` and a top-level plugin agent as `plugin-name:agent-name`. A subdirectory below `agents/` adds another namespace segment. This prevents two marketplace plugins with the same logical role name from silently becoming the same plugin agent.

Standalone custom agents, when deliberately installed outside a plugin, live at `.claude/agents/` for a project or `~/.claude/agents/` for a user. They are not needed for this marketplace's normal Claude installation.

### Agent contract

Claude agent Markdown requires `name` and `description`. Supported optional fields include `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `effort`, `background`, `isolation`, `color`, and `initialPrompt`. The Markdown body is the agent system prompt.

The generated profiles always use `model: inherit` and omit `effort` and `maxTurns`. Agent permissions follow the canonical manifest's `permissionPolicy`:

- `explicit` renders role-appropriate `tools` or `disallowedTools`;
- `inherit` omits both fields so Claude resolves tools and MCP access from the active session.

The marketplace does not depend on plugin-agent `hooks`, `mcpServers`, or `permissionMode`. Behavioral role prompts remain authoritative even when host permissions are inherited.

Claude currently permits nested subagents to three layers below the main conversation by default, configurable with `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`. It also documents defaults of 200 spawned subagents per session and 20 concurrently running subagents in versions that support those controls. The workflow deliberately does not consume that nesting allowance: the main agent owns routing and every role profile is a leaf.

Agent permission modes do not form an unconditional child sandbox. A parent in `bypassPermissions`, `acceptEdits`, or auto mode can take precedence, and user, project, local, or managed settings can further change effective access.

Official references: [plugins](https://code.claude.com/docs/en/plugins), [marketplaces and CLI commands](https://code.claude.com/docs/en/plugin-marketplaces), [custom subagents](https://code.claude.com/docs/en/sub-agents), [skills](https://code.claude.com/docs/en/skills), and [permissions](https://code.claude.com/docs/en/permissions).

## Codex

### Native plugin and catalog

A native Codex plugin has this relevant layout:

```text
<plugin-root>/
├── .codex-plugin/plugin.json
└── skills/<skill-id>/SKILL.md
```

The repo-scoped host catalog is `.agents/plugins/marketplace.json`. Plugin `source.path` values are relative to the marketplace root and begin with `./`; this marketplace points them at `adapters/codex/<plugin-id>/`. Codex also supports Git-backed `git-subdir` marketplace entries, which makes a multi-plugin repository a valid catalog source while keeping each native projection self-contained.

```text
codex plugin marketplace add oovz/plugins
codex plugin add senior-engineering-workflow@otto-plugins
```

Use `codex plugin marketplace upgrade [marketplace-name]` to refresh a configured Git marketplace, `codex plugin list --json` to inspect installed and available plugins, and `codex plugin remove <plugin[@marketplace]>` to remove one. The ChatGPT desktop Plugins Directory is the native graphical install surface.

Native plugins are available in Codex CLI and the ChatGPT desktop plugin surface, but the current Codex IDE extension does not expose them. Start a new Codex session after a native plugin install. Standalone local skills and custom agents remain the compatibility path for IDE use.

Every Codex-enabled canonical manifest must explicitly declare `hosts.codex.capabilities`; the list is copied to `interface.capabilities` for the Codex listing and is never inferred from agent topology. It is reviewed install-surface metadata only; it does not grant runtime tools or override sandbox and approval policy. The repository validates Codex's current submission bounds of 1–20 unique non-empty single-line strings, each at most 120 characters. Capability metadata belongs only under the Codex host configuration.

Codex native plugins package skills, hooks, MCP configuration, app mappings, and assets. The native plugin format does not package local custom-agent TOML profiles, so the workflow supports two explicit local modes:

- `companion`: install only collision-safe custom agents, while a native plugin supplies the skill;
- `standalone`: install the skill into a documented local skill discovery directory and install the same custom agents, without relying on the plugin catalog.

Project agents live at `.codex/agents/<plugin-id>-<role>.toml`; personal agents live at `${CODEX_HOME:-$HOME/.codex}/agents/<plugin-id>-<role>.toml`. Project skills live below `.agents/skills/`; personal skills live below `$HOME/.agents/skills/`. The installer never uses an unprefixed role filename.

### Agent contract

Each custom-agent TOML file requires `name`, `description`, and `developer_instructions`. It may use ordinary supported Codex configuration keys such as `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and `skills.config`. Generated profiles omit model and effort so Codex resolves each independently from an explicit spawn value, then `[agents]` defaults, then the parent. When `permissionPolicy` is `explicit`, the adapter emits `sandbox_mode`; when it is `inherit`, the adapter omits `sandbox_mode` and leaves permission and sandbox resolution to the active session. Codex documents this standalone custom-agent format as evolving, so it remains a generated companion contract rather than canonical source.

Codex exposes `[agents]` settings for enabling multi-agent work, default subagent model and reasoning effort, and maximum concurrent threads. The current public documentation does not state a stable numeric nesting-depth contract, so this marketplace does not invent one and keeps every role leaf.

Subagents inherit current parent runtime settings unless a role, spawn request, configured subagent default, or managed host policy overrides them. A rendered `sandbox_mode` is therefore a requested role setting rather than an unconditional child sandbox; a profile with `permissionPolicy: inherit` emits no such override.

Official references: [Codex plugins](https://developers.openai.com/codex/plugins), [plugin packaging and marketplaces](https://developers.openai.com/plugins/build/plugins), [plugin CLI commands](https://developers.openai.com/codex/cli/reference), [custom agents and inheritance](https://developers.openai.com/codex/subagents), [local skill discovery](https://developers.openai.com/codex/build-skills), and [approvals and sandboxing](https://developers.openai.com/codex/agent-approvals-security).

## Gemini CLI

### Native extension layout and installation

A generated Gemini extension is a self-contained tree:

```text
<extension-root>/
├── gemini-extension.json
├── skills/<skill-id>/SKILL.md
└── agents/<plugin-id>-<role>.md
```

Gemini copies an installed extension below `~/.gemini/extensions/<extension-name>/`. Use the generated extension root, not this marketplace root:

```text
gemini extensions install ./dist/gemini-cli/<plugin-id>
```

For local development use `gemini extensions link ./dist/gemini-cli/<plugin-id>`. Use `gemini extensions update <name>` or `gemini extensions update --all` for installed remote extensions, and restart the CLI after any management operation.

Gemini's extension installer accepts a GitHub repository URL or a local path plus an optional `--ref`; it does not document an extension subdirectory option. Its release guide requires `gemini-extension.json` at the absolute root of the repository or release archive. Therefore `gemini extensions install https://github.com/oovz/plugins` is unsupported for this multi-plugin root. Remote distribution must use a per-plugin repository/ref or a release archive whose root is `dist/gemini-cli/<plugin-id>`.

Standalone Gemini agents use `.gemini/agents/*.md` at project scope or `~/.gemini/agents/*.md` at user scope, but the generated extension carries them under its own `agents/` directory. Skills can also be discovered from `.gemini/skills/`, `.agents/skills/`, `~/.gemini/skills/`, and `~/.agents/skills/` when not packaged in an extension.

### Agent contract

Gemini agent Markdown requires `name` and `description`. Optional fields are `kind` (`local` or `remote`), `tools`, `mcpServers`, `model`, `temperature`, `max_turns`, and `timeout_mins`. Omitted `tools` inherit the parent tool set; omitted `model` defaults to `inherit`; host defaults are 30 turns and 10 minutes when the optional caps are omitted.

Generated local profiles use only documented tool identifiers:

| Capability | Exact Gemini tool identifiers |
|---|---|
| Repository reads | `read_file`, `read_many_files`, `grep_search`, `glob`, `list_directory` |
| Official-web research | `google_web_search`, `web_fetch` |
| Repository execution and writes | `run_shell_command`, `replace`, `write_file` |

Each role receives the minimum applicable rows. The extension does not set a model name, temperature, turn cap, timeout, MCP server, hook, or policy elevation. Gemini subagents cannot invoke other subagents, even when their tool list uses `*`; the leaf-role topology is therefore native to this host.

Gemini's policy engine can further allow, deny, or ask for a tool call and gives user and administrator policy tiers precedence over extension policy. Approval mode, sandbox configuration, and policy rules remain the effective authority.

Official references: [extension format and commands](https://geminicli.com/docs/extensions/reference/), [extension release root requirements](https://geminicli.com/docs/extensions/releasing/), [subagent schema and recursion](https://geminicli.com/docs/core/subagents/), [skills and discovery paths](https://geminicli.com/docs/cli/skills/), [tools](https://geminicli.com/docs/reference/tools/), and [policy engine](https://geminicli.com/docs/reference/policy-engine/).

## Antigravity 2.0 and Antigravity CLI

Antigravity and Gemini CLI are separate targets. A Gemini extension uses `gemini-extension.json`; an Antigravity plugin uses `plugin.json`. They also use different agent frontmatter fields, tool identifiers, installation directories, and command surfaces.

### Native plugin layout and installation

```text
<plugin-root>/
├── plugin.json
├── skills/
├── agents/
├── rules/          # optional
├── mcp_config.json # optional
└── hooks.json      # optional
```

Antigravity 2.0 discovers a workspace plugin at `.agents/plugins/<plugin-id>/` or `_agents/plugins/<plugin-id>/`, and a global plugin at `~/.gemini/config/plugins/<plugin-id>/`. Antigravity CLI stages an installed bundle under `~/.gemini/antigravity-cli/plugins/<plugin-id>/`:

```text
agy plugin install ./dist/antigravity/<plugin-id>
agy plugin list
agy plugin disable <plugin-id>
agy plugin enable <plugin-id>
agy plugin uninstall <plugin-id>
```

The CLI documentation does not publish a plugin update subcommand. Rebuild the bundle, review it, and reinstall using the host's currently documented lifecycle instead of assuming an update command exists.

The two official manifest pages are not fully aligned: the Antigravity 2.0 page says `name` may default to the directory name, while the CLI schema requires `name`. Generated bundles always include a schema-valid `name` and optional `description`. The published CLI schema disallows additional fields, so this adapter does not add an unsupported `version` field.

### Agent contract

Antigravity custom-agent Markdown requires `name` and `description`. Its documented optional fields are `tools`, `mainAgent`, `subagent`, `model`, `commandExecutionPolicy`, `mcpServers`, `skills`, and `plugins`. Generated roles set `mainAgent: false`, `subagent: true`, `model: inherit`, and `commandExecutionPolicy: sandbox`.

| Capability | Exact Antigravity tool identifiers |
|---|---|
| Repository reads | `view_file`, `list_dir`, `find_by_name`, `grep_search` |
| Official-web research | `search_web`, `read_url_content` |
| Repository execution and writes | `run_command`, `write_to_file`, `replace_file_content`, `multi_replace_file_content` |

Antigravity warns that an unmapped or misspelled tool name may hang a subagent, so generation and validation use an explicit host-native allowlist. The workflow does not grant its leaf roles `invoke_subagent`, `define_subagent`, or other collaboration tools.

Antigravity models may be `inherit`, `flash`, or `pro` in static agent frontmatter. Reasoning effort is a runtime CLI setting rather than an agent-file field, so generated roles inherit the model and do not pin effort. Antigravity permits nesting to a maximum depth of 10, but these profiles remain leaf agents for cross-host parity.

Subagents inherit the parent's allowed command prefixes, read/write directory scopes, and sandbox settings. Permission requests bubble to the main UI. Those inherited controls, plus user configuration, are authoritative; the profile's tool list and `commandExecutionPolicy` are bounded defaults.

Official references: [Antigravity 2.0 plugins and discovery](https://antigravity.google/docs/plugins), [Antigravity 2.0 custom subagents](https://antigravity.google/docs/subagents), [CLI plugins and commands](https://antigravity.google/docs/cli/plugins), [CLI custom agents](https://antigravity.google/docs/cli/subagents), [CLI permissions](https://antigravity.google/docs/cli/permissions), [models](https://antigravity.google/docs/models), and [Gemini CLI migration](https://antigravity.google/docs/cli/gcli-migration).

## OpenCode stable

Stable OpenCode has two different extension surfaces:

- static skills and agent Markdown in configuration directories;
- executable JavaScript or TypeScript plugins loaded from `.opencode/plugins/`, `~/.config/opencode/plugins/`, or npm packages listed in the singular `plugin` field of `opencode.json`.

The executable plugin API is an event/tool hook surface; it does not package a static agent-and-skill bundle. The stable marketplace adapter therefore installs files directly into documented configuration locations:

```text
project: .opencode/skills/<skill-id>/SKILL.md
project: .opencode/agents/<plugin-id>-<role>.md
user:    ~/.config/opencode/skills/<skill-id>/SKILL.md
user:    ~/.config/opencode/agents/<plugin-id>-<role>.md
```

An agent filename becomes its ID. Each generated agent uses `mode: subagent`, omits `model` so it inherits the invoking primary agent's model, and omits `steps` so the plugin does not impose an arbitrary cap.

Stable agent permissions use the singular `permission` mapping and `allow`, `ask`, or `deny`; the older `tools` field is deprecated. The `permission.task` mapping controls child-agent calls. Profiles with `permissionPolicy: explicit` render capability-derived permissions. Profiles with `permissionPolicy: inherit` omit the permission mapping and use OpenCode's normal global, project, and agent configuration resolution. Behavioral leaf-role constraints remain in the prompt, and the workflow does not depend on nested delegation.

Official references: [agents and task permissions](https://opencode.ai/docs/agents/), [skills and discovery paths](https://opencode.ai/docs/skills/), [stable executable plugins](https://opencode.ai/docs/plugins/), and [permissions](https://opencode.ai/docs/permissions/).


## Portable Agent Skills

The portable output follows the [Agent Skills specification](https://agentskills.io/specification). Its generated tree is `dist/portable-agent-skills/<plugin-id>/.agents/skills/<skill-id>/SKILL.md`, so copy or unpack the bundle into a project without flattening it. Each skill has an exact uppercase `SKILL.md`, required `name` and `description` frontmatter, and optional `license`, `compatibility`, string-valued `metadata`, `scripts/`, `references/`, and `assets/`.

The skill name must be 1–64 lowercase letters, digits, and single hyphen separators, must match its directory, and may not start or end with a hyphen. `allowed-tools` is experimental and support varies, so the portable bundle does not use it as a cross-host permission guarantee.

A portable bundle carries no subagent schema, marketplace manifest, permission model, install scope, update mechanism, or model fallback behavior. Another harness can consume the skill when it implements the specification, but role agents require a dedicated, validated adapter.

## Permission and model guarantees

Every canonical role defaults to parent/session model inheritance. A plugin may choose `permissionPolicy: explicit` to render capability-derived host settings or `permissionPolicy: inherit` to omit plugin-added permission, tool, and sandbox restrictions. In either case, parent-session choices, direct user invocation, managed policy, organization settings, host precedence, and host bugs can alter effective behavior. Review [the marketplace security model](security.md) before installing third-party bundles.

Provider model IDs and thinking levels are deployment configuration, not canonical workflow semantics. Senior Engineering Workflow documents its optional model-only npm configurator in the plugin README; its canonical skill and role prompts remain model-neutral.
