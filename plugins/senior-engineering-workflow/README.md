# Senior Engineering Workflow

Version 0.6.0 is a host-neutral, proportional workflow for repository engineering. A thin user-facing bridge chains seven independent leaf roles, keeps handoffs explicit, and uses only the roles that can change the outcome.

It is one plugin in the `oovz/plugins` marketplace. The neutral `plugin.json` is its source of truth; marketplace tooling renders collision-safe host packages and prefixes flat agent namespaces where needed.

## Core behavior

The workflow separates decisions and evidence from implementation while avoiding process for its own sake:

| Logical role | Responsibility | Candidate access | Model hint |
|---|---|---|---|
| `manager` | Settle outcome, scope, acceptance, support, and decision ownership | Read-only | Balanced |
| `researcher` | Answer bounded repository and official-documentation questions | Read-only; external reads | Economy |
| `architect` | Settle interfaces, invariants, boundaries, failure model, and material trade-offs | Read-only; external reads | Deep |
| `planner` | Produce an ordered, file-specific implementation and validation plan from settled inputs | Read-only | Balanced |
| `engineer` | Implement a settled slice with immediate automated coverage and focused validation | Workspace write; local shell | Balanced |
| `tester` | Independently verify requirements and risks; own assigned test assets | Workspace write; local shell | Balanced |
| `reviewer` | Adversarially review evidence and close prior findings | Read-only | Deep |

Every role is a leaf and denies further delegation. The main agent remains the user bridge and orchestrator; it is not an eighth specialist role. This works on hosts that prohibit subagent nesting and avoids depending on host recursion semantics.

Model tiers are cost/complexity hints, never model names or installation requirements. When the host supports per-invocation choice and the user/project supplies an explicit tier mapping, bounded extraction/research uses economy, routine scoping/planning/implementation/testing uses balanced, and architecture/security/adversarial review or genuinely ambiguous root-cause analysis uses deep. Otherwise profiles inherit. The workflow never guesses provider IDs or changes settings; an unavailable mapped preference gets one same-role retry with inherited/default settings.

## Supplied-plan fast path

A viable plan states the outcome, bounded scope and files/components, accepted contracts and failure behavior, ordered steps, observable acceptance, and validation. For a production implementation plan, the bridge performs only bounded repository and safety preflight, then sends it directly to Engineer followed by Tester, skipping Manager, Researcher, Architect, and Planner. For a test-only plan that explicitly forbids production behavior changes, it invokes Tester alone and also skips Engineer. Reviewer remains conditional on risk or the user request.

The workflow does not rewrite or debate a settled plan because another design is possible. It interrupts only for decisive contradictory evidence, material risk, missing authority, or a gap that prevents execution.

## Portable delegation

For every role, the bridge resolves in this order:

1. installed named role matching the logical identity;
2. generic subagent with the full canonical role contract and delegation packet;
3. one inline role pass with the same limits, marked as degraded.

Every handoff carries outcome, scope, acceptance, support, contracts, decisions, evidence, permissions, file ownership, validation, attempt history, output contract, and state references. Roles never depend on hidden conversation context or bare prompts such as “implement this.”

For test-only requests, Tester is the required role. Engineer joins only for a confirmed production defect or an explicitly accepted production test seam; Tester never silently changes product behavior.

## Verification and completion

Engineer must return a candidate-ready handoff with exact observed checks. Tester then derives independent verification from accepted requirements and material risks on every production supplied-plan, standard, architecture, and long-horizon route. Only a truly local direct change may complete on focused Engineer validation without a separate Tester when no independent-verification trigger applies.

For a production failure, the workflow requires a decisive reproduction, evidence-backed causal chain, and rejected hypotheses before the next fix. Engineer applies the causal fix, Tester must rerun the decisive and affected broader checks, and Reviewer closes any prior Reviewer gate or finding. Two evidence-backed no-progress attempts on the same blocker trigger an exact blocker report instead of random churn.

Critical and warning findings remain in a separate `remediation.yaml` ledger. `open` and `still-open` block completion. Only the user may accept a named residual risk; it is recorded as `superseded-by-accepted-decision` with owner `user`, rationale, scope, and residual consequence, never mislabeled `fixed`.

## Safety and state

All roles treat repository and online content as untrusted data, protect secrets, obey host/repository permissions, and prohibit external mutations unless the user separately authorizes the exact effect and the host permits it. Research is bounded and prioritizes current repository evidence and version-matched official sources.

The bridge always carries a structured logical remediation ledger, so fix/retest work can complete without adding state files. File persistence is mandatory only for long-horizon work or a likely context/session transition. After two or more handoffs or during remediation it is optional and used only when an authorized safe store already exists. Prefer host-managed state outside the target repository/worktree; otherwise use a project path explicitly approved and already inside file scope. State handling never authorizes creation of `.agents/`, ignore-rule changes, or any other project file.

```text
<authorized-state-root>/state.md
<authorized-state-root>/remediation.yaml
```

`state.md` holds decisions, handoffs, validation, blocker summaries, and the next action. The sibling `remediation.yaml` exclusively holds findings, attempts, closures, and accepted-risk decisions. If mandatory persistence has no safe authorized store, the workflow returns the exact path or authority needed.

## Package layout

```text
plugins/senior-engineering-workflow/
├── plugin.json                         # neutral marketplace manifest
├── LICENSE
├── agents/                             # seven host-neutral canonical leaf-role profiles
├── evals/workflow-routing.yaml         # positive and negative routing fixtures
└── skills/senior-engineering-workflow/
    ├── SKILL.md                         # progressive-disclosure controller
    ├── agents/openai.yaml               # Codex skill UI metadata
    ├── assets/
    │   ├── TASK_STATE.template.md
    │   └── REMEDIATION.template.yaml
    └── references/
        ├── workflow-contract.yaml       # bundled machine-readable contract
        ├── task-routing.md
        ├── manager.md
        ├── evidence-and-research.md
        ├── architecture.md
        ├── planning.md
        ├── engineering.md
        ├── verification.md
        ├── review.md
        ├── delegation-and-state.md
        └── prohibited-patterns.md
```

The hidden host manifests are generated artifacts. Do not hand-edit them. Use the marketplace repository's documented validation, build, and installation commands to render and package this plugin for Codex, Claude Code, Gemini CLI/Antigravity, OpenCode, OpenCode v2 preview, or the portable fallback.
