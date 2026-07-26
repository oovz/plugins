# Architecture pass

Use only when an Architect trigger from `task-routing.md` applies.

Provide the Architect with the accepted brief, relevant evidence, current architecture, constraints, support target, and exact questions. The Architect preserves production and test code, may write only explicitly assigned planning or architecture artifacts, and does not decide product scope or accepted risk.

The architecture output should be proportional. Cover only material topics:

- affected components and ownership;
- interfaces, schemas, contracts, and invariants;
- data flow and state transitions;
- trust, authentication, authorization, privacy, and security boundaries;
- persistence, consistency, transactions, concurrency, and ordering;
- accepted failure model, explicit error propagation, retry safety, and idempotency;
- performance, resource, observability, deployment, migration, rollback, and removal implications;
- test seams for unit, integration, and end-to-end behavior;
- real alternatives, decisive trade-offs, one recommendation, and remaining uncertainty.

Prefer the simplest design that satisfies the accepted scope. Do not introduce a provider-neutral layer, generic framework, compatibility path, wrapper, callback abstraction, retry/fallback chain, or speculative extension point without a named accepted requirement.

## Architecture exit condition

Before broad implementation, one design must be sufficiently settled that the Engineer can implement a coherent slice without making a new product, interface, invariant, failure-model, or support-target decision.

When architecture is not triggered, record that decision and the evidence briefly; do not create an architecture document merely to satisfy process.
