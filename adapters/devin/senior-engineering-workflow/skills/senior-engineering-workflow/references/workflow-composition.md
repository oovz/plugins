# Composing delivery workflows

Use this reference when another selected skill or supplied procedure organizes the task. The selected workflow owns its interview, spec, tickets, implementation sequence, review criteria, and requested deliverable. SEW supplies execution discipline. Apply the user's accepted scope and repository policies to both.

## Preserve accepted decisions

Carry accepted behavior, supported callers and environments, intentional limitations, deferred capabilities, and agreed verification through specifications, tickets, delegation, review, and resumed sessions. Use the existing authoritative specification, ticket, or decision record; include only the constraints relevant to the slice and a short excerpt when the recipient may lack its context.

Measure completeness against the accepted increment. A workflow transition preserves settled decisions. Reopen one when new evidence changes its consequences, reveals a contradiction, or shows that planned evidence cannot establish the accepted outcome. Explicitly deferred capabilities remain deferred until that decision changes.

## Keep transitions with the primary agent

The primary agent runs the overall workflow and dispatches only bounded slices. An Engineer receives implementation or artifact authoring and its immediate validation, then returns results. A Verifier receives a design or stable candidate and review criteria, then returns findings. A specialist asked to start a peer, invoke an orchestrating review skill, publish, or declare overall completion returns that pending step to the primary agent.

When a selected review calls for separate standards and spec checks, the primary agent can assign those checks as separate bounded reviews. Each reviewer derives findings from its assigned criteria and the same candidate. Preserve explicitly required independence; disclose when the host cannot supply it.

## Matt Pocock workflow composition

Apply these standing SEW adaptations when composing with `mattpocock/skills`. Preserve the selected workflow's artifacts and user decision checkpoints, reusing approval already given for the same decision.

- **Grilling:** explore decisions needed for the accepted increment. Explicit support limits and deferrals close those branches unless new evidence warrants reopening them. Confirm shared understanding at the workflow's checkpoint.
- **Specification:** cover accepted behavior and relevant failure semantics. Use stable public interfaces at the lowest reliable verification layer, reusing approved seams. Add higher-level checks for integration boundaries that lower-level evidence cannot establish. This adapts `to-spec`'s preference for the highest possible seam; use artifact evidence for non-executable deliverables. Resolve materially new testing decisions through the selected workflow.
- **Ticketing:** produce independently useful outcomes through the layers relevant to each deliverable. Carry accepted limits and required evidence into each ticket and preserve the breakdown approval checkpoint.
- **Implementation:** apply TDD and language-specific checks where they establish executable behavior. Select evidence for configuration, CI, deployment preparation, design, and documentation using [engineering](engineering.md), with gate applicability as below.
- **Review:** retain the selected axes, their independence, and their original assessments. The primary agent separately dispositions findings against the accepted task using [verification](verification.md). The selected review satisfies the corresponding SEW review need; add another review for a distinct requirement or consequential gap.

## Adapt the candidate before dispatching review

For a workflow such as `mattpocock/skills`' `implement` → `code-review` → commit, make the review input explicit before invoking the review procedure:

> Review the intended implementation against the pinned baseline, including staged, unstaged, and intended new files. Apply the selected standards and spec criteria to this complete candidate. Use the supplied candidate in place of a commit-only diff or its empty-diff early exit. Return findings to the primary agent before commit.

Prepare that input using [verification](verification.md). A review procedure that compares only `<fixed-point>...HEAD` omits uncommitted work. An empty committed diff is therefore insufficient to conclude there is nothing to review. Supply the baseline SHA, included paths and new-file contents, excluded unrelated changes, and candidate location to every review axis. Inspect the review's reported coverage before accepting it.

This is an explicit SEW-side adaptation for review of the current implementation; upstream skill files remain unchanged. For a user-requested committed-only review, preserve that scope. If a review tool only accepts commits, use an authorized isolated snapshot or another review route that can inspect the complete candidate, and report any remaining coverage limit.

## Preserve gates and authority

Identify the selected workflow's applicable checks and completion boundary. For executable changes, run accepted repository and workflow gates even when existing coverage justifies zero new tests. Choose additional checks according to changed behavior and remaining evidence gaps.

For standalone design and documentation, use accepted artifact-specific evidence in place of the code-specific TDD, typecheck, and full-suite loop. Run a full build or test suite when an explicit repository or release gate requires it, or when needed to establish affected executable behavior. This is a standing SEW composition adaptation; routine application within accepted scope needs no new permission exchange.

A large repository alone does not waive a required gate. Use an affected-only local gate with broader CI only when accepted project policy or a user decision permits that arrangement, and report pending CI separately.

Keep local validation, reviewed changes, commits, PRs, and publication distinct. Reuse authorization already supplied by the request or accepted plan. Ask only for missing authority before a consequential action, while continuing independent authorized work.

After fixes or integration, validate the final candidate and recheck affected findings. Finish the selected workflow only when its required artifacts and gates have observed evidence or the decision owner has explicitly accepted a limitation.
