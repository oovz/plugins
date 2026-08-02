# Senior engineering workflow state: <task ID>

> Source template only. Copy this file to `state.md` in a host-managed out-of-tree store or a project path that is explicitly approved and already inside authorized file scope. Copy `REMEDIATION.template.yaml` beside it as `remediation.yaml`. Persistence does not authorize new project files. Never write live data into installed templates.

Schema version: 1.0.0
Last updated: <UTC timestamp>
Run ID: <stable run ID>
Status: active | blocked | complete

## Outcome and route

- Accepted outcome:
- Selected route:
- Fast-path decision and evidence:
- Current milestone:
- Next exact action:

## Acceptance, scope, and support

- Acceptance criteria:
- Included scope:
- Non-goals:
- Current support/compatibility target:
- Authorized external effects: none / exact effect and approval:

## Contracts and decisions

- Interfaces:
- Invariants:
- Failure model:

| Decision | Owner | Status | Rationale and evidence |
|---|---|---|---|
| ... | user / manager / architect / role-local | accepted / open / superseded | ... |

## Evidence index

| Claim | Confirmed / inferred / unknown | Repository path, command/result, artifact, or direct URL | Version/date |
|---|---|---|---|
| ... | ... | ... | ... |

## Role handoffs

| Packet/task ID | Role | Resolution: named/generic/inline | Objective | Output/status | Next recipient |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | main-user-bridge |

## Milestones and file ownership

- [x] Completed:
- [ ] Current:
- [ ] Next:

| File/component | Owner | Read/write | Purpose | Conflicting writer |
|---|---|---|---|---|
| ... | Engineer / Tester | ... | ... | none / ... |

## Engineer validation

| Command/check | Observed result | Pass/fail/not run | Requirement |
|---|---|---|---|
| ... | ... | ... | ... |

## Tester verification

| Requirement/risk | Engineer coverage | Tester coverage | Unit | Integration | End-to-end | Observed status |
|---|---|---|---|---|---|---|
| ... | ... | ... | required/N/A | required/N/A | required/N/A | ... |

## Remediation reference

- Ledger: sibling `remediation.yaml`
- Open or still-open critical/warning finding IDs:
- Latest attempt/closure ID:
- Remediation status: not entered / active / blocked / closed

Findings, defect attempts, closures, and accepted-risk decisions live only in `remediation.yaml`.

## Prohibited-pattern audit

- Speculative defensive behavior:
- Thin wrappers or unjustified abstractions:
- Unnecessary callbacks or hooks:
- Retries or fallbacks outside the failure model:
- Compatibility or legacy behavior:

## Open questions, blockers, limitations, and deferred cases

- ...
