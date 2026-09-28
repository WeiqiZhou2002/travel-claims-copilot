# Airline DP Reliability Integration Decisions

This document records how `codex/airline-dp-reliability` (including PR #11, passenger-side
causes) was ported onto `main` after PR #9. The two lines had diverged by 58 commits, so the
work was re-applied feature by feature instead of merged.

## Direction

- **Guided intake is LLM-only.** `/api/intake` and free-text `/api/analyze` extract facts only
  from schema-validated structured model output. The regex inference and the LLM/deterministic
  merge were removed. An unconfigured or failing model raises a categorized `IntakeError`
  (`not_configured`, `timeout`, `authentication`, `rate_limit`, `input_budget`,
  `invalid_output`, `upstream`) and the route returns `503`/`413` instead of guessing.
- **main's product surface stays.** The action-first UI, ActionPlan, provider-feedback loop,
  canonical claim protocol, release gates and CI from PR #4/#8/#9 are kept unchanged. The
  branch's earlier result-page components were superseded and not ported.

## Kept from the branch

- Passenger-side and other reported causes; passenger-side causes exclude involuntary
  denied-boarding compensation scripts.
- Separate ticketing provider and operating carrier on airline cases, with pair-aware ranking.
- Remedy decisions instead of generic suggested asks; synthetic examples never enter
  similar-case retrieval.
- Exact-alias normalization for structured provider fields, plus airline codes. ANA, Cathay
  Pacific and Japan Airlines were added to main's canonical provider registry (free text needs
  "All Nippon Airways" or "ANA flight", because "Ana" is also a given name).
- Safety checks over extracted facts, with the blocked narrative kept in `riskContext`.
- A process-local intake capacity guard and byte/time-bounded request bodies.
- The local DP review workspace (`/review`, `/api/review/*`) and `npm run publish:cases`.

## Compatibility decisions

- The canonical claim protocol (`processClaimTurn`, `requestedMode: "local" | "gpt"`) is
  unchanged, including its explicit local extractor. It is not the public guided-intake path.
  The canonical adapter maps `passenger_side` to `other_uncontrollable` and leaves
  `other_reported` unresolved.
- Legacy `/api/analyze` no longer accepts bare `caseId` / `issueType` selectors; the UI never
  sent them.
- A selected case remains presentation-only (main's contract); it does not rewrite the query.
- Case library: `lib/case-library.ts` merges seed cases with the validated reviewed release. The
  knowledge snapshot, `/api/analyze` and `/api/action` read it, so published DPs pass the same
  knowledge schema as seed cases.
- Canonical case comparability uses `case.carrier` for airline cases.
- The branch's `policy-freshness` badge had no consumer in main's UI and was not ported.

## Found during integration

- `main` rejected the whole knowledge snapshot once any critical source was more than 30 days
  past `last_checked`, so every runtime request returned `502` from 2026-08-18 on. Runtime
  loading now tolerates overdue sources (stale commitments are already downgraded to
  conditional); `validate:data` warns and `release:source-review` still fails until the sources
  are re-checked. **All 10 policies and the United commitment currently need a source review.**

## Testing

- Unit tests replace the deterministic-fallback suite with the LLM-only contract suite.
- Conversational evaluations run only against a live model: `npm run eval:intake`.
- Browser tests stub only the model: `tests/e2e/model-stub.ts` serves `/api/intake` through the
  real intake pipeline with canned structured output for each scripted message.
