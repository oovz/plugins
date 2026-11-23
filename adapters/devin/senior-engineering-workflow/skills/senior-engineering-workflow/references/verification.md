# Verification and repair

Select verification from the accepted outcome and consequences of failure. The implementation owner runs immediate checks. The main agent reviews the final diff, integrates changes, and decides completion.

## Pin the complete candidate

Before a change review, identify the accepted scope, baseline, and candidate kind: committed range, staged snapshot, or current implementation. Resolve named refs to SHAs and record them once. Use the task's recorded starting revision for a local implementation review; for a branch review using merge-base semantics, resolve the requested ref and pin `git merge-base <resolved-ref-sha> HEAD`. Ask only when the intended baseline remains materially ambiguous.

For a current implementation review, collect:

```text
git status --short
git diff --binary <baseline-sha> -- <included-paths>
git diff --cached --binary <baseline-sha> -- <included-paths>
git diff --binary -- <included-paths>
git ls-files --others --exclude-standard -- <included-paths>
```

Replace placeholders with the pinned SHA and explicit task paths. The first diff shows the final tracked working-tree state against the baseline. The cached and unstaged diffs expose differences between that state and the index; they are evidence of candidate composition, not patches to concatenate. Inspect the intended new files returned by `ls-files`, including their contents. Account explicitly for intended ignored artifacts, binary files, or submodule changes when present. A commit-only `git diff <ref>...HEAD` cannot cover this candidate; see the [Git diff forms](https://git-scm.com/docs/git-diff).

Compare with the initial status/diff to distinguish task changes from pre-existing work. Exclude unrelated edits from findings and delivery; if ownership overlaps within a file, identify the intended hunks without discarding the surrounding context needed to review behavior. Surface an unresolved scope ambiguity before accepting the review.

Keep writers paused during review or provide an immutable snapshot in an authorized isolated location. Record baseline and candidate identity, included paths/new files, and exclusions. Check that the candidate is unchanged before accepting findings. After repairs, identify the updated candidate and recheck named findings and affected behavior; broaden review when the change or remaining concern supplies a concrete reason. A staged-only review covers the index; validation against a differing working tree must be labeled separately.

## Independent verification

Use Verifier for an explicit request, consequential security/data-loss/migration risk, disputed acceptance, or a candidate near the model's demonstrated capability limits. Routine changes with decisive checks can complete directly. Independence is a separate context and evidence derivation; using a different model is optional and does not itself establish correctness.

Give the verifier accepted behavior and its established limitations, relevant policies, changed paths, candidate identity or diff baseline, and observed checks. Ask it to derive checks and seek counterexamples. Use one focused review of a coherent candidate by default; add earlier design review for consequential irreversible choices or milestone reviews for independently risky boundaries. A selected workflow's review can satisfy the corresponding SEW review need while preserving its required axes and independence.

Supported purposes:

- **acceptance:** check observable behavior and material failure paths;
- **review:** seek reachable defects in correctness, security, data integrity, scope, and test quality;
- **design-challenge:** challenge a consequential decision before implementation;
- **closure:** recheck named findings on the changed candidate.

Verifier inspects files and runs validation within authority, retaining large logs as artifacts. It leaves production and test files unchanged; missing or defective tests become findings for the implementation owner. Findings identify severity, affected requirement or invariant, a condition reachable through supported use or a relevant boundary, location or reproduction, evidence, and practical consequence. Evaluate security findings against the actual trust boundary.

## Disposition findings

Preserve the reviewer's evidence and original assessment, including separate Standards and Spec reports when selected. The primary agent determines required action under the accepted task, recording its disposition separately:

| Finding | Treatment |
|---|---|
| Defect | Establish the violated requirement or invariant, reachable condition or relevant boundary, evidence, and consequence. Resolve material in-scope defects or obtain the decision owner's explicit acceptance. |
| Accepted limitation | Reference the actual prior decision or support boundary. Reopen it when materially new evidence changes the decision. |
| Optional improvement | Explain the benefit and keep it outside completion requirements unless scope is deliberately expanded. |
| Unresolved question | Identify the smallest useful investigation and whether its answer is necessary for acceptance or authority. |

A clean review is a valid outcome. Accepted limitations require an established decision; inventing acceptance cannot close a newly discovered defect. Ordinary uncertainty about undiscovered defects permits completion after the accepted outcome and required evidence are established.

## Code and test quality

Assess the implementation's responsibilities, interfaces, and reuse of existing code against the accepted scope. Apply [engineering](engineering.md) when assessing validation. Check both missing evidence and unnecessary new tests:

- Identify changed behavior or material failure paths that existing checks do not cover.
- Ask which plausible broken implementation each new test would reject. Challenge assertions that would still pass that implementation, expected results copied from production logic, and mocks that replace the claimed behavior.
- Check whether new cases add a distinct failure signal or improve diagnosis or reliability. Adequate existing coverage can be reused.
- Reject tests that merely preserve documentation wording, incidental formatting, or copied settings. Exercise configuration through its supported consumer. Exact assertions need an independently established machine contract; the current text alone is insufficient.

Report actionable findings and their practical consequences to the implementation owner. Keep remediation within the assigned scope; a weak existing test does not authorize broad suite cleanup or removal of reference contracts. This assessment is part of the selected review route and does not require a separate reviewer for every edit.

## Failure and repair

Classify the failure before editing: production defect, test defect, environment issue, or contract/design ambiguity. Establish a causal hypothesis and the smallest decisive reproduction or diagnostic check. The implementation owner repairs within scope and reruns that check plus affected broader validation.

Compare each attempt with previous evidence. A narrowed causal chain, rejected hypothesis, changed reproduction, or newly passing requirement is progress. When attempts repeat without progress, stop varying the same fix and reassess the model or design. Use a fresh investigation when it can resolve uncertainty. Set explicit limits for costly or risky experiments. Continue useful, authorized diagnosis while new evidence supports the next attempt.

Keep valid tests intact. Changes to accepted behavior, support, destructive actions, or risk require the appropriate decision owner. Resolve findings with observed evidence; an explicitly accepted risk is reported as accepted, not fixed.

## Completion evidence

Inspect the final candidate and run repository-required checks plus the selected workflow's applicable gates under [workflow composition](workflow-composition.md#preserve-gates-and-authority). Choose additional evidence using [engineering](engineering.md#evidence-by-deliverable). After sufficient evidence, stop redundant reruns; a subsequent edit or new concern may require another check.

Report exact commands and terminal results, accepted criteria coverage, and limitations. Distinguish local structural/schema checks, actual behavioral agent runs, native host execution, and release/production acceptance. Material unresolved findings block an unqualified completion claim.
