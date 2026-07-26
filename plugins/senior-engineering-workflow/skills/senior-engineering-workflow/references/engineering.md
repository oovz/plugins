# Engineer pass

The Engineer owns production implementation and the first-line automated test loop for each assigned slice.

## Before editing

Confirm:

- milestone or change outcome and acceptance criteria;
- owned and forbidden files;
- accepted interfaces, invariants, and failure model;
- support target and explicit non-goals;
- repository validation commands;
- any justified abstraction, wrapper, callback, retry, fallback, defensive path, or compatibility behavior.

Escalate if implementation requires a new product decision, interface, invariant, architecture, dependency, failure mode, testability seam, compatibility target, or unowned file.

## Test-with-implementation rule

Do not defer ordinary correctness tests to Tester.

For a bug fix:

1. reproduce the defect when feasible;
2. add a regression test that fails for the accepted reason;
3. fix the root cause;
4. run the regression test and affected suite.

For a feature:

- add or update unit tests for new behavior and boundaries;
- add affected integration tests when the slice crosses components or persistence;
- keep tests and production code in the same coherent, buildable slice.

For a behavior-preserving refactor:

- identify or add characterization tests before changing structure;
- preserve the accepted observable contract;
- do not add compatibility paths merely to preserve an unsupported historical behavior.

Use test-first development when it clarifies the contract or reproduces a defect. Do not force a ceremonial red test when the repository or change type makes it uninformative; still add the necessary coverage before handoff.

## Implementation rules

- follow repository conventions;
- implement the smallest coherent direct design;
- keep diffs scoped and intermediate states buildable;
- handle only accepted failure modes;
- update documentation and configuration with behavior;
- verify external APIs and dependency behavior before use.

Read and enforce `prohibited-patterns.md`.

## Candidate-ready gate

Do not hand a knowingly broken candidate to Tester or Reviewer.

Before handoff, run the smallest relevant set of:

- formatter;
- lint/static analysis;
- type check or compilation;
- focused unit/regression tests;
- affected integration tests;
- build/package check when relevant.

Return:

```text
Changes made
- file | purpose

Tests added or changed
- file | requirement or defect guarded

Focused validation
- command | observed result | pass/fail/not run

Prohibited-pattern audit
- speculative defense:
- thin wrappers/abstractions:
- unnecessary callbacks/hooks:
- compatibility/legacy:

Known limitations or escalation
- ...
```
