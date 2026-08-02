# Task routing

Choose the lightest route that resolves real uncertainty and risk. Roles are leaf capabilities, not a fixed sequence. The user-facing bridge selects roles and chains handoffs; roles do not delegate.

## Route order

1. Check the production or test-only supplied-plan fast path in `SKILL.md` before creating a new brief or plan.
2. If it does not apply, classify by requested deliverable, unresolved facts, architectural impact, and risk.
3. Promote a route only when new evidence activates a named trigger.

## Route profiles

### Inquiry

Use for explanation, diagnosis, research, design discussion, or recommendations without requested edits.

Default: Researcher for a bounded evidence question when needed. Add Manager only if the requested decision lacks an outcome or decision owner. Add Architect only for an explicitly requested architecture assessment. Do not invoke Engineer or Tester.

### Review

Use when findings are the deliverable. Default: Reviewer, with Researcher for bounded repository or documentation evidence. Use Manager only to settle material review scope or acceptance ambiguity, and Architect only for architecture boundaries. Tester may run an authorized reproduction or existing check; Engineer joins only when the user also requests fixes.

### Test-only

Use when the requested deliverable is tests, fixtures, test configuration, a reproduction, or independent validation without requested production behavior changes.

Default: Tester. Engineer is conditional only after a production defect is confirmed or the accepted verification design requires a production test seam that the correct decision owner explicitly approved. Tester must not silently edit production code. Use Manager only for materially unsettled acceptance or support, Researcher only for a bounded unknown that changes the test, and Reviewer only when test integrity or risk justifies independent review. Promote to an implementation route if production behavior becomes an accepted deliverable.

When the user supplies a complete viable test-only plan, use `supplied_test_plan_fast_path`: Tester only, with Manager, Researcher, Architect, Planner, and Engineer skipped unless decisive new evidence invalidates that path.

### Direct change

Use only when all are true:

- expected behavior and the entry point are clear;
- the edit is local and low risk;
- no public contract, schema, persistence, security, concurrency, deployment, migration, or support boundary changes;
- focused validation is obvious; and
- expected output is small.

Default: Engineer and a deliberate bridge diff check. Add Tester or Reviewer only on a trigger below. Do not create Manager, Researcher, Architect, or Planner passes merely to restate clear work.

### Standard delivery

Use for a feature, fix, refactor, maintenance task, or test-infrastructure change with multiple coherent edits and settled architecture.

Default: Manager only if the brief is unsettled; Researcher only for material unknowns; Planner when the work needs a file-specific ordered plan; Engineer; then required independent Tester. Reviewer remains conditional.

### Architecture delivery

Use when an architecture trigger applies. Typical sequence: conditional Manager and Researcher, Architect, Planner, Engineer, Tester, Reviewer. Skip any earlier role whose input is already accepted and sufficient.

### Long-horizon delivery

Use for greenfield or multi-milestone work likely to cross sessions or context boundaries. Use durable state and slice-by-slice integration. Engineer and Tester are required for every production milestone; other roles still follow their triggers, so long duration alone does not make every advisory role mandatory at every milestone.

## Typical mapping

| Request | Default route | Typical roles |
|---|---|---|
| Explain or investigate code | Inquiry | Researcher if evidence is broad or uncertain |
| Review code or architecture | Review | Reviewer; optional Researcher or Architect |
| Fix a clear local bug | Direct change | Engineer; optional Tester |
| Fix a non-local or high-risk bug | Standard or architecture delivery | Researcher as needed, Engineer, Tester, Reviewer; Architect only on trigger |
| Add a local feature | Standard delivery | Conditional Manager/Planner, Engineer, Tester, conditional Reviewer |
| Change a public or cross-module contract | Architecture delivery | Architect, Planner, Engineer, Tester, Reviewer; conditional Manager/Researcher |
| Perform a local behavior-preserving refactor | Direct or standard delivery | Engineer with characterization evidence; Tester when routed as standard |
| Perform an architecture or subsystem refactor | Architecture delivery | Architect, Planner, Engineer, Tester, Reviewer |
| Create a multi-milestone project | Long-horizon delivery | Engineer and Tester per production milestone, triggered advisory roles, durable state |
| Add, repair, or run tests only | Test-only | Tester required; Engineer only for a confirmed production defect or explicitly accepted production seam |
| Change security, authorization, migration, billing, data integrity, concurrency, or deployment | Architecture delivery | Architect, Planner, Engineer, Tester, Reviewer |

## Researcher triggers

Use Researcher when one or more apply:

- entry point, execution path, or root cause is unknown;
- multiple packages, services, versions, or hypotheses require investigation;
- exact installed behavior and external documentation both matter;
- logs, searches, test output, generated content, or diffs are likely to be verbose; or
- an independent evidence pass can materially challenge a decision.

Give Researcher exact questions and a stop condition. A targeted lookup the bridge can answer without context pollution does not justify a separate pass.

## Architect triggers

Use Architect when work changes or may change:

- a public or cross-module interface, schema, protocol, or invariant;
- ownership, trust, authentication, authorization, privacy, or security boundaries;
- persistence, consistency, transactions, concurrency, ordering, or idempotency;
- deployment topology, migration, rollback, operational model, or observability contract;
- a major dependency, framework, infrastructure component, or cross-cutting abstraction;
- performance or resource constraints that shape design;
- a production testability seam; or
- a choice with material product, cost, risk, or support consequences.

Multiple changed files alone are not an architecture trigger.

## Planner triggers

Use Planner when accepted work requires multiple ordered slices, file ownership, coordination, migration sequencing, or a validation matrix that is not already supplied. Do not use Planner to make product or architecture decisions or to rewrite a viable user plan.

## Independent Tester baseline and triggers

Tester is required after Engineer for supplied-plan, standard, architecture, and long-horizon production delivery. The independent pass owns acceptance evidence and starts the bounded failure-classification and repair loop when validation fails.

For direct changes and non-implementation routes, add Tester when one or more apply:

- user-visible behavior needs independent acceptance verification;
- components, processes, persistence layers, or services interact;
- end-to-end, migration, authorization, concurrency, recovery, or operational behavior matters;
- test infrastructure changes materially;
- a defect can recur through multiple paths;
- Engineer tests may be implementation-coupled;
- the change is high risk or a prior attempt failed; or
- the user requests thorough or independent verification.

A clear local fix with a decisive regression test and focused green suite may not need a separate Tester.

## Independent Reviewer triggers

Use Reviewer when:

- the user requests review;
- architecture delivery or high-risk work is involved;
- the diff is broad, security-sensitive, migration-related, or difficult to reason about;
- multiple implementation attempts occurred;
- a prior Reviewer finding needs closure; or
- independent disconfirmation materially improves confidence.

For a direct low-risk change, the bridge may perform a final diff check. That check is not equivalent to independent review and must not be represented as such.
