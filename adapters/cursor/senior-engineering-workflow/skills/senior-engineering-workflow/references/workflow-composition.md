# Composing delivery workflows

Use this reference when another selected skill or supplied procedure organizes the task. The selected workflow owns its interview, spec, tickets, implementation sequence, review criteria, and requested deliverable. SEW supplies execution discipline. Apply the user's accepted scope and repository policies to both.

## Keep transitions with the primary agent

The primary agent runs the overall workflow and dispatches only bounded slices. An Engineer receives implementation and immediate tests, then returns results. A Verifier receives a design or stable candidate and review criteria, then returns findings. A specialist asked to start a peer, invoke an orchestrating review skill, publish, or declare overall completion returns that pending step to the primary agent.

When a selected review calls for separate standards and spec checks, the primary agent can assign those checks as separate bounded reviews. Each reviewer derives findings from its assigned criteria and the same candidate. Preserve explicitly required independence; disclose when the host cannot supply it.

## Adapt the candidate before dispatching review

For a workflow such as `mattpocock/skills`' `implement` → `code-review` → commit, make the review input explicit before invoking the review procedure:

> Review the intended implementation against the pinned baseline, including staged, unstaged, and intended new files. Apply the selected standards and spec criteria to this complete candidate. Use the supplied candidate in place of a commit-only diff or its empty-diff early exit. Return findings to the primary agent before commit.

Prepare that input using [verification](verification.md). A review procedure that compares only `<fixed-point>...HEAD` omits uncommitted work. An empty committed diff is therefore insufficient to conclude there is nothing to review. Supply the baseline SHA, included paths and new-file contents, excluded unrelated changes, and candidate location to every review axis. Inspect the review's reported coverage before accepting it.

This is an explicit SEW-side adaptation for review of the current implementation; upstream skill files remain unchanged. For a user-requested committed-only review, preserve that scope. If a review tool only accepts commits, use an authorized isolated snapshot or another review route that can inspect the complete candidate, and report any remaining coverage limit.

## Preserve gates and authority

List the selected workflow's required checks and completion boundary. Run required repository and workflow gates; choose additional checks according to impact and uncertainty. A large repository alone does not waive a full-suite requirement. Use an affected-only local gate with broader CI only when the accepted project policy or user decision explicitly permits that adaptation, and report pending CI separately.

Keep local validation, reviewed changes, commits, PRs, and publication distinct. Reuse authorization already supplied by the request or accepted plan. Ask only for missing authority before a consequential action, while continuing independent authorized work.

After fixes or integration, validate the final candidate and recheck affected findings. Finish the selected workflow only when its required artifacts and gates have observed evidence or the decision owner has explicitly accepted a limitation.
