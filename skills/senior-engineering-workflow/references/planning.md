# Main-agent execution-planning checklist

Planning is a main-agent responsibility. Convert the accepted contract and settled architecture into the smallest executable work graph needed for implementation and validation. Do not create a separate Planner stage merely to restate clear work or to rewrite a viable user-supplied plan.

## Plan inputs

Confirm:

- observable outcome, acceptance criteria, scope, and non-goals;
- repository instructions and current status;
- settled interfaces, invariants, failure behavior, support, migration, and rollback decisions;
- relevant current code, tests, manifests, lockfiles, and repository-native commands;
- real dependencies between work items;
- one-writer ownership and any required isolated worktrees;
- validation that proves each accepted requirement.

## Work graph

Each delegated or durable work item should name:

```yaml
id: stable-work-item-id
kind: research | implementation | test-only | verification | worker-operation
objective: one bounded result
depends_on: []
owner: main | researcher | engineer | verifier | worker
scope:
  owned_paths: []
  forbidden_paths: []
accepted_contract:
  behavior: []
  interfaces: []
  invariants: []
acceptance_or_evidence: []
required_checks: []
stop_conditions: []
attempt_budget: 1
```

Order work by real dependency. Keep implementation and its immediate focused test loop together. Use Worker for noisy tool operations, not as an extra planning stage. Add independent Verifier work only when risk, uncertainty, or the user request justifies it.

## Exit condition

Stop planning when each immediate work item can proceed without making a new product, interface, invariant, failure-model, support-target, file-ownership, or accepted-risk decision. Do not keep rewriting a settled plan for stylistic improvement.

When new evidence invalidates part of the plan, preserve unaffected work and revise only the contradicted portion.
