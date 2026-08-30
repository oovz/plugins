# Verification and remediation v2

Verification is an evidence capability, not an automatic role ceremony. The main agent selects direct validation or an independent Verifier according to accepted risk and user request.

## Candidate readiness

Before independent verification, the implementation owner returns:

- candidate revision and changed files;
- requirement-to-test mapping;
- exact commands and observed results;
- known limitations and unverified behavior;
- prohibited-pattern audit;
- remaining attempt budget.

## Verifier modes

- `acceptance` derives checks independently from accepted behavior and material risk.
- `review` seeks disconfirming evidence and plausible defect paths.
- `closure` assesses named findings against the changed candidate and observed checks.
- `design-challenge` challenges consequential design decisions before implementation.

Verifier does not edit production or test files. Missing or defective tests become findings. The main agent may issue a test-only Engineer work item.

## Failure classification

Every observed failure is one of:

- **production defect** — candidate violates accepted behavior or invariant;
- **test defect** — test or fixture does not correctly represent the accepted contract;
- **environment issue** — failure is caused by unavailable or untrustworthy environment state;
- **contract or architecture ambiguity** — accepted behavior is insufficient to decide correctness.

## Repair gate

Before another production mutation, the main agent requires:

```text
Affected requirement or invariant
Decisive reproduction
Failure classification
Observed causal evidence
Rejected hypotheses with evidence
Authorized repair scope
Required focused and broader reruns
Remaining repair cycles
```

A stack trace or guess alone is not a causal chain. Use one bounded Researcher or Worker diagnostic pass when needed.

## Bounded cycle

1. Main agent classifies or commissions classification.
2. Main agent authorizes one bounded Engineer repair.
3. Engineer makes the smallest causal fix and runs immediate focused checks.
4. Main agent obtains independent or direct rerun of the decisive reproduction and affected broader checks.
5. Verifier closes prior findings when a gate exists.

Do not repeat a hypothesis without new evidence. Stop after two candidate repair cycles or two evidence-backed no-progress attempts. A claimed progress delta must narrow the causal chain, reject a material hypothesis, change the decisive reproduction, or make a previously failing accepted requirement pass.
