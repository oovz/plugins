# Senior Engineering Workflow

A proportional, evidence-driven workflow for repository engineering tasks. The main agent acts as Engineering Manager and activates specialist roles only when they can change the decision, implementation, or validation outcome.

## Workflow model

The router classifies work by deliverable, uncertainty, architectural impact, and risk:

| Route | Typical use | Default control |
|---|---|---|
| Inquiry | Explanation, investigation, or recommendation without edits | Manager inline; Researcher only for broad or version-sensitive evidence |
| Review | Code or architecture findings without fixes | Reviewer primary; Architect only for architecture boundaries |
| Direct change | Clear, local, low-risk edit with obvious validation | Manager-lite, Engineer, main-agent review |
| Standard delivery | Feature, bug, refactor, or test work with multiple coherent checks | Manager, Engineer, conditional Tester or Reviewer |
| Architecture delivery | Public contract, security, persistence, concurrency, migration, deployment, or cross-cutting design change | Manager, Architect, Engineer, Tester, Reviewer |
| Long-horizon delivery | Greenfield or multi-milestone work likely to cross context transitions | All roles plus durable task state |

Roles are capabilities, not mandatory meetings. Multiple changed files alone do not trigger architecture work.

## Team and ownership

The Engineering Manager is always the main agent, not a sixth subagent. It retains the user conversation and owns task routing, requirement synthesis, escalation, integration, and final reporting.

| Specialist | Responsibility | Candidate ownership |
|---|---|---|
| `workflow-researcher` | Codebase mapping, reproduction, execution-path tracing, exact-version documentation, and evidence isolation | Does not modify candidate files; retains shell/search/web evidence tools |
| `workflow-architect` | Interfaces, invariants, failure model, security and operational boundaries, test seams, and assigned architecture artifacts | May write only explicitly assigned plans, designs, or architecture documents |
| `workflow-engineer` | Production code and first-line regression, unit, and affected integration tests | Write |
| `workflow-tester` | Independent requirement verification, missing risk coverage, integration/end-to-end checks, and broader validation | Write to assigned test assets |
| `workflow-reviewer` | Adversarial correctness, security, scope, support-target, and prohibited-pattern review | Does not modify candidate files; retains shell/search/web validation tools |

Engineer and Tester are intentionally separate without splitting the immediate feedback loop. Engineer must reach a focused-green candidate and add ordinary correctness coverage before Tester begins independent verification. Tester derives additional checks from accepted requirements and material risks rather than from the implementation structure.

Tester also supports a pre-implementation `verification-design` mode. It preserves implementation-candidate files in that mode but may own an explicitly assigned verification plan or test-design document.

## Nested delegation

The Manager remains the user-facing control plane, but specialists may delegate bounded role-local work when the host supports nested agents. A child cannot gain product, architecture, compatibility, risk, or file-ownership authority that its parent does not have. Nested writers still require isolated worktrees or explicit non-overlapping ownership, and the parent remains accountable for integration.

Nested delegation is optional rather than portable workflow precondition:

- Codex supports nested agents subject to the user's configured agent depth and runtime controls.
- OpenCode profiles use role-specific nested allowlists so a child cannot exceed its parent's implementation or decision authority.
- Claude Code and Gemini CLI currently block subagent-to-subagent spawning, so the main Manager chains any additional specialist.

## Decision and implementation controls

The workflow escalates facts to focused investigation and decisions to the correct owner:

- Architect owns architecture details inside the accepted brief.
- Manager owns routing, synthesis, and engineering decisions that do not change accepted product scope or risk.
- The user owns product behavior, scope, compatibility targets, cost, destructive actions, and accepted security or operational risk.

New or materially changed code must not add speculative defensive behavior, thin forwarding wrappers or unjustified abstractions, unnecessary callbacks or hooks, or compatibility and legacy support without an accepted requirement. Boundary validation, authorization, invariants, cleanup, rollback, and explicit error propagation remain required where the design calls for them.

## Host policy mapping

| Host | Model and effort | Plugin execution limit | Tool and delegation policy |
|---|---|---|---|
| Claude Code | `model: inherit`; effort omitted to inherit the session | No `maxTurns` | Researcher and Reviewer deny only candidate-writing tools. Other tools, including `Agent`, inherit; Claude blocks recursion when the profile is running as a subagent but permits it when an agent profile is launched as the main session |
| Codex | Model and reasoning effort omitted so spawn settings, user defaults, or parent settings apply | None | Researcher and Reviewer use a read-only sandbox; Architect, Engineer, and Tester use workspace-write. Nested delegation remains available subject to Codex depth and runtime controls |
| Gemini CLI | `model: inherit`; no generic effort field | No plugin `max_turns` | Researcher and Reviewer have candidate-preserving evidence tools, including shell; other roles inherit parent tools. Gemini blocks recursive subagents |
| OpenCode | Model and provider-specific reasoning effort omitted | No `steps` | Researcher and Reviewer deny edits; other permissions inherit. Nested tasks use role-specific workflow allowlists |

The plugin imposes no turn or step limit. Host defaults, timeouts, action limits, context limits, and user configuration still apply. In particular, Gemini currently defaults an omitted `max_turns` to 30 and a timeout to 10 minutes. Long-horizon Gemini users can raise those values through `agents.overrides.<agent>.runConfig` in their own settings. No adapter pins a model tier or maximum reasoning effort.

## Components

```text
plugins/senior-engineering-workflow/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── agents/
│   ├── workflow-researcher.md
│   ├── workflow-architect.md
│   ├── workflow-engineer.md
│   ├── workflow-tester.md
│   └── workflow-reviewer.md
└── skills/
    └── senior-engineering-workflow/
        ├── SKILL.md
        ├── agents/openai.yaml
        ├── assets/TASK_STATE.template.md
        └── references/
            ├── task-routing.md
            ├── manager.md
            ├── architecture.md
            ├── engineering.md
            ├── verification.md
            ├── review.md
            ├── delegation-and-state.md
            └── prohibited-patterns.md
```

Host-specific definitions live in `adapters/{codex,gemini,opencode}/agents/`, with the same five role IDs and host-native permission metadata.

## Upgrade note

Version 0.3.1 replaces the former execution role with Engineer and Tester and adds Architect. Existing installations should remove the obsolete executor agent file before reinstalling adapters. No compatibility alias is shipped because the old role name is not an accepted support target. The repository-wide host catalog is now `otto-plugins`; use `senior-engineering-workflow@otto-plugins` for host catalog installs.

See the [repository README](../../README.md) for installation, generation, and validation commands.
