# Delegation and state v2

## Specialist work order

Send only task-relevant context. Use this logical schema even when the host requires natural-language prompts:

```yaml
packet_version: "2.0"
task_id: stable-task-id
work_item_id: stable-bounded-id
invocation_id: unique-invocation-id
contract_revision: immutable-revision
candidate_revision: current-candidate-or-not-applicable
role: researcher | engineer | verifier
mode: role-specific-mode-or-not-applicable
objective: one bounded result
why_now: decision or dependency unlocked by this work

acceptance_or_evidence:
  - observable condition or required evidence form

scope:
  owned_paths: []
  forbidden_paths: []
  sources: []

authority:
  allowed_actions: []
  prohibited_actions: []
  external_side_effects: none

settled_contract:
  behavior: []
  interfaces: []
  invariants: []
  failure_model: []
  support: unchanged | value
  decisions: []

evidence_refs: []
unknowns: []
required_checks: []

budgets:
  remaining_attempts: 1
  remaining_worker_rounds: 2

stop_when:
  - completion condition
  - blocker or escalation condition

return:
  recipient: main
  required_fields:
    - status
    - observations
    - inferences
    - unknowns
    - changes_if_authorized
    - observed_checks
    - worker_requests
    - escalation
```

## Worker work order

A Worker receives a smaller operation-level packet:

```yaml
packet_version: "2.0-worker"
task_id: stable-task-id
work_item_id: parent-work-item
request_id: unique-request-id
purpose: why this evidence matters

operation:
  mode: exact | bounded
  kind: shell | repository_search | read | mcp | documentation | other
  cwd_or_scope: path-or-source
  command_or_question: exact operation
  allowed_tools: []
  maximum_operations: 1

authority:
  source_edits: none
  generated_outputs: explicitly-listed-or-none
  dependency_installation: false
  external_side_effects: none
  additional_commands: none

expected_deliverable:
  - exact status
  - decisive evidence form
  - compact excerpts
  - produced files or artifacts

stop_when:
  - operation completes
  - bound is reached
  - permission or environment block occurs
```

“Expected deliverable” must not prescribe a factual conclusion. Use “determine whether X violates Y” rather than “confirm X is the cause.”

## Result discipline

Every result separates:

- **observations** — directly seen paths, code, exit statuses, tool responses, source text, or artifacts;
- **inferences** — conclusions linked to observations and confidence;
- **unknowns** — unresolved facts and the smallest decisive next check;
- **authority** — changes or decisions the work order did and did not authorize.

A missing source is unknown, not false. An unrun command has no result. A success-looking line cannot override a failing exit status.

## Repeated invocations

Keep stable `task_id` and `work_item_id`; increment `invocation_id` and attempt. Delta follow-ups may omit unchanged contract fields but must include the contract revision, candidate revision, new evidence, remaining budget, exact allowed next action, and required rerun.

A repeat requires materially new evidence, a narrowed causal chain, a changed decisive reproduction, a newly rejected material hypothesis, a changed candidate, or an explicit accepted decision. Renaming the same hypothesis does not count as progress.

## State

The main agent maintains the logical work graph and finding ledger in context. File persistence is required only when the work is likely to cross a session or compaction boundary and an authorized safe store exists. Persistence does not grant permission to create repository state files, alter ignore rules, or broaden file scope.
