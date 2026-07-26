# Task routing

Roles are capabilities, not a fixed sequence. Select the lightest route that covers the task's uncertainty, architectural impact, and risk.

## Route profiles

### Inquiry

Use for repository questions, diagnosis, research, design discussion, or recommendations without requested edits.

Default roles: Manager inline; Researcher only when evidence is broad, unknown, or version-sensitive.

Do not invoke Engineer or Tester. Use Reviewer only for an explicitly adversarial second opinion.

### Review

Use when the requested deliverable is findings rather than changes.

Default roles: Manager-lite to define review scope and accepted contract; Reviewer as primary worker; Researcher for code-path or documentation context.

Use Architect when evaluating architecture, interfaces, schemas, invariants, trust boundaries, or a proposed redesign.

Use Tester only to run existing checks, reproduce a suspected defect, or create tests when the user explicitly requested verification artifacts. Do not invoke Engineer unless the user also requested fixes.

### Direct change

Use only when all are true:

- the entry point and expected behavior are clear;
- the change is local and low risk;
- no public contract, schema, persistence, security, concurrency, deployment, or migration boundary changes;
- focused validation is obvious;
- expected diff and output are small.

Default roles: Manager-lite, Engineer, main-agent self-review. Researcher, Architect, independent Tester, and independent Reviewer are normally unnecessary.

### Standard delivery

Use for a feature, bug fix, refactor, test-infrastructure change, or maintenance task that needs multiple coherent edits or checks but has no unsettled architecture.

Default roles: Manager-lite or full Manager brief, Engineer, and final review. Add Researcher, Tester, or independent Reviewer according to the triggers below.

### Architecture delivery

Use when any architecture trigger applies.

Default roles: Manager, Architect, Engineer, Tester, independent Reviewer; Researcher as needed.

### Long-horizon delivery

Use for greenfield projects, major subsystem work, or multiple milestones likely to cross context transitions.

Default roles: Manager, Researcher, Architect, Engineer, Tester, Reviewer, durable task state, and milestone-by-milestone integration.

## Typical task mapping

| Request | Default route | Notes |
|---|---|---|
| Explain or investigate code | Inquiry | Researcher only if broad or uncertain |
| Review code or a PR | Review | Reviewer primary; no implementation unless asked |
| Fix a small local bug | Direct change | Engineer adds regression test; promote route if root cause crosses boundaries |
| Fix a non-local or high-risk bug | Standard or Architecture delivery | Architect only when contract/boundary changes or diagnosis exposes architecture issues |
| Add a local feature | Standard delivery | Architect is conditional, not automatic |
| Add a cross-module or public-contract feature | Architecture delivery | Independent Tester and Reviewer normally required |
| Local behavior-preserving refactor | Direct or Standard delivery | Engineer adds/uses characterization tests; Architect usually unnecessary |
| Architecture or subsystem refactor | Architecture delivery | Preserve accepted behavior unless change is explicit |
| Create a new project | Long-horizon delivery | All roles and durable state |
| Add or repair tests only | Standard delivery | Tester may lead; Engineer joins only for production seams or defects |
| Security, authorization, migration, billing, data integrity, concurrency, or deployment change | Architecture delivery | Treat as high risk |

## Researcher triggers

Use Researcher when one or more apply:

- entry point, execution path, or root cause is unknown;
- multiple packages, services, or hypotheses must be investigated;
- exact installed-version behavior and external documentation both matter;
- logs, searches, generated files, test output, or diffs are likely to be verbose;
- an independent evidence pass would materially challenge assumptions.

## Architect triggers

Use Architect when the proposed work changes or may change:

- a public or cross-module interface, schema, protocol, or invariant;
- ownership, trust, authentication, authorization, privacy, or security boundaries;
- persistence, consistency, transactions, concurrency, ordering, or idempotency;
- deployment topology, migration, rollback, operational model, or observability contract;
- a major dependency, framework, infrastructure component, or cross-cutting abstraction;
- performance or resource constraints that shape design;
- testability seams that require production architecture changes;
- more than one viable design with material product, cost, risk, or support consequences.

Do not invoke Architect merely because more than one file changes.

## Independent Tester triggers

Use a Tester verification-design pass before implementation, or a verification pass after candidate-ready status, when one or more apply:

- user-visible feature behavior needs independent acceptance verification;
- multiple components, processes, persistence layers, or services interact;
- end-to-end, migration, authorization, concurrency, recovery, or operational behavior matters;
- test infrastructure is added or materially changed;
- the bug could recur through more than one path;
- the Engineer's tests may be overly implementation-coupled;
- the change is high risk or a prior attempt failed;
- the user explicitly requests thorough verification.

A small local bug with a decisive regression test and focused suite may not need a separate Tester.

## Independent Reviewer triggers

Use Reviewer when:

- the user requests review;
- architecture delivery or high-risk work is involved;
- the diff is broad, security-sensitive, migration-related, or difficult to reason about;
- multiple implementation attempts occurred;
- an independent prohibited-pattern or scope audit materially improves confidence.

For a direct low-risk change, the main agent may perform the final review.
