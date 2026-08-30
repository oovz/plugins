# Prohibited implementation patterns

These are hard defaults for planning, implementation, testing, and review. An exception requires a named accepted requirement, architecture reason, or failure model.

## Current and near-term scope

Optimize for accepted current requirements and concrete near-term needs. A near-term need names an actual consumer, implementation, integration, migration, or scheduled deliverable that affects this change. It requires evidence such as an accepted requirement, committed roadmap item, existing additional caller or implementation, or work already under way.

A speculative issue, vague "someday" possibility, or imagined provider, platform, caller, schema, extension, or failure is not evidence. Even a concrete second case does not require abstraction when a direct design remains clearer. Evidence creates design pressure, not automatic permission for abstraction.

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
- multiple concrete implementations that exist now or an accepted near-term implementation with the evidence above, when a shared contract is simpler than direct implementations;
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

Preserve declared current support and public contracts even when the request does not repeat them; accidental breakage is a defect. Do not create support for old, accidental, deprecated, or otherwise undeclared behavior unless it is an accepted target.

## Audit rule

For every new abstraction, wrapper, callback, retry, fallback, defensive path, or compatibility branch, name the accepted requirement or architecture reason. No justification means remove it or escalate.

Do not initiate unrelated cleanup of pre-existing patterns. Review and remove them only when they are introduced or modified by the task, directly block accepted correctness, or the user includes that cleanup in scope.
