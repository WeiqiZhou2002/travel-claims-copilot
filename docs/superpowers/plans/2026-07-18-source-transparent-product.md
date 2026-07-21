# Source-Transparent Product Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic legacy result page with a revision-safe four-scenario workspace that exposes facts, remedy conditions, source provenance, actual model/fallback state, privacy consent, and session-only feedback.

**Architecture:** A server-side view-model mapper separates domain internals from presentation. A pure client reducer plus one hook owns message submission, fact correction, request cancellation, and stale-response rejection; focused components under `src/components` render the resulting contract without implementing eligibility logic.

**Tech Stack:** React 19, Next.js App Router, TypeScript, Tailwind CSS, Vitest, Playwright Chromium.

## Global Constraints

- Prerequisites: Plan C Tasks 1-6 plus all Plan A tasks are complete and green. In particular, outbound redaction/allowlisting in Plan C Task 3 precedes public OpenAI handler selection; Plan B never exposes an unredacted GPT path.
- `app/page.tsx` ends as a thin render entry; do not put domain rules back into React components.
- Components live in `src/components`, hooks in `src/hooks`, client-only utilities in `src/lib`, and new files use kebab-case.
- The UI may edit raw facts only. Region, carrier region, controllability, legal regimes, policy applicability, and scenario IDs are visibly server-derived and read-only.
- Empty text is not a clear operation; explicit clear uses `UserFactEdit.clear`. Preserve valid `0` and `false` values.
- Abort the previous request and reject stale request tokens plus stale echoed base revisions.
- Show the actual extraction state, never the requested mode: `OpenAI · gpt-5.6-luna`, `Local fallback`, `Local`, or `Not run` for a preflight-blocked request.
- Access code remains React memory only and is sent only in `x-demo-access-code`; never place it in URL, JSON body, storage, analytics, feedback, or logs.
- Synthetic status is textual and adjacent to title/outcome, not color-only. A missing source URL never renders a broken link.
- Feedback accepts only `helpful`, `fact_error`, or `source_mismatch`, has no free-text field, stays session-local unless explicitly downloaded, and never calls a feedback API.
- Every result repeats the informational/not-legal-advice boundary and never promises compensation.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/analysis-view-model.ts` | Source/fact/remedy presentation types and pure server mapper |
| `lib/feedback.ts` | Privacy-safe feedback records and deterministic serialization |
| `src/lib/analysis-api-client.ts` | Fetch wrapper, safe error parsing, access-code header |
| `src/lib/claim-workflow.ts` | Pure workflow state/reducer and stale-response rules |
| `src/hooks/use-claim-analysis.ts` | Abort controller, request token, revision, mode, privacy, and in-memory code |
| `src/components/claim-workspace.tsx` | Page composition and focus targets |
| `src/components/intake-panel.tsx` | Transcript, prompt, input, and dedicated live status |
| `src/components/fact-review-panel.tsx` | Editable raw facts, explicit clear, conflicts, confirmation |
| `src/components/analysis-overview.tsx` | Status, scenarios, facts used, cautions, and one next action |
| `src/components/remedy-assessment-list.tsx` | Remedy status, conditions, evidence, and linked request options |
| `src/components/source-sections.tsx` | Official/provider/case sections and source badges |
| `src/components/model-privacy-controls.tsx` | Local/GPT mode, consent, access code, actual provider badge |
| `src/components/script-list.tsx` | Policy-grounded scripts, in-page source citations, and resilient copy state |
| `src/components/feedback-panel.tsx` | Three fixed feedback actions and explicit download |
| `tests/e2e/helpers/mock-analyze.ts` | Ordered/delayed analyze mocks and request assertions |
| `tests/e2e/helpers/claim-driver.ts` | Accessible UI journey driver |
| `tests/fixtures/analyze-transport.ts` | Typed public response/error fixtures |
| `tests/fixtures/analysis-view-model.ts` | Typed complete view-model fixtures |

## Frozen Product Contracts

Task 1 adds these types before any component work. All fixtures use `satisfies`; type assertions cannot hide missing response fields.

```ts
export type AnalysisPresentationInput = {
  assessment: AssessmentResult;
  context: ResolvedClaimContext | null;
  claimState: ClaimState;
};

export type FactDisplayViewModel = {
  path: RawFactPath;
  label: string;
  value: RawFactValue | null;
  provenance: FactProvenance | null;
};

export type FactsUsedViewModel = FactDisplayViewModel[];

export type MissingFactViewModel = {
  path: RawFactPath;
  label: string;
  reason: string;
  material: boolean;
  scenarioIds: ScenarioId[];
};

export type FactConflictViewModel = {
  path: RawFactPath;
  label: string;
  candidates: Array<{ value: RawFactValue; source: "deterministic_extraction" | "openai_extraction" }>;
};

export type DerivedValueViewModel<T> = {
  value: T;
  source: ResolvedValue<T>["source"];
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type ConditionViewModel = {
  id: string;
  label: string;
  factPaths: RawFactPath[];
};

export type PolicyApplicabilityViewModel = {
  policyId: string;
  title: string;
  status: PolicyApplicability["status"];
  applicableCarrier: string | null;
  matchedConditions: string[];
  missingConditions: string[];
  exclusions: string[];
};

export type RequestOptionViewModel = {
  tone: "conservative" | "standard" | "assertive";
  remedyId: RemedyId;
  remedyStatus: RemedyStatus;
  text: string;
  sourceIds: string[];
};

export type RemedyAssessmentViewModel = {
  remedyId: RemedyId;
  title: string;
  status: RemedyStatus;
  matchedConditions: ConditionViewModel[];
  missingConditions: ConditionViewModel[];
  exclusions: ConditionViewModel[];
  evidence: RemedyAssessment["evidence"];
  requestOptions: RequestOptionViewModel[];
  cautions: string[];
};

export type ScriptViewModel = {
  id: string;
  title: string;
  channel: string;
  language: string;
  text: string;
  sourceIds: string[];
  rankingReasons: string[];
};

export type NextActionViewModel = { title: string; detail: string };
export type NextActions = [] | [NextActionViewModel];

export type AnalysisViewModel = {
  status: WorkflowStatus;
  primaryScenario: ScenarioId | null;
  scenarioIds: ScenarioId[];
  factsRevision: number;
  factsUsed: FactsUsedViewModel;
  missingFacts: MissingFactViewModel[];
  factReview: {
    facts: RawClaimFacts;
    provenance: Partial<Record<RawFactPath, FactProvenance>>;
    conflicts: FactConflictViewModel[];
    unresolvedFields: RawFactPath[];
  } | null;
  derivedContext: {
    normalizedProvider: DerivedValueViewModel<string | null>;
    normalizedOperatingCarrier: DerivedValueViewModel<string | null>;
    originRegion: DerivedValueViewModel<PolicyRouteRegion | null>;
    destinationRegion: DerivedValueViewModel<PolicyRouteRegion | null>;
    operatingCarrierRegion: DerivedValueViewModel<PolicyRouteRegion | null>;
    eu261: DerivedValueViewModel<DerivedApplicability>;
    uk261: DerivedValueViewModel<DerivedApplicability>;
    controllability: DerivedValueViewModel<"controllable" | "uncontrollable" | "unknown">;
    legalRegimes: LegalRegime[];
  } | null;
  policyApplicability: PolicyApplicabilityViewModel[];
  extraction: ExtractionMetadata;
  summary: string;
  assessments: RemedyAssessmentViewModel[];
  officialSources: PolicySourceViewModel[];
  providerCommitments: PolicySourceViewModel[];
  similarCases: CaseSourceViewModel[];
  scripts: ScriptViewModel[];
  evidenceStatus: "complete" | "partial" | "missing";
  nextActions: NextActions;
  cautions: string[];
  disclaimer: "Informational guidance only — not legal advice or a promise of compensation.";
};

export type AnalyzeClaimResponse = {
  baseRevision: number;
  claimState: ClaimState;
  result: AnalysisViewModel;
};
```

Public response parsers enforce `baseRevision === request.baseRevision`, `claimState.revision === result.factsRevision`, and a legal one-turn transition. A message response revision is exactly `baseRevision` or `baseRevision + 1`; an effective correction-only response is exactly `baseRevision + 1`. Lower revisions and jumps are rejected. Parsers also enforce allowlisted raw facts only and no derived field inside `claimState.facts`.

The fixture modules export these exact builders, each returning a fresh object with all required fields:

```ts
// tests/fixtures/analysis-view-model.ts
export function presentationFixture(): AnalysisPresentationInput;
export function sourceTransparencyFixture(): AnalyzeClaimResponse;
export function syntheticOnlyFixture(): AnalyzeClaimResponse;
export function euCancellationFixture(): AnalyzeClaimResponse;

// tests/fixtures/analyze-transport.ts
export function analyzeResponseFixture(
  overrides?: DeepPartial<AnalyzeClaimResponse>
): AnalyzeClaimResponse;
export function okAnalyzeResponse(
  overrides?: DeepPartial<AnalyzeClaimResponse>
): Response;
export function localRequest(
  overrides?: Partial<AnalyzeClaimRequest>
): AnalyzeClaimRequest;
```

`sourceTransparencyFixture()` contains all six public source labels, `syntheticOnlyFixture()` contains one synthetic card with no URL, and `euCancellationFixture()` contains matched/missing/excluded conditions plus exactly one next action. `DeepPartial` follows the non-mutating definition from Plan A fixtures.
Every fixture `ClaimState` includes fresh `conflicts` and `unresolvedFields` arrays. Blocked/out-of-scope fixtures set `context: null`, `factReview: null`, and `derivedContext: null` and contain no ordinary assessment, source, script, or request-option cards.

### Task 1: Build the Source-Aware Analysis View Model (WP2-01)

**Files:**
- Create: `lib/analysis-view-model.ts`
- Create: `tests/analysis-view-model.test.ts`
- Create: `tests/fixtures/analysis-view-model.ts`
- Create: `tests/fixtures/analyze-transport.ts`
- Modify: `lib/claim-workflow.ts`
- Modify: `lib/api/analyze-contract.ts`
- Modify: `app/api/analyze/route.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: Plan A `ResolvedClaimContext`, `RemedyAssessment`, and `RetrievalTrace`.
- Produces: the complete frozen view-model types, `PolicySourceViewModel`, `CaseSourceViewModel`, `buildAnalysisViewModel()`, and public `AnalyzeClaimResponse`.

- [ ] **Step 1: Write a failing mapper contract test**

```ts
it("preserves source provenance while hiding internal scores", () => {
  const view = buildAnalysisViewModel(presentationFixture());
  expect(view.officialSources[0]).toMatchObject({
    category: "government_regulation",
    authority: "high",
    conditions: expect.any(Array),
    lastChecked: "2026-07-16"
  });
  expect(view.providerCommitments[0]).toMatchObject({
    category: "provider_commitment",
    applicableCarrier: "United"
  });
  expect(view.similarCases.map(({ category }) => category)).toContain("synthetic_example");
  expect(JSON.stringify(view)).not.toContain('"score"');
});
```

Add assertions for facts used/provenance, missing-fact reason, review notes, source URL, outcome completeness, extraction metadata, summary, single next action, and fixed disclaimer copy.
Assert `policyApplicability` contains every complete applicability entry even when `displayedPolicies` is Top-K limited, preserves `applicable`/`conditional`/`not_applicable`, and contains no numeric score.
Add a displayed script whose validated `source_ids` names one applicable policy omitted from `displayedPolicies` by Top-K. Assert `ScriptViewModel.sourceIds` is that exact non-empty array, the omitted policy is promoted into the corresponding source-card collection with no invented ranking score, and every script source ID resolves to exactly one returned source card. Add malformed-domain rows for empty, duplicate, unknown, and not-applicable script policy IDs; each must throw `invalid_script_source_reference` rather than emitting an ungrounded script.
Add JFK→CDG with known-active US plus unresolved EU/UK because carrier region is unknown. Assert the `operatingCarrier` missing-fact view model has `material: true`, `scenarioIds: ["eu_uk_air_disruption"]`, and an admission-specific reason even when public `assessment.scenarioIds` and remedies are empty.
Add a malicious blocked-domain fixture with `context: null` but one populated fact, assessment, policy applicability, displayed source, case, script, or next action (one table row per collection). `buildAnalysisViewModel()` must throw `invalid_blocked_analysis_payload` for every row before invoking any mapper; a valid blocked fixture returns explicit empty ordinary collections and null fact/derived panels.

- [ ] **Step 2: Run the mapper test and verify it fails**

Run: `npm test -- tests/analysis-view-model.test.ts`

Expected: FAIL because the canonical mapper and grouped source fields do not exist.

- [ ] **Step 3: Define exact presentation contracts**

```ts
export type PolicySourceViewModel = {
  id: string;
  title: string;
  category: "government_regulation" | "regulator_guidance" | "provider_commitment";
  sourceType: Policy["source_type"];
  provider: string;
  legalRegime: string;
  authority: "high" | "medium" | "low";
  conditions: string[];
  rights: string[];
  lastChecked: string;
  url: string;
  applicableCarrier: string | null;
  commitmentId: string | null;
  rankingReasons: string[];
};

export type CaseSourceViewModel = {
  id: string;
  title: string;
  category: "community_report" | "user_report" | "synthetic_example";
  sourceName: string;
  url: string | null;
  reviewStatus: "approved";
  reviewNotes: string[];
  facts: string;
  outcome: string;
  outcomeComplete: boolean;
  reusableLesson: string;
  rankingReasons: string[];
};

export function buildAnalysisViewModel(input: AnalysisPresentationInput): AnalysisViewModel;
```

- [ ] **Step 4: Implement pure source grouping and mapping**

```ts
function policyCategory(
  policy: Policy,
  applicability: PolicyApplicability
): PolicySourceViewModel["category"] {
  if (policy.legal_regime === "provider_policy" && applicability.applicableCarrier !== null) {
    return "provider_commitment";
  }
  return policy.source_type === "government_regulation"
    ? "government_regulation"
    : "regulator_guidance";
}

function caseCategory(item: Case): CaseSourceViewModel["category"] {
  if (item.source_type === "community_dp") return "community_report";
  if (item.source_type === "user_submitted") return "user_report";
  return "synthetic_example";
}

export function buildAnalysisViewModel(input: AnalysisPresentationInput): AnalysisViewModel {
  const blocked = ["out_of_scope", "unsupported_high_risk"].includes(input.assessment.status);
  if (blocked) {
    if (input.context !== null) throw new Error("blocked_context_must_be_null");
    assertBlockedAssessment(input.assessment);
    return {
      status: input.assessment.status,
      primaryScenario: null,
      scenarioIds: [],
      factsRevision: input.assessment.factsRevision,
      factsUsed: [],
      missingFacts: [],
      factReview: null,
      derivedContext: null,
      policyApplicability: [],
      extraction: input.assessment.extraction,
      summary: buildSummary(input),
      assessments: [],
      officialSources: [],
      providerCommitments: [],
      similarCases: [],
      scripts: [],
      evidenceStatus: "missing",
      nextActions: [],
      cautions: [...input.assessment.cautions],
      disclaimer: "Informational guidance only — not legal advice or a promise of compensation."
    };
  }
  if (input.context === null) throw new Error("analysis_context_required");
  const displayedPolicySources = input.assessment.retrieval.displayedPolicies.map((ranked) =>
    mapPolicySource(
      ranked.item,
      findApplicability(input.assessment.retrieval.policyApplicability, ranked.item.policy_id),
      ranked.reasons
    )
  );
  const policySources = addScriptPolicySources(input.assessment, displayedPolicySources);
  const commitments = dedupeSources([
    ...policySources.filter(({ category }) => category === "provider_commitment"),
    ...mapProviderCommitments(input.assessment)
  ]);
  return {
    status: input.assessment.status,
    primaryScenario: input.assessment.primaryScenario,
    scenarioIds: [...input.assessment.scenarioIds],
    factsRevision: input.assessment.factsRevision,
    factsUsed: mapFacts(input.assessment.factsUsed),
    missingFacts: mapMissingFacts(input),
    factReview: mapFactReview(input.claimState),
    derivedContext: mapDerivedContext(input.context, input.assessment.legalRegimes),
    policyApplicability: input.assessment.retrieval.policyApplicability.map(mapPolicyApplicability),
    extraction: input.assessment.extraction,
    summary: buildSummary(input),
    assessments: input.assessment.assessments.map(mapRemedy),
    officialSources: policySources.filter(({ category }) => category !== "provider_commitment"),
    providerCommitments: commitments,
    similarCases: input.assessment.retrieval.displayedCases.map(mapCaseSource),
    scripts: input.assessment.retrieval.displayedScripts.map(mapScript),
    evidenceStatus: aggregateEvidence(input.assessment.assessments),
    nextActions: firstNextAction(input.assessment.nextActions),
    cautions: uniqueCautions(input.assessment.cautions, input.assessment.assessments),
    disclaimer: "Informational guidance only — not legal advice or a promise of compensation."
  };
}
```

Implement these exact mapper signatures:

```ts
function mapPolicySource(
  policy: Policy,
  applicability: PolicyApplicability,
  rankingReasons: readonly RetrievalMatchReason[]
): PolicySourceViewModel;
function assertBlockedAssessment(assessment: AssessmentResult): void;
function findApplicability(
  items: readonly PolicyApplicability[],
  policyId: string
): PolicyApplicability;
function mapProviderCommitments(
  assessment: AssessmentResult
): PolicySourceViewModel[];
function dedupeSources(items: readonly PolicySourceViewModel[]): PolicySourceViewModel[];
function addScriptPolicySources(
  assessment: AssessmentResult,
  policySources: readonly PolicySourceViewModel[]
): PolicySourceViewModel[];
function mapCaseSource(ranked: RankedDisplayItem<Case>): CaseSourceViewModel;
function mapScript(ranked: RankedDisplayItem<Script>): ScriptViewModel;
function mapFacts(items: readonly FactDisplayItem[]): FactsUsedViewModel;
function mapMissingFacts(input: AnalysisPresentationInput): MissingFactViewModel[];
function mapFactReview(state: ClaimState): Exclude<AnalysisViewModel["factReview"], null>;
function mapPolicyApplicability(item: PolicyApplicability): PolicyApplicabilityViewModel;
function mapDerivedContext(
  context: ResolvedClaimContext,
  legalRegimes: readonly LegalRegime[]
): Exclude<AnalysisViewModel["derivedContext"], null>;
function mapRemedy(item: RemedyAssessment): RemedyAssessmentViewModel;
function buildSummary(input: AnalysisPresentationInput): string;
function aggregateEvidence(items: readonly RemedyAssessment[]): "complete" | "partial" | "missing";
function firstNextAction(items: readonly string[]): NextActions;
function uniqueCautions(topLevel: readonly string[], items: readonly RemedyAssessment[]): string[];
```

Implement the carrier evidence mapper directly from the frozen domain subset:

```ts
function mapProviderCommitments(assessment: AssessmentResult): PolicySourceViewModel[] {
  return assessment.assessments.flatMap((remedy) => {
    const evidence = remedy.providerCommitment;
    if (!evidence) return [];
    return [{
      id: evidence.commitmentId,
      title: evidence.sourceTitle,
      category: "provider_commitment",
      sourceType: evidence.sourceType,
      provider: evidence.sourceProvider,
      legalRegime: evidence.legalRegime,
      authority: evidence.authority,
      conditions: [...evidence.conditions],
      rights: [...evidence.rights],
      lastChecked: evidence.sourceLastChecked,
      url: evidence.sourceUrl,
      applicableCarrier: evidence.normalizedCarrier,
      commitmentId: evidence.commitmentId,
      rankingReasons: [`Matched ${evidence.applicableCarrierRole}`]
    }];
  });
}
```

`findApplicability()` returns the single same-ID entry or throws an internal mapping error for zero/duplicates; it never substitutes a similarly named policy. `mapFacts()` iterates only `AssessmentResult.factsUsed`; it never serializes the whole claim, expenses, evidence, or goal as “facts used”. `mapMissingFacts()` returns `[]` immediately when `context` is null; otherwise it unions, in stable `RAW_FACT_PATHS` order, `AssessmentResult.missingFacts`, `claimState.unresolvedFields`, remedy missing-condition paths, and every unresolved `context.scenarios.decisions[].missingFacts`. A path is material when it blocks either parallel-scenario admission or a material remedy. Its `ScenarioId[]` is the deduplicated stable union of unresolved admission decision IDs followed by the `scenarioId` of each affected remedy. Reason priority is extractor conflict, parallel-scenario admission, then remedy condition, then ordinary missing assessment fact; it never infers a scenario from the public empty `scenarioIds` array. `mapFactReview()` deep-copies allowlisted raw facts/provenance and the conflict arrays carried inside `ClaimState`. `mapDerivedContext()` copies normalized provider, normalized operating carrier, origin/destination/operating-carrier regions, EU261/UK261 applicability, controllability, and the complete `AssessmentResult.legalRegimes`; all are read-only. `mapPolicyApplicability()` copies every complete-list entry's policy ID/title, status, applicable carrier, matched/missing/exclusion strings, preserves repository order, and exposes no rank score. `aggregateEvidence()` returns missing when every material remedy is missing, complete when every material remedy is complete, otherwise partial. `firstNextAction()` returns `[]` or one parsed `{ title, detail }`, never more. `buildSummary()` has one fixed informational sentence per workflow status and adds no eligibility rule.

`mapScript()` copies `ranked.item.source_ids` byte-for-byte into `sourceIds`, discards the numeric score, and rejects empty or duplicate IDs. `addScriptPolicySources()` gathers IDs from every displayed script, resolves each against the complete `policyApplicability` list by exact `policy_id`, rejects zero/duplicate matches and `not_applicable` matches, and promotes a cited policy omitted by Top-K into the same policy-card mapper with an empty `rankingReasons` list. It then deduplicates with the displayed policy cards. After provider/official grouping, every script source ID must occur exactly once across `officialSources` plus `providerCommitments`; otherwise mapping throws `invalid_script_source_reference`. No title, URL, source ID, or applicability is inferred from script text.

`assertBlockedAssessment()` throws `invalid_blocked_analysis_payload` unless `primaryScenario` is null and `scenarioIds`, `factsUsed`, `missingFacts`, `legalRegimes`, `assessments`, `nextActions`, and all four retrieval arrays are empty. It runs before policy, commitment, fact, case, script, evidence, or next-action mapping. `buildSummary()` for a blocked status reads only that status and fixed caution copy, never `claimState` or context.

`mapPolicySource()` receives no numeric score. It copies the supplied retrieval reasons as human strings; a script-promoted policy passes an empty reason list rather than an invented ranking result. An applicable Marriott/provider policy with a named carrier is a provider commitment; an umbrella US DOT dashboard remains regulator guidance. `mapProviderCommitments()` reads only each remedy's non-null `ProviderCommitmentEvidence` and copies its exact `commitmentId`, carrier/role, source title/provider/URL/type, legal regime, authority, review date, display conditions, and rights. It never joins to a policy by URL or fills missing carrier fields from an umbrella source. Duplicate commitment IDs with unequal evidence are mapping errors. `dedupeSources()` uses `category:id:commitmentId` and preserves first order. An umbrella DOT policy without the exact carrier record cannot produce a provider card.

- [ ] **Step 5: Route only the view model**

Keep `processClaimTurn()` returning `AnalyzeClaimDomainResponse`. The handler builds `AnalysisPresentationInput` from its `result`, nullable `context`, and complete `claimState`, then returns `{ baseRevision, claimState, result: buildAnalysisViewModel(...) }`. Contract tests prove request/response base revisions match and `claimState.revision === result.factsRevision`. For `out_of_scope`/`unsupported_high_risk`, the mapper never reads context/scenarios or raw claim review state and returns null fact/derived panels plus empty ordinary analysis collections.

In the same step, update only the page-local compatibility mapper in `app/page.tsx` to consume `AnalyzeClaimResponse.result`; it may project the new view model into the existing temporary layout but cannot recover `strength` or make domain decisions. Add a compile/route fixture proving the current page still renders after the API shape changes. Task 2 deletes this adapter while replacing the page with `ClaimWorkspace`.

- [ ] **Step 6: Run mapper, API, and full verification**

Run: `npm test -- tests/analysis-view-model.test.ts tests/api/public-scope.test.ts && npm run verify`

Expected: PASS; canonical API JSON has grouped sources and no numeric retrieval score or `strength`.

- [ ] **Step 7: Commit the view model**

```bash
git add lib/analysis-view-model.ts lib/claim-workflow.ts lib/api/analyze-contract.ts app/api/analyze/route.ts app/page.tsx tests/analysis-view-model.test.ts tests/fixtures/analysis-view-model.ts tests/fixtures/analyze-transport.ts
git commit -m "feat: map claims to a source-aware view"
```

### Task 2: Render Distinct Source Sections (WP2-02)

**Files:**
- Create: `src/components/source-sections.tsx`
- Create: `src/components/claim-workspace.tsx`
- Create: `tests/e2e/source-transparency.spec.ts`
- Create: `tests/e2e/helpers/mock-analyze.ts`
- Create: `tests/e2e/helpers/claim-driver.ts`
- Modify: `app/page.tsx:1-599`
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `PolicySourceViewModel[]`, `CaseSourceViewModel[]` from Task 1.
- Produces: `SourceSections`, `SourceBadge`, `ClaimWorkspace`.

Freeze the shared browser helper interface before the first spec:

```ts
export type MockAnalyzeStep = {
  response: AnalyzeClaimResponse;
  delayMs?: number;
  assertRequest?: (request: AnalyzeClaimRequest) => void | Promise<void>;
};

export function mockAnalysis(
  page: Page,
  responses: AnalyzeClaimResponse | readonly MockAnalyzeStep[]
): Promise<void>;

export function runReadyClaim(page: Page, message?: string): Promise<void>;
```

`mockAnalysis()` wraps a single response as one step, intercepts only `/api/analyze`, parses and runtime-validates the request before invoking the step callback, applies the bounded non-negative delay, and throws on an unexpected extra call. `runReadyClaim()` defaults to a fixed anonymous cancellation message, fills the stable `claim-message` control, submits, waits for `analysis-result`, and asserts `aria-busy=false`.

- [ ] **Step 1: Write a failing browser source-label test**

```ts
test("labels every source class and preserves provenance", async ({ page }) => {
  await mockAnalysis(page, sourceTransparencyFixture());
  await page.goto("/");
  await runReadyClaim(page);
  for (const label of [
    "Government regulation",
    "Regulatory guidance",
    "Provider commitment",
    "Community report",
    "User report",
    "Synthetic example"
  ]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("Last checked")).toBeVisible();
  await expect(page.getByText("Applicable conditions")).toBeVisible();
});
```

- [ ] **Step 2: Run the browser test and verify old generic cards fail**

Run: `npm run test:e2e -- tests/e2e/source-transparency.spec.ts --project=chromium`

Expected: FAIL because `app/page.tsx` has only generic “Official basis” and “Similar cases” cards.

- [ ] **Step 3: Delete the page adapter and add textual badges and accessible source cards**

Replace the Task 1 page-local compatibility mapper with `ClaimWorkspace`; do not leave a second legacy projection path in `app/page.tsx`.

```tsx
export function SourceBadge({ category }: { category: PolicySourceViewModel["category"] | CaseSourceViewModel["category"] }) {
  const label = SOURCE_LABELS[category];
  return <span className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-semibold">{label}</span>;
}

function PolicyCard({ source }: { source: PolicySourceViewModel }) {
  const headingId = `policy-source-${source.id}`;
  return (
    <article aria-labelledby={headingId} className="rounded-xl border border-ink/10 bg-white p-5">
      <SourceBadge category={source.category} />
      <h3 id={headingId} className="mt-3 text-lg font-semibold">{source.title}</h3>
      <p>{source.provider} · {source.legalRegime.replaceAll("_", " ")}</p>
      <p>Authority: {source.authority}</p>
      <time dateTime={source.lastChecked}>Last checked {source.lastChecked}</time>
      <h4 className="mt-4 font-semibold">Applicable conditions</h4>
      {source.conditions.length > 0
        ? <ul>{source.conditions.map((item) => <li key={item}>{item}</li>)}</ul>
        : <p>None identified</p>}
      <a href={source.url} rel="noopener noreferrer" target="_blank">Open {source.title} source</a>
    </article>
  );
}
```

Case cards show source name, review notes, outcome completeness, ranking reasons, and an external link only when `url` is non-null.

- [ ] **Step 4: Split the page and update Tailwind scanning**

Add `./src/**/*.{js,ts,jsx,tsx,mdx}` to `tailwind.config.ts`. Replace `app/page.tsx` with:

```tsx
import { ClaimWorkspace } from "../src/components/claim-workspace";

export default function HomePage() {
  return <ClaimWorkspace />;
}
```

At this task, `ClaimWorkspace` may retain the existing fetch state but must compose `SourceSections`; Task 4 replaces that state with the final hook.

- [ ] **Step 5: Add focus-visible and reduced-motion foundations**

```css
:focus-visible { outline: 3px solid #1f8a70; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 6: Run source E2E and verification**

Run: `npm run test:e2e -- tests/e2e/source-transparency.spec.ts --project=chromium && npm run verify`

Expected: PASS; all six labels are visible text and links have discernible names.

- [ ] **Step 7: Commit source-transparent sections**

```bash
git add src/components/source-sections.tsx src/components/claim-workspace.tsx app/page.tsx app/globals.css tailwind.config.ts tests/e2e/helpers/mock-analyze.ts tests/e2e/helpers/claim-driver.ts tests/e2e/source-transparency.spec.ts
git commit -m "feat: distinguish claim evidence sources"
```

### Task 3: Make Synthetic Examples Impossible to Misread (WP2-03)

**Files:**
- Create: `tests/e2e/synthetic-sources.spec.ts`
- Modify: `src/components/source-sections.tsx`

**Interfaces:**
- Consumes: ranked case view models from Plan A Task 7 and Plan B Task 1.
- Produces: explicit non-color synthetic presentation while preserving Plan A's already-green ordering contract.

- [ ] **Step 1: Confirm the domain ordering contract, then write the failing browser test**

Run `npm test -- tests/domain/applicability-ranking.test.ts` first; it must already PASS from Plan A. Then add:

```ts
test("synthetic status is adjacent to its outcome", async ({ page }) => {
  await mockAnalysis(page, syntheticOnlyFixture());
  await page.goto("/");
  await runReadyClaim(page);
  const card = page.getByRole("article", { name: /synthetic marriott example/i });
  await expect(card.getByText("Synthetic example", { exact: true })).toBeVisible();
  await expect(card.getByText("Illustrative outcome — not a reported user result")).toBeVisible();
  await expect(card.getByRole("link")).toHaveCount(0);
});
```

- [ ] **Step 2: Run tests and verify source-neutral ordering/display fails**

Run: `npm run test:e2e -- tests/e2e/synthetic-sources.spec.ts --project=chromium`

Expected: FAIL only because the UI lacks the adjacent synthetic explanation. If ordering fails, return to Plan A Task 7 instead of editing ranking here.

- [ ] **Step 3: Render non-color synthetic disclosure**

```tsx
{source.category === "synthetic_example" ? (
  <p className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3 font-medium">
    Illustrative outcome — not a reported user result
  </p>
) : null}
```

The badge and disclosure must occur inside the same labelled article as the title and outcome.

- [ ] **Step 4: Run tests and full verification**

Run: `npm test -- tests/domain/applicability-ranking.test.ts && npm run test:e2e -- tests/e2e/synthetic-sources.spec.ts --project=chromium && npm run verify`

Expected: PASS; real comparable reports lead and every synthetic result is explicit.

- [ ] **Step 5: Commit synthetic isolation**

```bash
git add src/components/source-sections.tsx tests/e2e/synthetic-sources.spec.ts
git commit -m "fix: isolate synthetic claim examples"
```

### Task 4: Add Revision-Safe Fact Review and Correction (WP2-04)

**Files:**
- Create: `src/lib/analysis-api-client.ts`
- Create: `src/lib/claim-workflow.ts`
- Create: `src/hooks/use-claim-analysis.ts`
- Create: `src/components/intake-panel.tsx`
- Create: `src/components/fact-review-panel.tsx`
- Create: `tests/claim-workflow.test.ts`
- Create: `tests/e2e/fact-review.spec.ts`
- Modify: `src/components/claim-workspace.tsx`

**Interfaces:**
- Consumes: `AnalyzeClaimRequest`, public `AnalyzeClaimResponse`, raw fact edit contract.
- Produces: `ClaimPhase`, `ActiveRequest`, `ClaimWorkflowState`, `ClaimWorkflowAction`, `claimWorkflowReducer()`, `FactFieldDefinition`, `editFromForm()`, `AnalysisApiError`, `analyzeClaim()`, `useClaimAnalysis()`.

- [ ] **Step 1: Write failing reducer and stale-response tests**

```ts
it("ignores a late response from an older token and revision", () => {
  const current = createInitialClaimWorkflowState(claimState({}, 4));
  const newer = claimWorkflowReducer(current, {
    type: "request_started", token: 2, baseRevision: 4, kind: "correction"
  });
  const stale = claimWorkflowReducer(newer, {
    type: "response_received", token: 1, response: analyzeResponseFixture({ baseRevision: 3 })
  });
  expect(stale).toBe(newer);
});

it("distinguishes empty text from explicit clear", () => {
  expect(editFromForm({ deniedBoardingKind: "" }, [])).toEqual({ set: {}, clear: [] });
  expect(editFromForm({}, ["deniedBoardingKind"])).toEqual({ set: {}, clear: ["deniedBoardingKind"] });
});
```

Add separate reducer cases for matching token/wrong revision, matching revision/wrong token, response claim revision mismatch, result revision mismatch, reset then late response, mode change then late response, cancelled request, review enter/cancel, and `AbortError` not becoming a visible failure. Browser cases: voluntary→involuntary, Paris→London, clear a field, conflict display, and delayed old response arriving after a new response.
Add explicit same-token fixtures with `baseRevision: 4` whose response revision is `0` and `99`; parser and reducer must reject both. A no-change message may return revision 4 or 5, while a correction request must return exactly 5.

- [ ] **Step 2: Run unit tests and verify no revision reducer exists**

Run: `npm test -- tests/claim-workflow.test.ts`

Expected: FAIL because page-local state accepts every response and has no explicit clear.

- [ ] **Step 3: Implement the pure workflow reducer**

```ts
export type ClaimPhase = "idle" | "submitting" | "needs_information" | "reviewing_facts" | "ready" | "revising" | "blocked" | "error";

export type ActiveRequest = {
  token: number;
  baseRevision: number;
  kind: "message" | "correction";
};

export type ClaimWorkflowState = {
  phase: ClaimPhase;
  claimState: ClaimState;
  result: AnalysisViewModel | null;
  activeRequest: ActiveRequest | null;
  error: AnalysisApiError | null;
};

export type ClaimWorkflowAction =
  | { type: "request_started"; token: number; baseRevision: number; kind: ActiveRequest["kind"] }
  | { type: "response_received"; token: number; response: AnalyzeClaimResponse }
  | { type: "failed"; token: number; error: AnalysisApiError }
  | { type: "request_cancelled"; token: number }
  | { type: "review_started" }
  | { type: "review_cancelled" }
  | { type: "reset" };

export function claimWorkflowReducer(state: ClaimWorkflowState, action: ClaimWorkflowAction): ClaimWorkflowState {
  if (action.type === "response_received") {
    const active = state.activeRequest;
    if (
      active === null || action.token !== active.token ||
      action.response.baseRevision !== active.baseRevision ||
      state.claimState.revision !== active.baseRevision ||
      action.response.claimState.revision !== action.response.result.factsRevision ||
      !isLegalResponseRevision(active, action.response.claimState.revision)
    ) return state;
    return {
      ...state,
      phase: phaseFromStatus(action.response.result.status),
      claimState: action.response.claimState,
      result: action.response.result,
      activeRequest: null,
      error: null
    };
  }
  if (action.type === "request_started") {
    if (action.baseRevision !== state.claimState.revision) return state;
    return {
      ...state,
      phase: state.result ? "revising" : "submitting",
      activeRequest: { token: action.token, baseRevision: action.baseRevision, kind: action.kind },
      error: null
    };
  }
  if (action.type === "reset") return createInitialClaimWorkflowState();
  if (action.type === "review_started" && state.result) return { ...state, phase: "reviewing_facts" };
  if (action.type === "review_cancelled" && state.result) {
    return { ...state, phase: phaseFromStatus(state.result.status) };
  }
  if (action.type === "request_cancelled" && action.token === state.activeRequest?.token) {
    return { ...state, phase: state.result ? phaseFromStatus(state.result.status) : "idle", activeRequest: null };
  }
  if (action.type === "failed" && action.token === state.activeRequest?.token) {
    return { ...state, phase: "error", activeRequest: null, error: action.error };
  }
  return state;
}
```

```ts
export function isLegalResponseRevision(active: ActiveRequest, responseRevision: number): boolean {
  if (!Number.isSafeInteger(responseRevision) || responseRevision < 0) return false;
  return active.kind === "correction"
    ? responseRevision === active.baseRevision + 1
    : responseRevision === active.baseRevision || responseRevision === active.baseRevision + 1;
}
```

`phaseFromStatus()` maps `ready` to `ready`, `needs_information` to `needs_information`, and both `out_of_scope`/`unsupported_high_risk` to `blocked`. `createInitialClaimWorkflowState()` accepts an optional ClaimState and defaults to `{ facts: emptyRawClaimFacts(), provenance: {}, revision: 0, conflicts: [], unresolvedFields: [] }`. Reset never resets the hook's monotonic token ref.

- [ ] **Step 4: Add the API client and aborting hook**

```ts
export async function analyzeClaim(request: AnalyzeClaimRequest, options: AnalyzeClaimOptions): Promise<AnalyzeClaimResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (request.requestedMode === "gpt" && options.demoAccessCode) {
    headers.set("x-demo-access-code", options.demoAccessCode);
  }
  const response = await (options.fetcher ?? fetch)("/api/analyze", {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify(request)
  });
  const text = await response.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) as unknown : null; } catch { payload = null; }
  if (!response.ok) throw parseAnalysisApiError(response.status, payload);
  return parseAnalyzeClaimResponse(payload, {
    baseRevision: request.baseRevision,
    requestKind: request.correction ? "correction" : "message"
  });
}
```

`AnalysisApiError` contains only safe `code`, `message`, `requestId`, `retryable`, and status. `parseAnalysisApiError()` accepts only the server envelope; malformed/non-JSON/empty errors become a fixed generic message and never display upstream text/stack. `parseAnalyzeClaimResponse()` runtime-validates all frozen response invariants and applies the same message-versus-correction revision rule as `isLegalResponseRevision()` before returning data to the reducer. `useClaimAnalysis()` increments a monotonic `useRef` token, aborts the previous controller before every request/reset/mode change/unmount, dispatches `request_started`, and passes only the current token/response into `response_received`. An `AbortError` dispatches cancellation, not failure. The access code stays in `useState` only.

`submitMessage(message)` sends a trimmed non-empty message with no `correction`. `submitCorrection(correction)` requires at least one set/clear operation and sends the exact correction-only shape `{ message: "", prior: workflow.claimState, correction, baseRevision: workflow.claimState.revision, requestedMode: mode, privacyAcknowledged }`. It does not retain or replay the previous narrative. Add an API-client assertion plus the real two-turn route/E2E case from Plan A: the correction request body has an empty message, returned revision advances once, and model/local extractor call counts do not increase.

```ts
export type AnalysisApiError = {
  status: number;
  code: string;
  message: string;
  requestId: string | null;
  retryable: boolean;
};

export type AnalyzeClaimOptions = {
  signal: AbortSignal;
  demoAccessCode: string;
  fetcher?: typeof fetch;
};

export type AnalyzeResponseExpectation = {
  baseRevision: number;
  requestKind: "message" | "correction";
};

export type UseClaimAnalysisOptions = {
  fetcher?: typeof fetch;
};

export type UseClaimAnalysisResult = {
  workflow: ClaimWorkflowState;
  mode: ExtractionMode;
  privacyAcknowledged: boolean;
  accessCode: string;
  canSubmit: boolean;
  submitMessage(message: string): Promise<void>;
  submitCorrection(correction: UserFactEdit): Promise<void>;
  startFactReview(): void;
  cancelFactReview(): void;
  setMode(mode: ExtractionMode): void;
  setPrivacyAcknowledged(value: boolean): void;
  setAccessCode(value: string): void;
  reset(): void;
};

export function parseAnalysisApiError(status: number, value: unknown): AnalysisApiError;
export function parseAnalyzeClaimResponse(
  value: unknown,
  expectation: AnalyzeResponseExpectation
): AnalyzeClaimResponse;

export function useClaimAnalysis(options?: UseClaimAnalysisOptions): UseClaimAnalysisResult;
```

- [ ] **Step 5: Render raw edits and read-only derived facts**

Freeze editor metadata:

```ts
export type FactFieldDefinition = {
  path: RawFactPath;
  label: string;
  input:
    | { kind: "text" }
    | { kind: "number"; min: 0 }
    | { kind: "boolean" }
    | { kind: "string_list"; maxItems: 20 }
    | { kind: "enum"; options: readonly string[] };
  section: "trip" | "disruption" | "boarding" | "hotel" | "assistance" | "evidence";
};
```

`FACT_FIELD_DEFINITIONS` contains exactly one definition for every `RAW_FACT_PATHS` entry. Number paths are the three delay/notice fields; boolean paths are `userInitiatedChange`, `isOvernight`, all assistance leaves, all boarding/hotel boolean leaves; enum paths are incident/provider/reason/denied-boarding/booking; `expenses`/`evidence` are bounded string lists; remaining fields are text. A test compares sorted definition paths to sorted `RAW_FACT_PATHS`.

```ts
export type FactFormValue = string | number | boolean | string[];
export function editFromForm(
  values: Partial<Record<RawFactPath, FactFormValue>>,
  clearPaths: readonly RawFactPath[]
): UserFactEdit;
```

`editFromForm()` trims strings, parses non-negative integers, preserves `0`/`false`, deduplicates list items and explicit clears, rejects any non-allowlisted path, treats blank input as no edit, and uses only the dedicated clear list to remove a fact. `ClaimWorkspace` renders `FactReviewPanel` only when `result.factReview` is non-null. The panel labels editable raw facts separately from “Server-derived context”. While revising, label the old assessment “Updating from corrected facts”.

- [ ] **Step 6: Run reducer, fact-review E2E, and verification**

Run: `npm test -- tests/claim-workflow.test.ts && npm run test:e2e -- tests/e2e/fact-review.spec.ts --project=chromium && npm run verify`

Expected: PASS; no late response can restore old route/boarding facts.

- [ ] **Step 7: Commit fact review**

```bash
git add src/lib/analysis-api-client.ts src/lib/claim-workflow.ts src/hooks/use-claim-analysis.ts src/components/intake-panel.tsx src/components/fact-review-panel.tsx src/components/claim-workspace.tsx tests/claim-workflow.test.ts tests/e2e/fact-review.spec.ts
git commit -m "feat: review and correct claim facts"
```

### Task 5: Render Explanations, Remedies, Evidence, and One Next Action (WP2-05)

**Files:**
- Create: `src/components/analysis-overview.tsx`
- Create: `src/components/remedy-assessment-list.tsx`
- Create: `src/components/script-list.tsx`
- Create: `tests/e2e/assessment-explanation.spec.ts`
- Modify: `src/components/claim-workspace.tsx`

**Interfaces:**
- Consumes: `AnalysisViewModel`, `RemedyAssessmentViewModel[]`, `ScriptViewModel[]`.
- Produces: `AnalysisOverview`, `RemedyAssessmentList`, `ScriptList`.

- [ ] **Step 1: Write a failing explanation E2E test**

```ts
test("shows facts, condition evidence, request basis, and one next action", async ({ page }) => {
  await mockAnalysis(page, euCancellationFixture());
  await page.goto("/");
  await runReadyClaim(page);
  await expect(page.getByRole("heading", { name: "Facts used" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matched conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missing conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Policy applicability" })).toBeVisible();
  for (const label of [
    "Operating-carrier region",
    "EU261 applicability",
    "UK261 applicability",
    "Legal regimes"
  ]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("Informational guidance only — not legal advice or a promise of compensation.")).toBeVisible();
  await expect(page.getByTestId("primary-next-action")).toHaveCount(1);
  await expect(page.getByText("Claim strength")).toHaveCount(0);
});
```

Parameterize the same structural assertions over Marriott walk, US controllable cancellation, US denied boarding, and EU/UK cancellation. Add `needs_information`, `out_of_scope`, and `unsupported_high_risk`; the last two must have no fact-review panel, derived-context panel, remedy cards, script cards, source cards, or compensation request options.
For each ready journey, assert every rendered script has a visible `Grounded in <source title>` link whose `href` targets the exact source-card heading ID returned in the same response. Include a citation whose policy was outside display Top-K before view-model promotion; it must still render one source card and one working in-page link, never a raw/unknown ID.

- [ ] **Step 2: Run the E2E test and verify legacy summary fails**

Run: `npm run test:e2e -- tests/e2e/assessment-explanation.spec.ts --project=chromium`

Expected: FAIL because the old UI shows strength and omits summary/condition explanations.

- [ ] **Step 3: Implement status-labelled remedy cards**

```tsx
export function RemedyAssessmentList({ assessments }: RemedyAssessmentListProps) {
  return <section aria-labelledby="remedies-title">
    <h2 id="remedies-title">Rights and request options</h2>
    {assessments.map((item) => <article key={item.remedyId} aria-labelledby={`remedy-${item.remedyId}`}>
      <h3 id={`remedy-${item.remedyId}`}>{item.title}</h3>
      <span>{REMEDY_STATUS_LABELS[item.status]}</span>
      <ConditionList title="Matched conditions" items={item.matchedConditions} />
      <ConditionList title="Missing conditions" items={item.missingConditions} />
      <ConditionList title="Exclusions" items={item.exclusions} />
      <EvidenceSummary evidence={item.evidence} />
      <RequestOptions items={item.requestOptions} />
    </article>)}
  </section>;
}
```

Define the component contracts in the same file:

```ts
export type RemedyAssessmentListProps = { assessments: RemedyAssessmentViewModel[] };
export type ConditionListProps = { title: string; items: ConditionViewModel[] };
export type EvidenceSummaryProps = { evidence: RemedyAssessmentViewModel["evidence"] };
export type RequestOptionsProps = { items: RequestOptionViewModel[] };
export type ScriptListProps = {
  scripts: ScriptViewModel[];
  sources: PolicySourceViewModel[];
};

export const REMEDY_STATUS_LABELS: Record<RemedyStatus, string> = {
  supported: "Supported by current facts",
  conditional: "Conditional — review missing facts",
  not_applicable: "Not applicable on current facts"
};
```

`ConditionList` renders “None identified” for an empty list instead of an empty `<ul>`. Request options use Conservative/Standard/Assertive labels and show the linked remedy status. Do not render an unsupported fixed amount.

- [ ] **Step 4: Render overview and resilient script copy**

`AnalysisOverview` shows summary, active scenarios, facts used, the full read-only derived context (normalized provider/carrier, origin/destination/operating-carrier regions, EU261/UK261 applicability, controllability, and every legal regime), and a read-only “Policy applicability” list containing every `PolicyApplicabilityViewModel` status/conditions—not just Top-K source cards. It also shows cautions, disclaimer, and the sole tuple item from `nextActions`. It omits the fact-review, derived-context, and applicability sections for blocked results. No remedy card renders its own next action. `ClaimWorkspace` passes `officialSources` plus `providerCommitments` to `ScriptList`. The component builds an exact-ID lookup, renders every citation as `Grounded in <source title>` linking to `#policy-source-<source id>`, and throws in development/tests if a validated source is absent; it never displays a naked fallback ID. It gives each copy button the accessible name `Copy <script title>`, catches clipboard rejection, and announces “Copy failed — select the text manually” in a dedicated `role="status" aria-live="polite" aria-atomic="true"` region.

`ClaimWorkspace` uses `aria-busy` during requests. After success/blocked/error it focuses a `tabIndex={-1}` result or error heading; reset returns focus to intake. Form controls use `htmlFor`, stable IDs, and `aria-describedby`; errors use `role="alert"`. At this checkpoint add a keyboard-only E2E that traverses intake, result, fact correction, source link, copy, and reset. Task 7 extends the journey through the Task 6 model/consent/code controls and Task 7 feedback/download controls.

- [ ] **Step 5: Run E2E and verification**

Run: `npm run test:e2e -- tests/e2e/assessment-explanation.spec.ts --project=chromium && npm run verify`

Expected: PASS; no claim-strength copy remains in the rendered product.

- [ ] **Step 6: Commit explanation UI**

```bash
git add src/components/analysis-overview.tsx src/components/remedy-assessment-list.tsx src/components/script-list.tsx src/components/claim-workspace.tsx tests/e2e/assessment-explanation.spec.ts
git commit -m "feat: explain claim remedy assessments"
```

### Task 6: Add Actual Model State and Privacy Controls (WP2-06)

**Files:**
- Create: `src/components/model-privacy-controls.tsx`
- Create: `tests/analysis-api-client.test.ts`
- Create: `tests/e2e/model-privacy.spec.ts`
- Modify: `src/components/claim-workspace.tsx`
- Modify: `src/hooks/use-claim-analysis.ts`

**Interfaces:**
- Consumes: extraction metadata, mode setter, consent setter, in-memory access-code setter.
- Produces: `ModelPrivacyControls` and exact badge/copy behavior.

- [ ] **Step 1: Write failing header/body/storage and UI tests**

```ts
it("sends the demo code only in the dedicated header", async () => {
  const fetcher = vi.fn().mockResolvedValue(okAnalyzeResponse());
  await analyzeClaim(localRequest({ requestedMode: "gpt", privacyAcknowledged: true }), {
    signal: new AbortController().signal,
    demoAccessCode: "judge-code",
    fetcher
  });
  const init = fetcher.mock.calls[0]?.[1] as RequestInit;
  expect(new Headers(init.headers).get("x-demo-access-code")).toBe("judge-code");
  expect(String(init.body)).not.toContain("judge-code");
});
```

Browser assertions: Local default; GPT submit disabled until acknowledgement and code; access code absent from local/session storage; response badge uses the discriminated actual extraction result; fallback explanation is visible; a preflight high-risk fixture shows `Not run` and never `Local`/`OpenAI`.

Add a unit case where hook state still contains a prior code but `requestedMode: "local"`; the request must omit `x-demo-access-code`. Add invalid extraction variants to the response parser: OpenAI with Local requested mode or null/wrong model, Local with a model, GPT→Local without a non-empty fallback reason, Local→Local with a fallback reason, `performed: false` with a provider/model/fallback or a reason outside `preflight_guard|correction_only`, and `performed: true` with `notRunReason` must all be rejected.

- [ ] **Step 2: Run unit and browser tests**

Run: `npm test -- tests/analysis-api-client.test.ts && npm run test:e2e -- tests/e2e/model-privacy.spec.ts --project=chromium`

Expected: FAIL until controls and exact badge are rendered.

- [ ] **Step 3: Implement controls with no persistent code state**

```tsx
export function ModelPrivacyControls(props: ModelPrivacyControlsProps) {
  const gptBlocked = props.mode === "gpt" && (!props.acknowledged || props.accessCode.length === 0);
  return <fieldset disabled={props.disabled}>
    <legend>Fact extraction</legend>
    <label><input type="radio" checked={props.mode === "local"} onChange={() => props.onModeChange("local")} /> Local</label>
    <label><input type="radio" checked={props.mode === "gpt"} onChange={() => props.onModeChange("gpt")} /> GPT-5.6 Luna</label>
    {props.mode === "gpt" ? <>
      <p>The redacted current message and only the necessary structured facts are sent to OpenAI with store: false.</p>
      <p>Do not enter names, ticket, reservation, membership, or payment numbers.</p>
      <p>Raw narratives are not intentionally persisted, and application logs exclude raw messages, complete facts, secrets, and access codes.</p>
      <label><input type="checkbox" checked={props.acknowledged} onChange={(event) => props.onAcknowledgedChange(event.target.checked)} /> I understand</label>
      <label>Judge access code<input type="password" autoComplete="off" value={props.accessCode} onChange={(event) => props.onAccessCodeChange(event.target.value)} /></label>
      {gptBlocked ? <p role="status">Acknowledge privacy and enter the judge code to use GPT.</p> : null}
    </> : null}
  </fieldset>;
}
```

```ts
export type ModelPrivacyControlsProps = {
  mode: ExtractionMode;
  acknowledged: boolean;
  accessCode: string;
  disabled: boolean;
  actualExtraction: ExtractionMetadata | null;
  onModeChange(mode: ExtractionMode): void;
  onAcknowledgedChange(value: boolean): void;
  onAccessCodeChange(value: string): void;
};
```

The hook exposes `canSubmit = phase is not submitting/revising && (mode === "local" || (acknowledged && accessCode.trim().length > 0))`; the intake submit button consumes it, so `gptBlocked` is not copy-only. Actual badge copy is derived only from validated result metadata: `performed: false` → `Not run`; performed OpenAI plus exact model → `OpenAI · gpt-5.6-luna`; performed Local plus fallback reason → `Local fallback`; performed Local without fallback reason → `Local`.

- [ ] **Step 4: Run tests, inspect storage, and verify**

Run: `npm test -- tests/analysis-api-client.test.ts && npm run test:e2e -- tests/e2e/model-privacy.spec.ts --project=chromium && npm run verify`

Expected: PASS; code is absent from body and browser storage.

- [ ] **Step 5: Commit privacy controls**

```bash
git add src/components/model-privacy-controls.tsx src/components/claim-workspace.tsx src/hooks/use-claim-analysis.ts tests/analysis-api-client.test.ts tests/e2e/model-privacy.spec.ts
git commit -m "feat: expose private GPT extraction controls"
```

### Task 7: Add Privacy-Safe Session Feedback (WP2-07)

**Files:**
- Create: `lib/feedback.ts`
- Create: `src/components/feedback-panel.tsx`
- Create: `tests/feedback.test.ts`
- Create: `tests/e2e/feedback.spec.ts`
- Modify: `src/components/claim-workspace.tsx`
- Modify: `src/hooks/use-claim-analysis.ts`

**Interfaces:**
- Consumes: current facts revision, scenario IDs, current source IDs/fact paths.
- Produces: `FeedbackKind`, `FeedbackDraft`, `FeedbackRecord`, `createFeedbackRecord()`, `serializeFeedback()`.

- [ ] **Step 1: Write failing privacy and lifecycle tests**

```ts
it("serializes bounded feedback without narrative, facts, or credentials", () => {
  const record = createFeedbackRecord({
    draft: { kind: "source_mismatch", sourceIds: ["eu261_regulation_261_2004"] },
    factsRevision: 4,
    scenarioIds: ["eu_uk_air_disruption"],
    feedbackId: "feedback-1",
    createdAt: "2026-07-18T12:00:00.000Z"
  }, {
    allowedFactPaths: new Set(["operatingCarrier"]),
    allowedSourceIds: new Set(["eu261_regulation_261_2004"])
  });
  const json = serializeFeedback([record]);
  expect(json).toContain("source_mismatch");
  for (const forbidden of ["message", "rawFacts", "accessCode", "ticketNumber"]) expect(json).not.toContain(forbidden);
});
```

Browser assertions: three fixed actions; fact/source selections only; no free text; no `/api/feedback` call; a revision change preserves submitted records but clears the unsubmitted draft; explicit download yields JSON; a previously entered GPT code is absent by key and value from the download. Extend Task 5's keyboard journey through mode, privacy consent, judge-code input, intake/result/fact/source/copy, feedback selection/submission, explicit download, and reset now that every control exists.

- [ ] **Step 2: Run unit and browser tests**

Run: `npm test -- tests/feedback.test.ts && npm run test:e2e -- tests/e2e/feedback.spec.ts --project=chromium`

Expected: FAIL because no feedback contract or panel exists.

- [ ] **Step 3: Implement deterministic bounded feedback**

```ts
export type FeedbackDraft =
  | { kind: "helpful" }
  | { kind: "fact_error"; factPaths: RawFactPath[] }
  | { kind: "source_mismatch"; sourceIds: string[] };

export type FeedbackKind = FeedbackDraft["kind"];

export type FeedbackRecordData = {
  schemaVersion: 1;
  feedbackId: string;
  createdAt: string;
  factsRevision: number;
  scenarioIds: ScenarioId[];
  feedback: FeedbackDraft;
};

const VALIDATED_FEEDBACK_RECORD: unique symbol = Symbol("validated-feedback-record");

export type FeedbackRecord = Readonly<FeedbackRecordData> & {
  readonly [VALIDATED_FEEDBACK_RECORD]: true;
};

export type FeedbackRecordInput = Omit<FeedbackRecordData, "schemaVersion" | "feedback"> & {
  draft: FeedbackDraft;
};

export type FeedbackValidationContext = {
  allowedFactPaths: ReadonlySet<RawFactPath>;
  allowedSourceIds: ReadonlySet<string>;
};

export function createFeedbackRecord(
  input: FeedbackRecordInput,
  context: FeedbackValidationContext
): FeedbackRecord;

export function serializeFeedback(records: readonly FeedbackRecord[]): string;

export function downloadFeedback(records: readonly FeedbackRecord[], documentRef: Document): void;

export type FeedbackPanelProps = {
  draft: FeedbackDraft | null;
  records: readonly FeedbackRecord[];
  allowedFactPaths: readonly RawFactPath[];
  allowedSourceIds: readonly string[];
  onDraftChange(draft: FeedbackDraft | null): void;
  onSubmit(): void;
  onDownload(): void;
};
```

The module-private `VALIDATED_FEEDBACK_RECORD` symbol is immutable and not exported. The factory validates at runtime: revision is a non-negative integer; scenario IDs are in the frozen allowlist; `helpful` has no selections; fact/source mismatch has 1-20 unique selections; every ID is at most 128 code points; fact paths are in `RAW_FACT_PATHS` and `allowedFactPaths`; source IDs are in `allowedSourceIds`. It copies scenario/selection arrays, defines the private symbol as a non-enumerable, non-writable, non-configurable own property with value `true`, deep-freezes the complete record, and returns the branded type. Symbol properties are omitted by `JSON.stringify`; there is no mutable module registry.

`serializeFeedback()` rejects any object without that exact private symbol own-property, then revalidates immutable structure, frozen scenario allowlist, global `RAW_FACT_PATHS`, ID syntax/length/count, and absence of unknown enumerable keys before returning `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`. The unexported brand plus immutability preserves the factory's historical dynamic `allowedFactPaths`/`allowedSourceIds` validation across revisions; callers cannot manufacture a merely structural record. `downloadFeedback()` always calls `serializeFeedback()` rather than serializing directly. Add a unit test that casts a plain lookalike object through `unknown`; serialization and download must reject it, while the non-enumerable symbol must be absent from exported JSON.

- [ ] **Step 4: Render session-only feedback and explicit download**

Keep submitted records in hook state. In this task extend `UseClaimAnalysisResult` with `feedbackDraft: FeedbackDraft | null`, `feedbackRecords: readonly FeedbackRecord[]`, `setFeedbackDraft(draft: FeedbackDraft | null): void`, `submitFeedback(): void`, and `downloadFeedbackRecords(): void`. Clear only the unsubmitted draft when `factsRevision` changes. `downloadFeedback()` creates an `application/json` Blob, uses filename `travel-claims-feedback.json`, appends/clicks/removes one temporary anchor, and revokes the object URL in `queueMicrotask()` so the browser can consume it. Unit tests assert MIME, filename, anchor cleanup, and revoke. Do not use `fetch`, local storage, or session storage.

- [ ] **Step 5: Run feedback, privacy, and full verification**

Run: `npm test -- tests/feedback.test.ts && npm run test:e2e -- tests/e2e/feedback.spec.ts --project=chromium && npm run verify`

Expected: PASS; no feedback network request and no forbidden data in export.

- [ ] **Step 6: Commit session feedback**

```bash
git add lib/feedback.ts src/components/feedback-panel.tsx src/components/claim-workspace.tsx src/hooks/use-claim-analysis.ts tests/feedback.test.ts tests/e2e/feedback.spec.ts
git commit -m "feat: capture private session feedback"
```

## Plan B Completion Gate

- [ ] Run `npm run verify` and confirm exit 0.
- [ ] Run `npm run test:e2e -- --project=chromium` and confirm all Plan B browser tests pass.
- [ ] Run `git grep -n "Claim strength\|Aggressive" -- app src` and confirm neither legacy phrase remains.
- [ ] Run `git grep -n "localStorage\|sessionStorage" -- app src lib/feedback.ts` and confirm no access-code or feedback persistence exists.
- [ ] Keyboard-test mode selection, consent, intake, fact correction, source links, script copy, feedback, reset, and download.
- [ ] Confirm `git status --short` is empty before resuming Plan C.
