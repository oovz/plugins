# Task routing v2

The capable main agent owns the accepted contract, architecture, planning, transitions, integration, attempt budgets, and completion. Select the lightest route that resolves real uncertainty and risk. Capabilities may be performed inline or delegated; role availability alone is not a delegation reason.

## Route order

1. Preserve a viable supplied plan before creating a replacement plan.
2. Classify the requested deliverable: inquiry, review, test-only change, direct change, standard delivery, architecture-significant delivery, or long-horizon delivery.
3. Identify unresolved evidence, material design decisions, noisy tool work, independent-verification needs, and isolated implementation slices.
4. Construct a small execution graph. Every specialist result returns to the main agent.
5. Promote the route only when observed evidence activates a named trigger.

## Main-agent capabilities

The main agent performs these directly unless a bounded evidence pass is useful:

- settle outcome, scope, acceptance, support, and user-owned decisions;
- choose architecture, interfaces, invariants, boundaries, failure behavior, migration, and rollback;
- create or revise the executable work graph;
- authorize file ownership and cross-role transitions;
- integrate candidates and evidence;
- decide whether another attempt is justified;
- accept completion or report the blocker.

## Specialist triggers

### Researcher

Use when a bounded answer can change the route or implementation and one or more apply:

- entry point, execution path, current behavior, or root cause is unknown;
- several packages, versions, sources, or hypotheses require comparison;
- exact installed behavior and external documentation both matter;
- research output is likely to be verbose; or
- a fresh evidence pass can materially challenge a decision.

Do not use for one targeted lookup the main agent can perform without meaningful context cost.

### Engineer

Use for one bounded production or test-only slice when delegation improves context hygiene, isolation, or parallelism. Ownership, accepted behavior, and interfaces must be sufficiently settled. Keep one writer per working tree and one owner per file.

### Verifier

Use when independent acceptance evidence, adversarial review, design challenge, or finding closure materially improves confidence. Strong triggers include public contracts, security, authorization, privacy, persistence, migration, concurrency, billing, data integrity, broad diffs, previous failed attempts, test-design uncertainty, or explicit user request.

A local change with a decisive regression test and focused green suite may complete without a separate Verifier when the accepted risk allows it.

### Worker

Use for a single exact or tightly bounded shell, search, build, test, log, documentation, or MCP operation when raw output would be large or several operations can run independently. Worker reports observations and status; it does not make engineering decisions.

## Portable worker fan-out

Researcher, Engineer, and Verifier return `worker_requests` to the main agent. The main agent launches Workers and provides compact results back to the requesting specialist only when another synthesis pass is useful. Do not require nested-agent support.

## Repair route

A failed candidate does not automatically re-enter Engineer. The main agent first requires:

- affected accepted requirement or invariant;
- decisive reproduction;
- failure classification;
- evidence-backed causal chain or a bounded diagnostic work item;
- rejected hypotheses with evidence;
- explicit repair ownership and required reruns;
- remaining attempt budget.

Stop after two candidate repair cycles or two evidence-backed no-progress attempts unless materially new evidence justifies one explicitly re-scoped final attempt.
