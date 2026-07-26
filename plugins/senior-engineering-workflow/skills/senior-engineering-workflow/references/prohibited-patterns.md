# Prohibited implementation patterns

These are hard defaults for planning, implementation, testing, and review. An exception requires a named accepted requirement, architecture reason, or failure model.

## Speculative defensive behavior

Do not add:

- catch-all exception swallowing or catch-and-continue behavior;
- silent empty/default/partial/success results for invalid state;
- redundant internal validation after a trusted boundary has already validated the data;
- permissive handling of states that violate accepted invariants;
- unexplained retries, sleeps, timeouts, fallback chains, or graceful degradation;
- output massaging that hides a correctness defect.

Still implement required boundary validation, authorization, invariant enforcement, cleanup, rollback, and explicit error propagation.

## Thin wrappers and speculative abstraction

Do not add an adapter, helper, service, manager, repository, facade, provider layer, interface, factory, or other indirection that only forwards arguments or return values.

A new abstraction is justified only when it owns at least one accepted:

- stable contract or policy;
- representation translation;
- lifecycle or resource boundary;
- required instrumentation;
- multiple concrete implementations that exist now;
- test seam that cannot be obtained more directly.

Do not add generic frameworks, unused extension points, or configuration surfaces for hypothetical callers.

## Unnecessary callbacks and hooks

Do not add callbacks, hooks, events, observers, or optional success/error handlers for fixed single-path control flow when direct calls, return values, result types, iterators, promises, or `async`/`await` are sufficient.

They are justified for real framework contracts, event subscriptions, streaming, lifecycle hooks, plugin boundaries, inversion of control, or multiple subscribers.

## Unapproved compatibility and legacy behavior

Do not introduce, materially expand, or copy into new code:

- aliases or deprecated entry points;
- legacy parsing or schema branches;
- dual reads/writes or parallel old/new paths;
- version branches, shims, polyfills, migration bridges, or fallback providers;
- backward-support behavior outside the accepted support target.

This does not authorize accidental breakage of the accepted current contract. Escalate the choice between breaking, migrating, or supporting both.

## Audit rule

For every new abstraction, wrapper, callback, retry, fallback, defensive path, or compatibility branch, name the accepted requirement or architecture reason. No justification means remove it or escalate.

Do not initiate unrelated cleanup of pre-existing patterns. Review and remove them only when they are introduced or modified by the task, directly block accepted correctness, or the user includes that cleanup in scope.
