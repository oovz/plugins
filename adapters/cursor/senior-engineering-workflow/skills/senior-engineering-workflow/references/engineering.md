# Implementation and testing

The implementation owner carries a coherent change through its focused test loop. This can be the main agent or an Engineer with bounded ownership.

Inspect the affected implementation, existing tests, and commands; check versions when they affect the change. Confirm accepted behavior, file ownership, relevant interfaces and invariants. Execute a viable supplied plan directly; revise only what contrary evidence invalidates. Escalate a required scope, support, architecture, risk, dependency, or ownership change to the main agent.

## Scope and design

Prefer direct code serving current requirements and concrete near-term consumers. Add abstraction, configuration, hooks, retry, fallback, or compatibility behavior only for a named requirement or actual boundary. Preserve declared support; remove obsolete paths when a changed contract authorizes their removal. Keep unrelated cleanup out of the change.

Keep modules cohesive, responsibilities explicit, and interfaces clear for their actual callers. Check existing code and dependencies before adding a package or duplicating functionality. Choose abstractions from current consumers and accepted requirements.

Treat support policy and transition strategy separately. An authorized breaking change can use a temporary adapter or expand–contract migration when rollout or caller dependencies require it; name the removal condition. Prototypes, experiments, and incident mitigations need a bounded purpose and exit condition. Require working, validated behavior at agreed integration and delivery checkpoints; intermediate local red tests or incomplete refactor steps are part of the implementation loop.

Preserve required external-input validation, authorization, resource bounds and cleanup, concurrency and data invariants, rollback, and explicit error propagation. Avoid hiding defects with catch-and-continue behavior, silent defaults, unexplained sleeps, or fixture-specific output transformations.

## Focused evidence

Before adding a test, identify the accepted behavior or credible failure it protects, the gap in existing coverage, and a plausible incorrect implementation it would detect. These are working decisions; a small task needs no separate testing-plan artifact. Reuse adequate checks. Add cases for distinct behavior, boundaries, or failure modes, or when they materially improve diagnosis or reliability.

For defects, establish intended behavior and use or add a decisive regression that fails for the relevant reason when feasible. An existing failing test may already supply it. Implement the root-cause fix and run that regression plus affected checks. Record when reproduction is unavailable.

Exercise stable interfaces with expectations derived independently from accepted requirements. Keep tests deterministic and their failure signals useful. Do not copy production logic into expected results or mock away the behavior the test claims to establish. Use the lowest effective layer, adding integration or end-to-end checks for real boundaries that smaller checks cannot establish.

Do not add tests that merely pin wording, headings, formatting, comments, or copied settings in `AGENTS.md`, `README.md`, other documentation, or hand-authored configuration. Test configuration through its supported consumer: defaults, precedence, representative values, invalid inputs, and observable effects where relevant. Use existing parsers, schemas, linters, or other validators for mechanical properties and editorial review for prose.

Exact text or byte assertions need an independently established parser, protocol, serialization, generated-artifact, or exact program-output contract. The expected value comes from that requirement, not the current file contents. An agent reading prose does not make its wording a machine interface. For example, test a specified timeout default through the real loader and affected behavior; checking that an example file contains that number establishes little by itself.

Preserve valid tests and reference contracts. Selecting validation does not authorize unrelated suite or documentation cleanup. Routine editorial review can finish within scope; ask only when consequential uncertainty needs the user's decision.

Run required repository and selected-workflow gates even when no new tests are needed. Choose additional checks by impact and unresolved uncertainty, then stop when evidence is sufficient. Repeat or broaden checks when the candidate, relevant inputs, failures, or new concerns justify it. Use repository-native commands and existing automation for mechanical checks; semantic judgments about test value belong in implementation and review, not a generic scanner or new hook.

Run tools within the assigned authority; retain verbose output in scoped artifacts and report actual terminal status. Diagnose a failing check before editing. An environmental failure establishes a validation limitation, not product correctness.

## Handoff

Return changed files and purpose, tests added or changed, exact observed command results, and material limitations. For a repair, include the reproduction, causal evidence, and what the new attempt established. Return any decision beyond the work order to the main agent. The main agent integrates delegated changes and checks the combined candidate.
