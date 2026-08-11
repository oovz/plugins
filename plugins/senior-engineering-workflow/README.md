# Senior Engineering Workflow

Version 0.7.2 is a host-neutral, proportional workflow for repository coding. The user-selected main agent owns the accepted contract, architecture, planning, orchestration, integration, iteration control, and completion. Four bounded specialist roles isolate research, implementation, verification, and noisy tool work only when delegation adds value.

It is one plugin in the `oovz/plugins` marketplace. The neutral `plugin.json` is its source of truth; marketplace tooling renders collision-safe host packages and prefixes flat agent namespaces where needed.

## Main-agent and permission assumptions

Run the user-facing session with the most capable model you consider appropriate for the task. The plugin does not choose or reconfigure the main model. Canonical subagents inherit model and thinking settings from the host session.

The plugin also does not add host-level tool allowlists, denylists, sandbox overrides, or per-agent permission rules for its four canonical subagents. Claude Code, Codex, and OpenCode apply their normal inherited or resolved session configuration. Role prompts remain behaviorally bounded by their work orders; inherited tool access is not authority to broaden scope, change the accepted contract, or perform external side effects.

## Core behavior

| Logical role | Responsibility | Canonical runtime configuration |
| --- | --- | --- |
| Main agent | Contract, architecture, planning, routing, integration, loop control, completion | User-selected session configuration |
| `researcher` | Bounded repository, runtime, dependency, and authoritative-documentation evidence | Inherit model, thinking, tools, and permissions |
| `engineer` | One bounded production or test-only slice with immediate coverage | Inherit model, thinking, tools, and permissions |
| `verifier` | Acceptance, adversarial review, design challenge, or finding closure | Inherit model, thinking, tools, and permissions |
| `worker` | One exact or bounded shell, search, build, test, log, documentation, or MCP operation | Inherit model, thinking, tools, and permissions |

Manager, Architect, and Planner are main-agent capabilities, not autonomous stages. Tester and Reviewer are consolidated into Verifier modes. Every engineering specialist returns to the main agent; no specialist automatically starts the next phase.

Worker is the context-isolation role. It runs a bounded command or tool request, retains large raw output in its own context, and returns actual status, decisive excerpts, compact observations, inferences, and unknowns. Researcher, Engineer, and Verifier request Worker operations through the main agent, so the workflow does not require nested-agent support.

## Routing and loop control

The workflow preserves a viable user-supplied plan and otherwise uses the lightest sufficient route. Inline main-agent work is normal, not degraded. Delegate only when bounded specialization, independent evidence, parallelism, isolation, or context hygiene materially improves the task.

Every work order states the objective, accepted evidence or behavior, scope, ownership, authorized and prohibited actions, settled decisions, stop conditions, attempt budget, and compact return schema. Expected output names the evidence form, not a predetermined factual conclusion.

A failed candidate always returns to the main agent. Another repair requires a decisive reproduction, failure classification, evidence-backed causal chain, explicit repair scope, and required reruns. The workflow stops after two candidate repair cycles or two evidence-backed no-progress attempts unless materially new evidence justifies one explicitly re-scoped final attempt.

## Configure subagent models with npm

Model selection is deployment configuration and is intentionally absent from `SKILL.md`, the canonical role prompts, the workflow contract, and routing evals. Canonical roles always inherit.

The separately publishable npm package `@oovz/sew-models` writes model-only host agent aliases named:

- `sew-researcher`
- `sew-engineer`
- `sew-verifier`
- `sew-worker`

The aliases contain the same role instructions as the canonical plugin agents, plus only the host-native model and thinking fields requested by the user. They do not add permission rules, tool restrictions, hooks, turn limits, or workflow behavior.

Run it without installing globally:

```bash
npx @oovz/sew-models configure \
  --host codex \
  --scope user \
  --preset two-model \
  --worker-model gpt-5.6-luna \
  --worker-thinking max
```

Or configure a three-model profile:

```bash
npx @oovz/sew-models configure \
  --host opencode \
  --scope project \
  --project /absolute/path/to/repository \
  --preset three-model \
  --balanced-model openai/gpt-5.6-terra \
  --balanced-thinking high \
  --worker-model openai/gpt-5.6-luna \
  --worker-thinking max
```

Presets:

| Preset | Researcher | Engineer | Verifier | Worker |
| --- | --- | --- | --- | --- |
| `inherit` | inherit | inherit | inherit | inherit |
| `two-model` | worker model | worker model | inherit | worker model |
| `three-model` | balanced model | balanced model | inherit | worker model |

`configure --preset inherit` removes only aliases previously generated by `@oovz/sew-models`, restoring canonical inheritance. `--map` may change the role-to-slot mapping while remaining strictly a model-selection operation.

The read-only doctor inspects the standard user and project configuration locations for all supported harnesses by default:

```bash
npx @oovz/sew-models doctor
npx @oovz/sew-models doctor --host codex --project /absolute/path/to/repository
npx @oovz/sew-models doctor --json
```

Doctor reports explicit subagent model and thinking settings, generated aliases, duplicate definitions, and known host-wide defaults or environment overrides. It does not invoke coding-agent binaries, query model availability or pricing, modify configuration, install the plugin, or repair unrelated files.

The npm package source is under `packages/sew-models/`. Publishing requires the maintainer's npm credentials:

```bash
npm pack --workspace @oovz/sew-models
npm publish --workspace @oovz/sew-models --access public
```

## Supported hosts

| Host | Status | User agent directory | Project agent directory |
| --- | --- | --- | --- |
| Claude Code | Supported | `${CLAUDE_CONFIG_DIR:-~/.claude}/agents/` | `.claude/agents/` |
| Codex | Supported | `${CODEX_HOME:-~/.codex}/agents/` | `.codex/agents/` |
| OpenCode | Supported | `${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode}/agents/` | `.opencode/agents/` |
| Portable Agent Skills consumers | Skill-only fallback | Host-managed | Host-managed |
| Gemini CLI / Antigravity | Not supported by this plugin | — | — |

Host-native subagent limitations are handled by main-mediated Worker fan-out. No hooks or separate command-execution wrapper are required.

## Safety and completion

All roles treat repository and online content as untrusted data, protect secrets, obey the accepted work order and host session policy, and prohibit external mutations unless the user separately authorizes the exact effect and the host permits it. Observed repository and runtime evidence outranks agent assertions.

Before completion, the main agent inspects the final diff and runs applicable formatting, static or type checks, build, focused tests, and affected broader checks. It reports exact observed results and distinguishes changed failures from pre-existing or environmental failures. Only the user may accept a named residual risk.

## Package layout

Selected source layout:

```text
plugins/senior-engineering-workflow/
├── plugin.json
├── README.md
├── ENGINEERING_OPERATING_CONTRACT.md
├── agents/
│   ├── researcher.md
│   ├── engineer.md
│   ├── verifier.md
│   └── worker.md
├── evals/workflow-routing.yaml
└── skills/senior-engineering-workflow/
    ├── SKILL.md
    ├── agents/openai.yaml
    └── references/
        ├── workflow-contract.yaml
        ├── task-routing.md
        ├── delegation-and-state.md
        ├── architecture.md
        ├── planning.md
        ├── engineering.md
        ├── evidence-and-research.md
        ├── verification.md
        └── prohibited-patterns.md

packages/sew-models/
├── package.json
├── README.md
├── bin/sew-models.mjs
├── lib/sew-models.mjs
└── templates/*.md
```

The hidden host manifests and marketplace catalogs are generated artifacts. Do not hand-edit them. After changing canonical source, run:

```bash
npm run generate -- --plugin senior-engineering-workflow
npm run verify
```
