# Host compatibility

The marketplace validates six agentic coding harnesses. Tauri v2 Desktop additionally exports a portable Agent Skills bundle; Senior Engineering Workflow does not because it requires subagent-capable execution.

| Host | Native package | Subagent support | Main installation path |
|---|---|---|---|
| Claude Code | Marketplace plugin | Plugin/custom Markdown subagents | Claude plugin marketplace |
| Codex | Skill plugin plus companion TOML agents | Custom agent roles | Codex marketplace plus CI-bundled companion payload |
| OpenCode | Static configuration bundle | Markdown `mode: subagent` profiles | `@oovz/sew` CI-bundled static install |
| Gemini CLI | Extension/static agent bundle | Extension and user/project custom subagents | `@oovz/sew` CI-bundled static install |
| Antigravity | Native plugin | Built-in generic/dynamic and custom subagents | `@oovz/sew` CI-bundled plugin install |
| Oh My Pi (`omp`) | Native marketplace plugin | Task agents from plugins/user/project roots | OMP marketplace |

## Claude Code

Generated plugin layout:

```text
adapters/claude-code/<plugin-id>/
├── .claude-plugin/plugin.json
├── skills/
└── agents/
```

Senior Engineering Workflow agents set `model: inherit` and omit tools, permission mode, hooks, MCP servers, effort, and turn limits. Claude Code therefore resolves the normal parent/session capabilities and model. Install with:

```text
/plugin marketplace add oovz/plugins
/plugin install senior-engineering-workflow@otto-plugins
/reload-plugins
```

Official references: [plugins](https://code.claude.com/docs/en/plugins), [subagents](https://code.claude.com/docs/en/sub-agents).

## Codex

Generated layout:

```text
adapters/codex/<plugin-id>/
├── .codex-plugin/plugin.json
├── skills/
└── companion/agents/*.toml
```

Companion roles omit `model`, `model_reasoning_effort`, sandbox, approval, and MCP overrides. Codex applies its spawn defaults and parent settings. The published `@oovz/sew` tarball contains companion profiles and skills built from canonical source in release CI; the source workspace does not commit those payloads.

Official references: [plugins](https://developers.openai.com/codex/plugins), [subagents](https://developers.openai.com/codex/subagents).

## OpenCode

Generated layout:

```text
adapters/opencode/stable/<plugin-id>/.opencode/
├── skills/
└── agents/
```

Agent files use `mode: subagent` and omit model, variant, tools, and permission mappings. OpenCode therefore uses its normal global/project resolution, and an omitted subagent model inherits the invoking primary agent's model.

Official references: [agents](https://opencode.ai/docs/agents), [skills](https://opencode.ai/docs/skills), [permissions](https://opencode.ai/docs/permissions).

## Gemini CLI

Generated extension layout:

```text
adapters/gemini-cli/<plugin-id>/
├── gemini-extension.json
├── skills/
└── agents/
```

Gemini CLI custom subagents are separate-context specialists that report to the main agent. Senior Engineering Workflow custom agents use `kind: local`, `model: inherit`, and omit `tools`; Gemini documents that omitted tools inherit the parent session's complete tool set, including discovered MCP tools. Gemini prevents custom subagents from recursively invoking other subagents, which matches the workflow's main-mediated topology.

The published `@oovz/sew` tarball installs a release-CI-built skill and agent bundle to the documented user or project configuration locations without requiring a repository clone.

Official references: [subagents](https://geminicli.com/docs/core/subagents/), [extensions](https://geminicli.com/docs/extensions/), [Agent Skills](https://geminicli.com/docs/cli/skills/).

## Antigravity

Antigravity 2.0 and Antigravity CLI share an agent harness but use their own plugin format rather than Gemini's `gemini-extension.json`.

Generated plugin layout:

```text
adapters/antigravity/<plugin-id>/
├── plugin.json
└── skills/
```

Antigravity custom-agent Markdown defaults `tools` to an empty list. Consequently, Senior Engineering Workflow does not generate static named role files for permission-inheriting roles. The skill directs the main agent to use Antigravity's built-in `self`/generic clone or dynamically defined subagents with bounded role work orders. Those subagents preserve the parent's tool configuration and security permissions.

Project installation uses:

```text
<project>/.agents/plugins/<plugin-id>/
```

User installation through the release-CI-bundled `@oovz/sew` package targets Antigravity CLI:

```text
~/.gemini/antigravity-cli/plugins/<plugin-id>/
```

Antigravity 2.0 also discovers global custom plugins under `~/.gemini/config/plugins/`; use project scope for one payload shared by both surfaces.

Model-only static role aliases are intentionally unsupported for Antigravity because they would require an explicit tools list and would no longer inherit arbitrary parent or MCP tools.

Official references: [plugins](https://antigravity.google/docs/plugins), [CLI plugins](https://antigravity.google/docs/cli/plugins), [subagents](https://antigravity.google/docs/subagents), [permissions](https://antigravity.google/docs/cli/permissions).

## Oh My Pi

Oh My Pi has a first-class marketplace compatible with the Claude marketplace catalog shape. This repository publishes a preferred OMP catalog at:

```text
.omp-plugin/marketplace.json
```

Generated plugin layout:

```text
adapters/oh-my-pi/<plugin-id>/
├── skills/
└── agents/
```

OMP task agents are discovered from plugin, project, and user roots. Senior Engineering Workflow agents omit model, thinking, tool, and spawn fields so OMP falls back to the invoking parent model and normal task-agent policy.

When another plugin requests an explicit OMP tool list, the generator uses OMP-native names and the validator rejects unknown entries. External lookup adds `web_search`; URL retrieval remains available through the ordinary `read` tool because OMP does not define a separate `web_fetch` tool.

Install natively:

```text
/marketplace add oovz/plugins
/marketplace install senior-engineering-workflow@otto-plugins
/reload-plugins
```

CLI equivalents:

```text
omp plugin marketplace add oovz/plugins
omp plugin install senior-engineering-workflow@otto-plugins
```

Official references: [marketplace](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md), [task-agent discovery](https://github.com/can1357/oh-my-pi/blob/main/docs/task-agent-discovery.md).

## Portable Agent Skills export

Portable Agent Skills is an additional skill-only output, not a coding harness target. A plugin may opt into it when its behavior does not depend on host-specific agents. Tauri v2 Desktop currently does; Senior Engineering Workflow does not.

```text
adapters/portable-agent-skills/<plugin-id>/.agents/skills/<skill-id>/SKILL.md
```

Portable bundles do not define subagent discovery, model routing, permissions, installation, or update semantics.

## Model and permission guarantees

Canonical Senior Engineering Workflow roles are model-neutral and permission-neutral. Host projections inherit or omit model and permission settings where the host supports that contract. Antigravity uses generic/dynamic inherited subagents instead of static permission-neutral role files.

Optional model aliases are deployment configuration managed by `@oovz/sew`; they contain role prompts plus model/thinking fields only. Effective behavior remains subject to host configuration, user approvals, sandboxing, organization policy, and host bugs.
