# Delegation and state

Delegate a result that can be judged independently. Include enough task-relevant context to execute without reconstructing the whole conversation. State settled interfaces and decisions, and leave routine implementation or investigative choices to the assigned owner.

## Work order

Use plain language or a small structured packet with:

- **Objective and acceptance:** the bounded result, why it matters, and observable success or evidence requirements.
- **Scope and authority:** owned and forbidden files, permitted tools/actions, and applicable repository policies and selected skills (`authorized_instruction_sources`). Identify existing concurrent work and require its preservation. Inherited tool permission does not broaden task authority.
- **Context:** relevant code, sources, constraints, settled contracts, and unknowns. For review, identify the candidate or diff baseline and accepted behavior separately from the author's explanation.
- **Checks and stop conditions:** relevant commands, completion criteria, and circumstances requiring return to the main agent. Set time, cost, or attempt limits when the operation needs a bound.
- **Return:** conclusion or changes, decisive evidence, exact observed checks, uncertainties, and any needed decision.

Stable identifiers are useful for concurrent candidates, findings, or resumable work; a simple handoff needs no packet version, invocation counter, or full ledger. Follow-ups can send only changed evidence, scope, and the next authorized action when shared context remains current.

The expected deliverable specifies evidence form, not a predetermined conclusion. Ask whether a hypothesis is supported and request counterevidence. Specialists run searches, builds, tests, and log processing directly within scope and return compact evidence. Each specialist reports to the main agent and does not spawn peers or start an automatic next phase.

## Evidence and tools

Separate observations from inference and unknowns. Cite paths and lines, exact commands and exit status, tool results, URLs, or durable artifacts for material claims. Retain raw evidence in an authorized location when a summary may need checking; redact secret-bearing output. Filter or paginate output by the question being answered. Preserve causal context around excerpts.

Use the wait mechanism belonging to the running command, cell, or agent, respecting host limits and communication needs. Require terminal status before reporting completion. Keep interactive operations responsive.

## Concurrent work and review

Assign one owner per file. Parallel writes require disjoint ownership or isolated checkouts and settled shared interfaces. Shared-file changes and dependent migrations stay sequential. The main agent reconciles integration and runs checks against the combined candidate.

For independent verification, use a fresh context where available. Supply scope, accepted behavior, source evidence, and candidate identity without coaching a favorable conclusion. The verifier may inspect the implementation and prior findings while deriving its own checks. A separate agent provides a separate reasoning attempt, not a guarantee of independent errors.

## Durable state

Keep state in the conversation for continuous work. When interruption, compaction, or a session boundary is likely, use an authorized task note containing:

- objective, accepted decisions, and current branch/candidate;
- completed work, active ownership, and pending dependencies;
- exact validation results and evidence/log locations;
- unresolved findings, rejected hypotheses, and next decisive action.

Record changes to decisions as they occur. Resume by comparing the note with current repository state; treat stale summaries as pointers to recheck. Context capacity does not remove interruption risk or justify saving secrets.
