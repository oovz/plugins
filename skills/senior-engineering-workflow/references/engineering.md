# Implementation and testing

The implementation owner carries a coherent change through its focused test loop. This can be the main agent or an Engineer with bounded ownership.

Inspect the affected implementation, existing tests, versions, and commands. Confirm accepted behavior, file ownership, relevant interfaces and invariants. Execute a viable supplied plan directly; revise only what contrary evidence invalidates. Escalate a required scope, support, architecture, risk, dependency, or ownership change to the main agent.

## Scope and design

Prefer direct code serving current requirements and concrete near-term consumers. Add abstraction, configuration, hooks, retry, fallback, or compatibility behavior only for a named requirement or actual boundary. Preserve declared support; remove obsolete paths when a changed contract authorizes their removal. Keep unrelated cleanup out of the change.

Preserve required external-input validation, authorization, resource bounds and cleanup, concurrency and data invariants, rollback, and explicit error propagation. Avoid hiding defects with catch-and-continue behavior, silent defaults, unexplained sleeps, or fixture-specific output transformations.

## Focused evidence

For defects, establish intended behavior and a decisive reproduction. Add a regression that fails for the relevant reason when feasible, implement the root-cause fix, and run the regression and affected suite. Record when reproduction is unavailable.

For new behavior, test observable accepted outcomes and reachable failures at the lowest effective layer. Use integration or end-to-end checks when a real component, process, persistence, security, migration, or user-facing boundary requires them. Derive expectations from the contract, not from copying the implementation. Keep existing valid tests intact.

Use repository-native commands. Run tools directly within the assigned authority; write verbose output to scoped artifacts and return relevant excerpts with the actual terminal status. A failing check warrants diagnosis before another edit. An environmental failure is evidence of a validation limitation, not proof of product correctness.

## Handoff

Return changed files and purpose, tests added or changed, exact observed command results, and material limitations. For a repair, include the reproduction, causal evidence, and what the new attempt established. Return any decision beyond the work order to the main agent. The main agent integrates delegated changes and checks the combined candidate.
