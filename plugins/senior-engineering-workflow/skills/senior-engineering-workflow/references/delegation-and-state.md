# Delegation, writers, and durable state

## Context strategy

Choose before broad exploration:

- **Direct**: known entry point, bounded output, local work.
- **Delegated exploration**: raw search, documentation, test, log, or diff output is much larger than the conclusions needed by the main thread.
- **Long-horizon**: multiple milestones, repeated research/design cycles, or likely context transitions.

Use candidate-preserving workers to isolate evidence-heavy work. Give each worker:

- objective and motivation;
- scope in and out;
- known clues;
- exact questions;
- evidence standard;
- output contract;
- forbidden actions.

Keep scopes non-overlapping. Require conclusions and evidence references, not raw dumps. The main thread should not duplicate delegated high-volume work while it is in progress. Synthesize first and spot-check only disputed, surprising, security-critical, or decision-critical claims.

## Nested delegation

Allow a specialist to delegate again when the host supports nested agents and the extra worker materially improves context isolation, parallelism, or specialist coverage.

- Nested work must remain inside the delegating role's accepted scope.
- Delegation cannot grant product, architecture, accepted-risk, destructive-action, or compatibility authority that the parent does not own.
- A parent remains accountable for the nested result and integrates it before handoff.
- Nested writers require isolated worktrees or explicit non-overlapping file ownership.
- Do not create recursive role loops merely to add ceremony.
- When the host blocks recursion, return the decomposition request to the main Manager, which chains the additional specialist.

## Writer discipline

Default to one active writer per working tree and one owner per file.

Engineer and Tester may write sequentially in the same tree. Parallel writes require:

- isolated worktrees or equivalent sandboxes;
- settled interfaces;
- explicit non-overlapping file ownership;
- an integration and revalidation owner.

## Long-horizon state

For long-horizon work, initialize `assets/TASK_STATE.template.md` before broad implementation. Keep only high-signal state:

- accepted outcome and requirements;
- assumptions and evidence;
- architecture and decisions;
- selected route and active roles;
- milestones and ownership;
- changed components;
- Engineer and Tester validation;
- review findings;
- unresolved risks and deferred cases;
- next exact action.

Update after material decisions, route or gate transitions, milestones, expected compaction, and session end. Do not store raw logs or copied source blocks.

After resume, read task state, inspect `git status` and the relevant diff, rerun the smallest decisive validation, and continue from the recorded next action instead of rescanning.
