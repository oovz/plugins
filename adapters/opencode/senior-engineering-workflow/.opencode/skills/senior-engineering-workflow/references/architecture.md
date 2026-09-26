# Main-agent architecture checklist

Architecture is a main-agent responsibility. Use this checklist only when the task changes or may change a material boundary, contract, invariant, trust model, persistence model, deployment model, or other consequential design decision. Do not create a separate architecture stage merely because several files are involved.

## Decision surface

Cover only applicable topics:

- affected components, ownership, and dependency direction;
- interfaces, schemas, protocols, public contracts, and invariants;
- data flow, state transitions, persistence, consistency, transactions, concurrency, and ordering;
- trust, authentication, authorization, privacy, secrets, and security boundaries;
- accepted failure behavior, explicit error propagation, retry safety, idempotency, and recovery;
- performance, resources, observability, deployment, migration, rollback, and removal;
- test seams for unit, integration, end-to-end, migration, recovery, and operational behavior;
- real alternatives, decisive trade-offs, one recommendation, and remaining uncertainty.

Prefer the simplest design satisfying the accepted scope. Do not introduce provider-neutral layers, generic frameworks, compatibility paths, thin wrappers, callbacks, retries, fallbacks, or speculative extension points without a named accepted requirement or concrete boundary need.

Use repository and runtime evidence for the current system. Commission a bounded Researcher work item only when an unresolved fact can change the decision. One architecture pass is the default. Reconsider only when new evidence contradicts a material assumption or validation shows that the design cannot satisfy an accepted contract.

## Exit condition

Architecture is sufficiently settled when the main agent can create bounded implementation work without leaving a product, interface, invariant, failure-model, support-target, migration, trust-boundary, or accepted-risk decision to an Engineer.

When a user-owned choice remains, ask one targeted question that includes the current accepted requirement, decisive evidence, options and consequences, and a recommendation.

## Optional architecture record

Produce this only when the design itself is a requested deliverable or when the work is consequential enough to require a durable decision record:

```text
Architecture status
- ready | blocked

Affected boundaries and evidence
- component/interface | current behavior | evidence

Decisions
- decision | invariant/failure behavior | rationale | rejected alternative | consequence

Data, trust, operational, migration, and verification implications
- only applicable items

Open decision
- owner | decisive evidence | recommendation | exact question
```
