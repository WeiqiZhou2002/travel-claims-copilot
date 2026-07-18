# Build Week Evidence and Devpost Submission Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified product into truthful, reproducible OpenAI Build Week evidence, a rehearsed sub-three-minute demo, a human-reviewed Devpost project, and one verified final submission.

**Architecture:** Plan C produces a machine-readable artifact tied to `releaseSha`; this plan derives public documentation from that artifact and Git history rather than retyping metrics. Public copy and private eligibility/testing fields stay separate. Every external read, draft write, video publication, and final submit remains an explicit human gate.

**Tech Stack:** Git history, Node.js evidence validators, Vitest contract tests, Markdown/JSON reports, Devpost Hackathons connector when callable, public YouTube, GitHub repository, Vercel deployment.

## Global Constraints

- `releaseSha` is the last runtime/prompt/schema/model-config/production-knowledge commit qualified by Plan C. `evidenceHeadSha` is the later evidence-only HEAD. All reports name `releaseSha`; final preview computes and displays the current `evidenceHeadSha` without trying to commit that hash into itself.
- Never invent, improve, selectively omit, or manually recompute a metric. README and reports read values from `artifacts/release-evidence.json` and the versioned eval aggregate.
- Never commit or echo OpenAI, GitHub, Vercel, Devpost, or YouTube credentials; demo access code; private testing instructions; residence/adult attestations; team email/invite data; `/feedback` session ID; cookies; internal project IDs; real travel narratives; complete fact objects; or private model responses.
- MIT terms are approved, but the copyright-holder string must be explicitly supplied by the user before `LICENSE` is created.
- The user/team enters eligibility, submitter type, team acceptance, private testing instructions, and `/feedback` ID directly in Devpost. In chat, tool-visible output, repository evidence, checklists, and previews, every private eligibility/team/testing/feedback field is represented only by the literal state `confirmed` or `missing`, never by its value.
- The Devpost connector may be used only after network/external-read approval. Draft writes need separate approval. Final submit needs a new explicit confirmation on the complete current preview; earlier approvals do not count.
- After approval, the first Devpost connector call must be `get_submission_requirements`: confirm the user is registered and inventory every required custom-question ID before any project read, draft update, or submit attempt. Keep those IDs out of the repository and public preview.
- Automated submit is allowed only when the connector can preserve and pass all existing `custom_answers` opaquely without placing private values in chat, repository files, previews, or logs. Otherwise the user enters the answers and clicks Submit in the Devpost UI while Codex limits itself to preview and post-submit read-only verification. If the project is already submitted, skip every update and submit operation.
- At most one connector submit call is permitted. Never retry automatically; an ambiguous result is followed immediately by read-back and then a stop if submitted state cannot be verified.
- If the Devpost connector is unavailable or cannot perform the exact operation, stop that automation step and give the user the validated public copy/manual field checklist. Never obtain browser cookies or install an unrelated connector as a workaround.
- The video must be public, under 180 seconds, English-narrated or have an English translation, and contain only authorized assets. Codex drafts and validates the script; the user records and publishes it.
- Plan D must not modify `package.json`; it uses only the validation scripts frozen before `releaseSha`.
- Every task starts with a failing evidence assertion, runs its targeted validation plus `npm run verify`, and creates a small rollback-friendly commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `LICENSE` | User-approved MIT copyright notice and terms |
| `scripts/validate-build-week-evidence.mjs` | Cross-file, Git-history, privacy, URL, SHA, metric, and submission-copy validator |
| `tests/evidence/build-week-evidence.test.ts` | Executable public-evidence contract |
| `docs/build-week/BUILD_LOG.md` | Prior-work cutoff and dated Build Week commit map |
| `docs/build-week/EVAL_REPORT.md` | Human-readable projection of the frozen live-eval aggregate |
| `docs/build-week/VERIFICATION.md` | Deterministic gate and browser evidence |
| `docs/build-week/DEPLOYMENT.md` | Production smoke, commit, time, and rollback evidence |
| `docs/build-week/release-manifest.json` | Paths/statuses/URLs tied to one `releaseSha` |
| `docs/build-week/DEMO_SCRIPT.md` | Timed public video script |
| `docs/build-week/demo-rehearsals.json` | Three actual consecutive timed rehearsals |
| `docs/build-week/devpost-copy.md` | Human-approved public project copy only |
| `docs/build-week/submission-checklist.md` | Public/private field handling and pre-submit rules |
| `docs/build-week/submission-runbook.md` | Read-preview-confirm-submit-read-back sequence |

### Task 1: Add the Approved MIT License (WP4-04)

**Files:**
- Create after holder confirmation: `LICENSE`
- Create: `scripts/validate-build-week-evidence.mjs`
- Create: `tests/evidence/build-week-evidence.test.ts`

**Interfaces:** Produces `validateLicense()` and the repository's public license gate.

- [ ] **Step 1: Write the failing license test**

Require `LICENSE` to exist, contain the complete standard MIT grant/warranty paragraphs, name year `2026`, contain exactly one non-empty copyright-holder line, and contain no template markers. The test must compare normalized legal paragraphs, not a loose title match.

Run: `npm test -- tests/evidence/build-week-evidence.test.ts -t "requires an approved MIT license"`

Expected: FAIL because `LICENSE` is absent.

- [ ] **Step 2: Ask the user for the exact public copyright holder**

Do not infer it from GitHub username, Git author/email, Devpost account, repository owner, or team list. Stop this task until the user supplies and approves the exact person/organization string.

- [ ] **Step 3: Create and validate the license**

Use the standard MIT text verbatim with `Copyright (c) 2026` followed by the confirmed string. Run the targeted test and `npm run verify`; both must pass.

- [ ] **Step 4: Commit the license gate**

```bash
git add LICENSE scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: add approved MIT license"
```

### Task 2: Separate Prior Work from Build Week Work (WP4-01)

**Files:**
- Create: `docs/build-week/BUILD_LOG.md`
- Modify: `README.md`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`

**Interfaces:** Produces a verifiable baseline/implementation map anchored at `66082e4` and ending at the already-frozen `releaseSha`.

- [ ] **Step 1: Write the failing history assertions**

Require README and BUILD_LOG to state the cutoff `66082e4`, distinguish pre-existing capability from submission-period implementation, list every implementation commit through `releaseSha` with full SHA/date/title, and prove every SHA with `git cat-file -e`. Evidence-only commits are deliberately excluded because a tracked file cannot enumerate its own future commit. Reject claims that the pre-existing repository was created entirely during Build Week.

- [ ] **Step 2: Collect evidence from Git, not memory**

Run:

```bash
release_sha="$(node -p "require('./artifacts/release-evidence.json').releaseSha")"
git show --no-patch --format=fuller 66082e4
git log --reverse --date=iso-strict --format='%H%x09%ad%x09%s' "66082e4..$release_sha"
git diff --name-status "66082e4..$release_sha"
git diff --stat "66082e4..$release_sha"
```

Inspect pre-existing claims with `git show 66082e4:README.md`, `git show 66082e4:app/page.tsx`, and the other exact file named by the claim. Convert author dates to UTC in the renderer before writing them. BUILD_LOG's table columns are UTC date, full SHA, commit subject, evidence-backed change, verification command, and Build Week relevance.

- [ ] **Step 3: Draft and obtain a human fact check**

Write only facts supported by the commands. Show the prior/new narrative to the user before committing; revise any disputed authorship or timing claim from evidence.

- [ ] **Step 4: Validate and commit**

Run:

```bash
node scripts/validate-build-week-evidence.mjs --scope history
npm test -- tests/evidence/build-week-evidence.test.ts
npm run verify
```

```bash
git add README.md docs/build-week/BUILD_LOG.md scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: distinguish baseline and Build Week work"
```

### Task 3: Document Codex Collaboration and Human Decisions (WP4-02)

**Files:**
- Modify: `README.md`
- Modify: `docs/build-week/BUILD_LOG.md`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`

**Interfaces:** Produces evidence-linked `Codex collaboration` and `Human decisions` sections.

- [ ] **Step 1: Add failing collaboration assertions**

Require both named sections, links to actual commits/tests for every engineering claim, and an explicit split between Codex-accelerated work and human-owned product/release decisions. Reject absolute authorship claims unsupported by Git or the approved design record.

- [ ] **Step 2: Document the frozen human decisions**

Record, with spec/commit links: four public scenarios; GPT-5.6 Luna as sole default/demo model; DeepSeek compatibility only; no database/login/payment/automated filing; private values entered by people; external calls/deploy/submit require human authorization; scope may expand only after the frozen release gate.

- [ ] **Step 3: Document Codex contribution without inflating it**

Map architecture review, task decomposition, implementation commits, test/eval design, evidence drafting, and verification to real repository evidence. Mention a correction/change of direction only when the approved spec or commit history proves it; do not create drama for the narrative.

- [ ] **Step 4: Obtain user approval, validate, and commit**

Run the evidence validator, evidence test, and `npm run verify` after the user reviews the wording.

```bash
git add README.md docs/build-week/BUILD_LOG.md scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: record Codex collaboration decisions"
```

### Task 4: Document GPT-5.6 Role and Measured Results (WP4-03)

**Files:**
- Modify: `README.md`
- Create: `docs/build-week/EVAL_REPORT.md`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`
- Read as source of truth: `artifacts/release-evidence.json`

**Interfaces:** Produces the model-role, privacy, evaluation, and limitation narrative; it consumes but does not alter Plan C metrics.

- [ ] **Step 1: Fail closed if the qualifying model evidence is absent**

Tests require a passed, complete, non-selective 48-case GPT-5.6 aggregate for `releaseSha`, with `four-scenario-v1`, `claim-scorer-v1`, exact denominators, all thresholds, and no relevant runtime changes afterward. If any condition fails, stop this task and return to Plan C; do not write that evaluation passed.

- [ ] **Step 2: Add model-boundary assertions before README copy**

Require exact model `gpt-5.6-luna`, Responses API strict structured output, `store: false`, allowlisted `RawFactPatch`, deterministic server ownership of scenario/jurisdiction/controllability/applicability/remedy status, Local fallback behavior, privacy limits, and links to actual implementation/tests/report. Reject DeepSeek in the primary model story and reject any claim that GPT decides legal eligibility.

- [ ] **Step 3: Render the exact evaluation report and README metrics from machine evidence**

Create `EVAL_REPORT.md` directly from the artifact's complete aggregate: run metadata, fixed retry rule, first/final metrics, exact numerators/denominators, thresholds, fallback/refusal/injection/safety counts, and limitations. The validator compares every README/report numerator, denominator, percentage, dataset/scorer version, model, and `releaseSha` to the artifact. It rejects rounded-up or selectively omitted failure counts. Include limitations: synthetic eval set, no legal advice/guaranteed outcome, frozen jurisdictions, controlled GPT access, and source freshness dependency.

- [ ] **Step 4: Obtain user approval, validate, and commit**

Run:

```bash
node scripts/validate-build-week-evidence.mjs --scope model
npm test -- tests/evidence/build-week-evidence.test.ts
npm run verify
```

```bash
git add README.md docs/build-week/EVAL_REPORT.md scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: document GPT-5.6 role and evaluation"
```

### Task 5: Produce and Reconcile Verification Artifacts (WP4-05)

**Files:**
- Modify: `docs/build-week/EVAL_REPORT.md`
- Create: `docs/build-week/VERIFICATION.md`
- Create: `docs/build-week/DEPLOYMENT.md`
- Create: `docs/build-week/release-manifest.json`
- Modify: `docs/build-week/SOURCE_REVIEW.md`
- Modify: `docs/build-week/SECURITY_CHECK.md`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`
- Read as source of truth: `artifacts/release-evidence.json`

**Interfaces:** Produces `ReleaseManifest` and `npm run validate:evidence`.

- [ ] **Step 1: Freeze the manifest contract before report generation**

```ts
export type ReleaseManifest = {
  schemaVersion: 1;
  generatedAt: string;
  releaseSha: string;
  reports: {
    evaluation: "docs/build-week/EVAL_REPORT.md";
    verification: "docs/build-week/VERIFICATION.md";
    sourceReview: "docs/build-week/SOURCE_REVIEW.md";
    security: "docs/build-week/SECURITY_CHECK.md";
    deployment: "docs/build-week/DEPLOYMENT.md";
  };
  ci: { status: "passed"; runUrl: string };
  e2e: { status: "passed"; consecutiveRuns: 3 };
  liveEval: {
    status: "passed";
    model: "gpt-5.6-luna";
    datasetVersion: "four-scenario-v1";
    scorerVersion: "claim-scorer-v1";
  };
  deployment: {
    status: "passed";
    productionUrl: string;
    verifiedAt: string;
    rollbackSha: string;
  };
};
```

Do not create the manifest until every required real value exists; empty strings, sample URLs, inferred pass statuses, and fabricated timestamps are invalid.

- [ ] **Step 2: Write failing cross-report tests**

Require a reachable 40-character `releaseSha`; the same SHA and metrics across all reports/artifact; real HTTPS CI/production URLs; current source/security timestamps; three E2E passes; live thresholds; rollback target; and no secret-shaped value, access code, private submission value, raw narrative, complete facts, or PII. Require `releaseSha..HEAD` to contain evidence/license/docs-only paths; any relevant runtime change returns to Plan C.

- [ ] **Step 3: Generate human reports from the artifact**

Render deterministic verification, exact live-eval aggregate, source review, security/audit, and deployment/rollback sections from machine evidence. Human prose may explain a result but cannot alter its value or pass/fail state. The `validate:evidence` package script was frozen in Plan C Task 1; do not change `package.json` after `releaseSha`.

- [ ] **Step 4: Validate and commit the reconciled evidence**

Run:

```bash
npm run validate:evidence
npm test -- tests/evidence/build-week-evidence.test.ts
npm run verify
```

```bash
git add docs/build-week/EVAL_REPORT.md docs/build-week/VERIFICATION.md docs/build-week/SOURCE_REVIEW.md docs/build-week/SECURITY_CHECK.md docs/build-week/DEPLOYMENT.md docs/build-week/release-manifest.json scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: reconcile release evidence"
```

The commit is evidence-only. Capture its HEAD as a candidate `evidenceHeadSha`; later evidence-only commits replace that candidate.

### Task 6: Prepare and Rehearse the Demo (WP4-06)

**Files:**
- Create: `docs/build-week/DEMO_SCRIPT.md`
- Create after real rehearsals: `docs/build-week/demo-rehearsals.json`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`

**Interfaces:** Produces a 155-170 second script and three actual consecutive rehearsal records.

- [ ] **Step 1: Write the failing timeline and rehearsal tests**

Require the exact sequence: 0:00-0:20 problem; 0:20-1:25 Air France multi-turn; 1:25-1:50 negative case; 1:50-2:10 regulation/guidance, provider, community, user, and synthetic labels; 2:10-2:30 GPT extraction/deterministic assessment boundary; 2:30-2:45 Codex/testing/human review; 2:45-2:50 limitations/close. Require English narration or translation and authorized assets.

- [ ] **Step 2: Draft the script against the production build**

Use only states that pass production smoke/E2E. The negative example shows a safety, short-delay, weather, or forged-region boundary. Never display a secret, code, private identifier, console/environment page, real claim, or private model response.

- [ ] **Step 3: Record only actual rehearsals**

```ts
export type DemoRehearsal = {
  sequence: 1 | 2 | 3;
  rehearsedAt: string;
  durationSeconds: number;
  primaryPath: "air-france-multi-turn";
  result: "passed";
};
```

The user performs and times three consecutive runs; each must be 155-170 seconds. Create `demo-rehearsals.json` only from those observations. Codex does not record or upload local video.

- [ ] **Step 4: Validate and commit**

Run the evidence validator, evidence test, and `npm run verify`.

```bash
git add docs/build-week/DEMO_SCRIPT.md docs/build-week/demo-rehearsals.json scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: add rehearsed Build Week demo script"
```

The user then records, publishes publicly to YouTube, and supplies the public URL for Task 7.

### Task 7: Obtain Human Inputs and Prepare the Devpost Preview (WP4-07)

**Files:**
- Create after public-copy approval: `docs/build-week/devpost-copy.md`
- Create: `docs/build-week/submission-checklist.md`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`

**Interfaces:** Produces public project copy, a private-field-presence checklist, and an ephemeral `connector-safe` or `manual-ui` submission mode; it never stores private field values or Devpost question IDs in the repository.

- [ ] **Step 1: Write the failing public-copy assertions**

Require a user-approved non-`Untitled` name, tagline, English or translated description, prior/new-work disclosure, Codex/GPT roles, limitations, `Apps for Your Life`, truthful Built with list, repository/license URL, deployment URL, and public video URL. Reject guaranteed compensation, broad legal eligibility, unrestricted GPT access unless proved, or DeepSeek as core narrative.

- [ ] **Step 2: Obtain human-only fields without copying them into the repo**

The user/team supplies directly in Devpost: truthful country/residence and adult eligibility attestations, submitter type, accepted team invitations, private testing instructions/demo code, and the `/feedback` session ID from the task where most core functionality was built. Codex asks only whether each item is `confirmed` or `missing`; it never asks the user to paste a value. Preserve those exact two states in chat, connector-visible summaries, preview output, and repository evidence.

- [ ] **Step 3: Draft and approve public copy**

Generate `devpost-copy.md` only after the user provides/approves the final public name/tagline/description and public YouTube URL. `submission-checklist.md` records field rules and required presence, not private values or account identity.

- [ ] **Step 4: Discover requirements before any project operation**

Ask for network/external-read approval. If granted, make `get_submission_requirements` the first Devpost connector call. Confirm that the current user is registered for the correct event and inventory every required custom-question ID before calling `get_project`, `update_project`, or submit. Do not expose account details, answers, internal project IDs, or required question IDs in chat, logs, repository files, or the public preview. If registration is not confirmed or any required question ID is missing, stop connector automation and return a manual checklist.

Only then call `get_project` for the selected project. If its returned state is already submitted/non-draft, skip every update and submit call and proceed only with read-only verification. Treat `get_project` as a partial view: it does not return Built with, repository/deployment/license/video links, `custom_answers`, team acceptance/status, or other UI-only fields. Never infer any absent field from a successful project read.

- [ ] **Step 5: Gate and read back any draft update**

Ask separately before a draft write. Update approved public copy only if the connector documents that the update preserves existing hidden fields and can retain `custom_answers` opaquely without returning or requiring their private values in chat, logs, previews, or repository files. Otherwise set the mode to `manual-ui`, provide the field-by-field public copy, and let the user edit the Devpost page.

After any connector update, immediately call `get_project` and compare every connector-readable field actually returned with the approved copy. The user must inspect the Devpost page and confirm Built with, repository/deployment/license/video links, all required custom-answer presence, and team status because `get_project` cannot read them. Record every private field only as `confirmed` or `missing`. Connector-safe handling of all required question IDs is a prerequisite for `connector-safe` mode; otherwise use `manual-ui`.

- [ ] **Step 6: Validate, commit, and show the complete preview**

Run:

```bash
node scripts/validate-build-week-evidence.mjs --scope submission-copy
npm test -- tests/evidence/build-week-evidence.test.ts
npm run verify
```

```bash
git add docs/build-week/devpost-copy.md docs/build-week/submission-checklist.md scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: prepare human-reviewed Devpost copy"
```

Preview public values in full; display every private eligibility/team/testing/feedback field only as `confirmed` or `missing`. Label which public fields were connector-read-back and which UI-only fields still require the user's page inspection.

### Task 8: Validate, Submit Once, and Read Back Status (WP4-08)

**Files:**
- Create: `docs/build-week/submission-runbook.md`
- Modify: `scripts/validate-build-week-evidence.mjs`
- Modify: `tests/evidence/build-week-evidence.test.ts`

**Interfaces:** Produces a one-submit/read-back protocol. The external receipt stays in the private task, not the repository.

- [ ] **Step 1: Write the failing runbook test**

Require this exact order: prove Task 7 confirmed registration and inventoried all required custom-question IDs; fetch the latest project and skip submission if it is already submitted; compute and whitelist-diff `evidenceHeadSha`; verify the public production/repository/LICENSE/YouTube URLs and YouTube duration with separate authorization or record the user's manual verification; compare connector-readable fields; obtain the user's page verification for UI-only fields; verify private required fields only as `confirmed` or `missing`; show the complete preview; obtain new explicit user confirmation; execute either one connector submit call or the `manual-ui` branch; perform read-back without any automatic retry; confirm submitted/non-draft state and parseable non-null `submitted_at`; report public URL/status/time without committing the private receipt.

- [ ] **Step 2: Create and validate the runbook**

The final preview must show: project name, tagline, description, category `Apps for Your Life`, Built with, repository and MIT license, production URL, public YouTube URL and duration below 180 seconds, `releaseSha`, current `evidenceHeadSha`, and pass state for CI/E2E/live eval/source/security/deployment. Label each connector-readable value with its latest read-back status and each UI-only public value with the user's page-verification status. Team/eligibility/submitter/private testing/feedback fields show only `confirmed` or `missing`; no preview or receipt may contain their values.

Run:

```bash
node scripts/validate-build-week-evidence.mjs --scope submission-runbook
npm test -- tests/evidence/build-week-evidence.test.ts
npm run verify
```

```bash
git add docs/build-week/submission-runbook.md scripts/validate-build-week-evidence.mjs tests/evidence/build-week-evidence.test.ts
git commit -m "docs: add final Devpost submission runbook"
```

- [ ] **Step 3: Refresh project state and branch if already submitted**

Using the approved read-only connector access from Task 7, call `get_project` immediately before final-preview preparation. Read back only fields actually returned. If the project is already submitted/non-draft, skip the final-confirmation and submit steps, perform the read-only status/timestamp verification in Step 8, and do not mutate the project. For a draft, retain the Task 7 `connector-safe` or `manual-ui` mode; never promote `manual-ui` based on assumptions about fields absent from `get_project`.

- [ ] **Step 4: Recompute and whitelist evidence-only ancestry**

Run exactly:

```bash
release_sha="$(node -p 'require("./artifacts/release-evidence.json").releaseSha')"
evidence_head_sha="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$release_sha" "$evidence_head_sha"
git diff --name-only "$release_sha..$evidence_head_sha"
```

The submission-runbook validator must fail unless every path in that exact diff is `artifacts/release-evidence.json`, `LICENSE`, `README.md`, under `docs/build-week/`, or one of `scripts/validate-build-week-evidence.mjs` and `tests/evidence/build-week-evidence.test.ts`. `package.json` is never on the whitelist and must not be modified. If any runtime, prompt, schema, model-config, production-knowledge, or other non-whitelisted file changed, return to Plan C and requalify.

- [ ] **Step 5: Verify public URLs before constructing the final preview**

Obtain a separate network/external-read authorization for the exact public production, repository, repository `LICENSE`, and YouTube URLs; this approval is distinct from Devpost read/write/submit approvals. With approval, verify that every URL is anonymously reachable, the YouTube video is public, and its authoritative duration is strictly less than 180 seconds. If a check is not authorized or cannot be performed, do not claim an automated pass: ask the user to open that exact URL, verify reachability (and the YouTube duration), and record the check as user-verified in the private pre-submit record.

- [ ] **Step 6: Reconcile UI-only fields and show the complete preview**

Compare only connector-readable fields against the latest `get_project` response. Because `get_project` does not return Built with, links, `custom_answers`, or team status, require the user to inspect those fields on the Devpost page. Show public values in full with their verification source; show every private eligibility/team/testing/feedback field only as `confirmed` or `missing`. Stop while any required field or URL check is `missing`.

- [ ] **Step 7: Obtain a new final confirmation**

Show the complete current preview and ask the user to explicitly approve submitting that exact version now. Design/spec/plan/draft approvals from earlier turns do not authorize this operation. If the latest `get_project` read now reports an already-submitted project, skip the submit call instead of seeking permission to resubmit.

- [ ] **Step 8: Submit at most once, or use the manual UI, then read back**

For the already-submitted branch from Step 3, make no write or submit call; perform only the authorized `get_project` status/timestamp read-back below.

In `connector-safe` mode only, call the connector submit operation at most once after the new confirmation. Never retry automatically. Whether the response is success, failure, timeout, or ambiguous, immediately call `get_project` before drawing a conclusion; an ambiguous or unverified result ends the automated flow without a second submit call.

In `manual-ui` mode, Codex never calls submit and never receives private values. The user completes all required answers and clicks Submit in the Devpost UI; after the user reports that click completed, Codex performs only the authorized read-only `get_project` verification. In either mode, success requires explicit submitted/non-draft state and `submitted_at` that is non-null and parseable by `Date.parse`. If either is missing, report that submission is not verified and stop.

- [ ] **Step 9: Report the public receipt privately**

Return public project URL, submitted state, and submission time to the user. Do not add the receipt, private project identifier, eligibility data, feedback ID, code, or private instructions to Git.

## Values That Must Never Enter the Repository

- API keys, access tokens, cookies, private keys, passwords, environment values, demo access code, or private testing instructions.
- Country/residence/adult eligibility values, identity proof, submitter private details, team email/invitation data, `/feedback` session ID, or Devpost internal project identifiers.
- Raw travel narratives, complete facts, user PII, private model prompts/responses, or non-public preview URLs.

Final project name, tagline, description, public repository URL, production URL, YouTube URL, and Devpost URL may enter public evidence only after the user approves them as public.

## Plan D Completion Gate

- [ ] MIT holder string was explicitly confirmed; repository license validation passes.
- [ ] README/BUILD_LOG accurately separate `66082e4` prior work from submission-period commits and have user fact-check approval.
- [ ] Codex/human/model narratives link to real commits/tests and exactly match release evidence.
- [ ] All reports and manifest name one qualified `releaseSha`; runtime diff after that SHA is empty.
- [ ] Demo has three actual consecutive 155-170 second rehearsals; public YouTube is below 180 seconds and has English narration/translation.
- [ ] Devpost public copy is user-approved; all private required fields are confirmed by presence without repository disclosure.
- [ ] Devpost requirements were read first; registration and every required custom-question ID were confirmed before project operations.
- [ ] Connector-readable fields were read back after any update; Built with, links, custom-answer presence, and team status were verified by the user on the Devpost page.
- [ ] Public production, repository, LICENSE, and YouTube reachability plus YouTube duration below 180 seconds were separately authorized and checked, or each manual user verification was recorded.
- [ ] Current preview shows `releaseSha`, computed `evidenceHeadSha`, and all release gates.
- [ ] `package.json` is unchanged and the `release_sha..evidence_head_sha` diff contains only the explicit evidence whitelist.
- [ ] The user gives a new explicit final-submit confirmation unless the project was already submitted; automated mode makes at most one submit call, manual mode leaves the click to the user, and both modes are followed by read-back with no automatic retry.
- [ ] Devpost reports submitted/non-draft and parseable non-null `submitted_at`.
- [ ] `npm run validate:evidence`, `npm run verify`, and `git status --short` all pass/are clean.
