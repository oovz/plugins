# Senior Engineering Workflow

Version 0.9.3 is a proportional engineering workflow for coding repositories. The user-selected main agent owns the accepted contract, architecture, planning, orchestration, integration, iteration control, and completion. Four bounded specialist capabilities isolate research, implementation, verification, and noisy tool work only when delegation adds value.

## Core architecture

| Capability | Responsibility | Canonical runtime configuration |
|---|---|---|
| Main agent | Contract, architecture, planning, routing, integration, loop control, completion | User-selected session configuration |
| Researcher | Bounded repository, runtime, dependency, and authoritative-documentation evidence | Inherit |
| Engineer | One bounded production or test-only slice with immediate focused coverage | Inherit |
| Verifier | Acceptance, adversarial review, design challenge, or finding closure | Inherit |
| Worker | One exact or bounded shell, search, build, test, log, documentation, or MCP operation | Inherit |

Manager, Architect, and Planner are main-agent capabilities, not separate stages. Tester and Reviewer are consolidated into Verifier modes. Every specialist result returns to the main agent; no role automatically starts another phase.

Canonical subagents add no thinking, tool, permission, sandbox, hook, or turn-limit overrides. Their model is inherited where the host supports the field, and omitted elsewhere so the host falls back to its normal resolution. The host and user session stay authoritative; role prompts still bound scope and decision authority.

## Supported coding harnesses

| Host | Subagent implementation |
|---|---|
| Claude Code | Four plugin-scoped custom subagents |
| Codex | Four companion TOML agent roles |
| OpenCode | Four Markdown subagents |
| Gemini CLI | Four extension custom subagents; omitted `tools` inherits the parent tool set |
| Antigravity | The plugin ships the skill; the main agent uses Antigravity's inherited `self`/generic or dynamically defined subagents for bounded roles |
| Oh My Pi (`omp`) | Four plugin task agents |

Senior Engineering Workflow is not emitted as a portable skill-only bundle; its acceptance contract depends on subagent-capable harnesses. Antigravity is the exception: static custom agents default to an empty tool list, so named model/permission-neutral roles would silently drop the parent tool set. The workflow uses Antigravity's inherited generic or dynamic subagents there.

## Install

No repository clone is required. Per-harness steps are in the [root README](../README.md#install); here is the short version:

```text
npx @oovz/sew install --host codex --scope user
npx @oovz/sew install --host opencode --scope project --project /absolute/path/to/project
npx @oovz/sew doctor
```

For Codex, `sew install` checks the plugin inventory. It preserves an existing enabled marketplace skill and installs only the four companion agents; if the plugin is missing or disabled, it installs the plugin before the agents. `--force` reinstalls both layers, while `sew uninstall --host codex` removes only CLI-managed companion agents.

Claude Code and Oh My Pi install through their native marketplaces. The published CLI ships version-matched payloads for Codex companion agents and the static portions of OpenCode, Gemini CLI, and Antigravity.

Native Claude Code installation:

```text
/plugin marketplace add oovz/plugins
/plugin install senior-engineering-workflow@otto-plugins
/reload-plugins
```

Native Oh My Pi installation:

```text
/marketplace add oovz/plugins
/marketplace install senior-engineering-workflow@otto-plugins
/reload-plugins
```

## Optional model routing

The default is full inheritance. `@oovz/sew` can create model-only aliases without changing workflow prompts or permissions.

| Preset | Researcher | Engineer | Verifier | Worker |
|---|---|---|---|---|
| `inherit` | inherit | inherit | inherit | inherit |
| `two-model` | worker | worker | inherit | worker |
| `three-model` | balanced | balanced | inherit | worker |

Example:

```text
npx @oovz/sew models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

Restore canonical inheritance:

```text
npx @oovz/sew models configure --host codex --scope user --preset inherit
```

Model aliases work on Claude Code, Codex, OpenCode, Gemini CLI, and Oh My Pi. Gemini CLI has no per-custom-agent thinking field. Antigravity gets no aliases: preserving the inherited tool set matters more than pinning a role model.

## Workflow guarantees

- The main agent owns every cross-role transition and every repeated attempt.
- Delegation uses bounded work orders with scope, evidence requirements, permissions, stop conditions, and attempt budgets.
- Expected output describes the evidence form, not a predetermined conclusion.
- Observations, inferences, and unknowns are returned separately.
- Worker is preferred for large command, test, search, log, documentation, or MCP output.
- Independent verification is proportional; it is not a mandatory stage after every edit.
- A failed candidate may enter at most two bounded repair cycles without materially new evidence and explicit re-scoping.
- Completion claims require observed validation.

## Source layout

```text
plugins/senior-engineering-workflow/
├── ENGINEERING_OPERATING_CONTRACT.md
├── README.md
├── plugin.json
├── agents/
│   ├── researcher.md
│   ├── engineer.md
│   ├── verifier.md
│   └── worker.md
├── evals/workflow-routing.yaml
└── skills/senior-engineering-workflow/
    ├── SKILL.md
    └── references/
```

The manifest and role prompts here are canonical. Adapters under `adapters/` are generated and checked in; edit the source and regenerate, never the adapters.
