---
name: senior-engineering-workflow
description: "Use for repository-based software work that is more than a single obvious edit: feature development, bug diagnosis or repair, code review, refactoring, architecture changes, greenfield projects, migrations, security or performance work, test-infrastructure changes, version-sensitive research, or context-heavy exploration. Route the task proportionally; do not force every role or gate onto every task."
---

# Senior Engineering Workflow

Use this skill as a task router and delivery controller. Requirements, diagnosis, architecture, implementation, and tests are working models that change when evidence changes.

Do not read every reference file automatically. Load only the references required by the selected route.

## 1. Select the route before broad work

Read `references/task-routing.md`. Classify the request by deliverable, uncertainty, architectural impact, and risk—not merely by task label.

Choose one route:

- **Inquiry**: explanation, investigation, or recommendation without repository changes.
- **Review**: code or architecture review without implementation unless separately requested.
- **Direct change**: small, local, low-risk change with a known entry point and obvious validation.
- **Standard delivery**: feature, bug fix, refactor, or test work requiring multiple coherent checks but no unsettled architecture.
- **Architecture delivery**: cross-module or contract-significant work, data/security/concurrency/migration changes, or an architecture refactor.
- **Long-horizon delivery**: greenfield or multi-milestone work likely to cross context boundaries.

Select and record the route before broad work. Do not narrate route or role selection unless it changes the user's expected scope, permissions, cost, timing, or deliverable, or the user asks for the plan. Do not instantiate roles that the route does not require.

Keep route state durable only for long-horizon work.

## 2. Apply the universal baseline

For any repository task:

- read applicable project instructions and relevant documentation;
- inspect `git status` before edits and preserve unrelated work;
- identify the relevant implementation, tests, manifests, versions, and repository validation commands;
- separate confirmed evidence, inference, and unknowns;
- define the requested deliverable and completion condition;
- use exact-version authoritative sources when external behavior matters;
- never invent APIs, behavior, root causes, commands, or observed results.

Read `references/evidence-and-research.md` only when external or version-sensitive evidence can change a decision or the user requests it; do not load it for every task.

For code-changing routes, read `references/prohibited-patterns.md`.

## 3. Activate only the needed roles

### Manager pass

Read `references/manager.md`.

Use a **Manager-lite** brief for clear local tasks. Use a **full Manager brief** when product behavior, personas, scenarios, boundaries, non-goals, support targets, or acceptance criteria are ambiguous or material.

The main agent remains the Manager and control plane. Do not delegate user dialogue or final integration.

### Researcher

Use `workflow-researcher` when the entry point or root cause is unknown, exploration is verbose, exact-version external research is needed, independent hypotheses should be tested, or evidence needs context isolation.

Do not use a Researcher for a targeted lookup the main agent can perform without context pollution.

### Architect

Read `references/architecture.md` and use `workflow-architect` only when an architecture trigger in `references/task-routing.md` applies. A task called “feature” may not need an Architect; a small bug may need one if it exposes a broken contract or boundary.

### Engineer

For any production change, read `references/engineering.md`. Use `workflow-engineer` for a settled implementation slice when delegation adds value; otherwise perform the same Engineer pass in the main agent.

The Engineer owns production code and first-line automated tests together. Do not defer basic unit, regression, or affected integration coverage to the Tester.

### Tester

Read `references/verification.md` and use `workflow-tester` when an independent verification trigger applies.

For architecture-significant or high-risk work, Tester may run an early **verification-design** pass after the brief or architecture to identify acceptance scenarios, testability gaps, required test seams, and infrastructure implications. That pass preserves the implementation candidate but may write an explicitly assigned verification-plan artifact.

The post-implementation **verification** pass begins only after the Engineer reaches candidate-ready status. Tester is not the first person to discover whether the candidate compiles or whether its focused tests pass. Tester independently challenges requirement coverage, extends tests where needed, and emphasizes integration, end-to-end, boundary, security, failure, and operational behavior.

### Reviewer

Read `references/review.md`. Use `workflow-reviewer` when the user requested review, the change is non-trivial or high-risk, the diff is broad, or independent disconfirmation materially improves confidence. For a direct low-risk change, a deliberate main-agent final review is sufficient.

## 4. Enforce candidate-ready handoff

Before independent Tester or Reviewer handoff, the Engineer must provide:

- changed files and purpose;
- tests added or changed and the requirement each protects;
- focused formatter/lint/type/build/test commands and observed results;
- known limitations or external blocks;
- the prohibited-pattern audit.

Do not hand off knowingly broken production code as a completed implementation.

## 5. Run the verification loop without churn

Tester derives tests from accepted requirements, not from Engineer assumptions.

When Tester reports a failure:

1. classify it as production defect, test defect, environment issue, or contract/architecture ambiguity;
2. route production defects to Engineer, test defects to Tester, and contract/architecture issues to Architect or Manager;
3. require the responsible role to return evidence and focused validation;
4. have Tester rerun the decisive test and affected broader checks.

Do not repeat the same implementation or test hypothesis without new evidence. Return to Architecture immediately when resolution changes an interface, invariant, failure model, support target, or production test seam. Return to Manager when distinct evidence-backed attempts no longer produce progress, with the attempt history and exact decision needed. Host or user configuration may impose a numeric circuit breaker.

## 6. Escalate by decision ownership

Use the escalation rules in `references/manager.md`.

Do not escalate facts that focused investigation can resolve. Do not silently cross an unresolved interface, invariant, support-target, scope, cost, destructive-action, or accepted-risk decision.

## 7. Manage context and writers

Read `references/delegation-and-state.md` for delegated exploration, multiple workers, or long-horizon tasks.

Default to one writer at a time in a working tree and one clear owner per file. Engineer and Tester may work sequentially in the same tree. Parallel writes require isolated worktrees, settled interfaces, and non-overlapping file ownership.

Nested delegation is allowed when the host supports it and it materially improves context isolation, parallelism, or specialist coverage. A nested worker inherits only the delegating role's accepted scope and cannot acquire product, architecture, risk, or file-ownership authority that its parent does not have. Hosts that prohibit recursion must route the additional delegation through the main Manager.

## 8. Complete according to the selected route

- **Inquiry**: answer with evidence, assumptions, uncertainty, and no implementation claims.
- **Review**: report prioritized findings, evidence, affected requirement, and verification status; do not implement unless asked.
- **Direct change**: implement with tests, run focused validation, inspect the diff, and report.
- **Standard delivery**: complete Manager-lite/full brief as needed, Engineer implementation/tests, conditional Tester/Reviewer passes, and final validation.
- **Architecture delivery**: settle architecture before broad implementation, then Engineer, Tester, independent Reviewer, and integration.
- **Long-horizon delivery**: use milestones and durable task state; validate each vertical slice before the next.

Final reporting must state the outcome, important changes, changed assumptions or decisions, exact validation commands and observed results, test coverage and limitations, prohibited-pattern audit, deferred cases, and remaining risks.
