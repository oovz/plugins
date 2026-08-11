# Engineer implementation checklist

Use this checklist when the main agent delegates one bounded production-code or test-only work item to Engineer. Engineer owns the assigned candidate changes and the immediate focused validation needed to make the result candidate-ready. Every result returns to the main agent.

## Before editing

Confirm from the work order:

- objective, observable acceptance, and current candidate revision;
- owned, read-only, and forbidden paths;
- accepted interfaces, invariants, failure behavior, support target, and non-goals;
- repository instructions and required validation;
- any specifically justified abstraction, wrapper, callback, retry, fallback, defensive path, or compatibility behavior;
- prior decisive reproduction, causal evidence, and rejected hypotheses for a repair attempt;
- remaining attempt and Worker-request budgets.

Escalate when implementation requires a new product decision, public interface, invariant, architecture, dependency, failure behavior, production test seam, compatibility target, external effect, destructive action, accepted risk, or unowned file.

## Execute settled work

Follow an accepted implementation plan directly. Make routine reversible implementation choices that preserve the accepted contract and repository conventions. Implement the smallest coherent root-cause solution. Do not regenerate the plan, broaden scope, reopen settled decisions, or perform unrelated cleanup without contradictory evidence or a failed check.

When a build, test, search, log inspection, or MCP operation would produce large output, return a bounded `worker_request` to the main agent. Run manageable focused checks directly so implementation and its immediate test loop remain connected.

## Test with implementation

For a defect:

1. use or establish a decisive reproduction when feasible;
2. add focused regression coverage for the accepted causal behavior;
3. record the evidence-backed causal chain and rejected hypotheses;
4. fix the root cause rather than transform output to satisfy a fixture;
5. run the regression and affected checks.

For a feature, add the smallest decisive coverage at the lowest effective layer. Add integration or end-to-end coverage only when behavior crosses a real component, process, persistence, security, migration, recovery, or user-facing boundary.

Do not weaken valid tests, hard-code to fixtures, add production-only test paths, manufacture impossible internal states, or add ceremonial coverage.

## Candidate-ready return

```text
Candidate status
- candidate-ready | needs-workers | blocked

Changes made
- file | purpose | accepted requirement/work-item step

Tests added or changed
- file | requirement or defect protected

Observed validation
- command/tool | observed result | pass/fail/not run

Worker requests, when needed
- request_id | bounded operation | scope | expected evidence | stop condition

Defect evidence, when applicable
- attempt_id | affected requirement | decisive reproduction | causal evidence | rejected hypotheses | applied fix | progress delta

Prohibited-pattern audit
- speculative defense | wrappers/abstractions | callbacks/hooks | retries/fallbacks | compatibility/legacy

Known limitations or escalation
- observation | inference/unknown | consequence | decision owner | exact need
```
