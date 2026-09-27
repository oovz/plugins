# Verification and repair

Select verification from the accepted outcome and consequences of failure. The implementation owner runs immediate checks. The main agent reviews the final diff, integrates changes, and decides completion.

## Independent verification

Use Verifier for an explicit request, consequential security/data-loss/migration risk, disputed acceptance, or a candidate near the model's demonstrated capability limits. Routine changes with decisive checks can complete directly. Independence is a separate context and evidence derivation; using a different model is optional and does not itself establish correctness.

Give the verifier accepted behavior, relevant policies, changed paths, candidate identity or diff baseline, and observed checks. Ask it to derive checks and seek counterexamples. Use one focused review of a coherent candidate by default; add earlier design review for consequential irreversible choices or milestone reviews for independently risky boundaries.

Supported purposes:

- **acceptance:** check observable behavior and material failure paths;
- **review:** seek reachable defects in correctness, security, data integrity, scope, and test quality;
- **design-challenge:** challenge a consequential decision before implementation;
- **closure:** recheck named findings on the changed candidate.

Verifier inspects files and runs validation within authority, retaining large logs as artifacts. It leaves production and test files unchanged; missing or defective tests become findings for the implementation owner. Findings identify severity, affected requirement, location or reproduction, evidence, and practical consequence. Report only supported, actionable issues; record uncertain concerns as unknowns needing a decisive check.

## Failure and repair

Classify the failure before editing: production defect, test defect, environment issue, or contract/design ambiguity. Establish a causal hypothesis and the smallest decisive reproduction or diagnostic check. The implementation owner repairs within scope and reruns that check plus affected broader validation.

Compare each attempt with previous evidence. A narrowed causal chain, rejected hypothesis, changed reproduction, or newly passing requirement is progress. When attempts repeat without progress, stop varying the same fix and reassess the model or design. Use a fresh investigation when it can resolve uncertainty. Set explicit limits for costly or risky experiments; a universal repair count is not a reason to abandon useful, authorized diagnosis.

Keep valid tests intact. Changes to accepted behavior, support, destructive actions, or risk require the appropriate decision owner. Resolve findings with observed evidence; an explicitly accepted risk is reported as accepted, not fixed.

## Completion evidence

Inspect the final diff and run repository-required formatting, static checks, builds, and affected tests. Match test breadth to changed behavior and known uncertainty. After sufficient evidence, stop redundant reruns; a subsequent edit or new concern may require another check.

Report exact commands and terminal results, accepted criteria coverage, and limitations. Distinguish local structural/schema checks, actual behavioral agent runs, native host execution, and release/production acceptance. Material unresolved findings block an unqualified completion claim.
