# Delegation, writers, and durable state

The user-facing bridge delegates to seven logical leaf roles. A role never spawns another role, even if a host supports nesting. All sequencing and fallback return through the bridge.

## Role resolution

For each required role:

1. invoke the installed role whose semantic identity matches `manager`, `researcher`, `architect`, `planner`, `engineer`, `tester`, or `reviewer`; rendered host IDs may be globally namespaced;
2. if unavailable, create a generic subagent and inject both the full applicable role contract and full delegation packet;
3. if subagents are disabled, unavailable, or repeatedly fail to start, perform one inline role pass with the same limits and mark `degraded_mode`.

Never rely on a role name alone. Never grant a generic or inline fallback more authority than the canonical role. Select a tier/model only from an explicit user/project mapping on a host that supports per-invocation choice; otherwise inherit. Retry an unavailable mapped preference once with inherited/default settings; do not guess provider IDs, change settings, rotate through models, or substitute roles.

## Mandatory delegation packet

Every handoff has all fields below. Empty lists are explicit; omission is not. Later packets carry forward settled decisions and unresolved blockers without relying on conversation memory.

```yaml
packet_version: "1.0.0"
run_id: <workflow run>
task_id: <stable task or milestone>
route: <selected route>
role: manager | researcher | architect | planner | engineer | tester | reviewer
objective: <one bounded outcome>
why_now: <decision or gate this pass unlocks>
user_intent: <faithful concise statement>
outcome:
  status: accepted | provisional | unknown
  value: <observable outcome or empty only for Manager>
accepted_scope: []
non_goals: []
requirements: []
acceptance_criteria: []
support:
  status: accepted | provisional | unknown
  target: <compatibility target or empty only for Manager>
contracts:
  interfaces: []
  invariants: []
  failure_model: []
accepted_decisions: []
evidence:
  - claim: <fact or inference>
    source: <path, command/result, artifact, or URL>
    status: confirmed | inferred | unknown
open_questions: []
permissions:
  allowed_actions: []
  prohibited_actions: []
  external_side_effects: none | <exact user-authorized effect>
file_ownership:
  owned_paths: []
  read_only_paths: []
  forbidden_paths: []
  conflicting_writers: []
validation_plan: []
attempt_history:
  - attempt_id: <stable ID>
    finding_ids: []
    failure_classification: production_defect | test_defect | environment_issue | contract_or_architecture_ambiguity
    decisive_reproduction: <command/check and observed result>
    causal_chain: <evidence-backed explanation>
    rejected_hypotheses_with_evidence: []
    applied_fix: <change or pending>
    engineer_validation: <observed result or pending/not-applicable>
    tester_rerun: <observed result or pending>
    progress_delta: <what materially narrowed, changed, passed, or made no progress>
output_contract:
  required_sections: []
  evidence_standard: <what supports each conclusion>
  completion_signal: <ready, blocked, finding status, or candidate-ready>
state_references:
  run_state: <path or none>
  remediation_ledger: <separate remediation.yaml path or logical-packet-ledger>
return_to: main-user-bridge
```

Manager may receive `provisional` or `unknown` outcome/support status and may leave the corresponding value empty. Researcher may receive such a field only when its bounded objective explicitly resolves that exact field and its output contract requires evidence plus an explicit resolved or unresolved result. Researcher does not decide product behavior or support; only the bridge applying already accepted evidence or the user may mark the packet field `accepted`. Architect, Planner, Engineer, Tester, and Reviewer require both statuses to be `accepted` and both values to be nonempty. Manager or Researcher returns decisive evidence or the exact unresolved owner before the bridge constructs a decision/execution packet.

For a generic role, append the complete applicable reference text or equivalent canonical role instructions. “Act as Engineer” is not enough. Require conclusions and precise evidence references, not raw output dumps or private chain-of-thought.

## Context strategy

Choose direct work for a known, local entry point. Delegate when high-volume search, logs, documentation, tests, or diffs can be reduced to decision-relevant conclusions. Use durable state for multiple milestones or likely context transitions.

Keep research questions bounded and writer scopes non-overlapping. The bridge should not duplicate a delegated high-volume pass while it is running. Spot-check only disputed, surprising, security-critical, or decision-critical claims.

## Writer discipline

Default to one active writer per working tree and one owner per file. Engineer and Tester may write sequentially. Parallel writing requires:

- isolated worktrees or equivalent sandboxes;
- settled interfaces;
- explicit non-overlapping file ownership; and
- an integration and revalidation owner.

Manager, Researcher, Architect, Planner, and Reviewer do not modify candidate files. Tester writes only assigned test, fixture, test-configuration, or test-documentation files unless a separate authorized Engineer pass owns production changes.

## Durable state

Persistence never expands the user's authorized file scope. It is mandatory for long-horizon work or likely context/session transition. After two or more handoffs or during a defect-remediation loop it is optional: persist only when a safe authorized store already exists, and otherwise continue with complete packets and a logical structured remediation ledger without reporting a blocker.

Choose the state root in this order:

1. a host-managed durable store outside the target repository and worktree;
2. a project path explicitly approved by the user or applicable project instructions and already inside the task's authorized file scope.

Do not automatically create `.agents/`, modify ignore rules, or write a state file in the repository. Never use the installed skill, plugin cache, generated adapter, user-level installation, or another unapproved location. If mandatory persistence has no safe authorized store, stop only at the persistence boundary and return the exact path or authority needed.

The installed assets are immutable source templates. At the selected root, copy:

```text
assets/TASK_STATE.template.md       -> state.md
assets/REMEDIATION.template.yaml   -> remediation.yaml
```

When persistence is active, `state.md` references the sibling `remediation.yaml`. Store outcome, criteria, scope, evidence, decisions, contracts, route, handoffs, ownership, milestones, observed validation, blocker summaries, and next action in `state.md`. Persist findings, attempts, closures, and accepted-risk decisions only in `remediation.yaml`.

Whether or not files are active, maintain the remediation structure from `assets/REMEDIATION.template.yaml` in the bridge and every relevant handoff packet. Update it after each finding, evidence-backed attempt, and closure; mirror it to `remediation.yaml` when authorized persistence is active. Do not store secrets, raw logs, copied source blocks, or private chain-of-thought. On resume from persisted state, read both files, inspect repository status and the relevant diff, rerun the smallest decisive validation, and continue from the recorded next action.
