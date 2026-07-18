# Trustworthy Domain and API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace client/LLM-authored eligibility with a revision-safe raw-fact contract, authoritative four-scenario resolution, deterministic remedy assessment, two-stage safety gates, and applicability-first retrieval.

**Architecture:** New kebab-case modules under `lib/domain`, `lib/model`, `lib/knowledge`, and `lib/api` become the sole sources of truth. Existing camelCase modules remain temporary compatibility façades until the product plan migrates all consumers; they must re-export or delegate, never duplicate rules.

**Tech Stack:** TypeScript 5.9, Vitest 4.1, Next.js route handlers, local JSON knowledge, OpenAI Responses structured output.

## Global Constraints

- Prerequisite: complete Plan C Task 1 so Node `22.14.0`, npm `10.9.2`, `typecheck`, and `verify` are available.
- Before Task 5, complete Plan C Task 6 so carrier-specific commitments and runtime-validated knowledge are available.
- Canonical incidents are `hotel_walk`, `airline_delay`, `airline_cancellation`, and `denied_boarding`; aliases cannot assert controllability or legal regime.
- Only the server derives regions, carrier region, controllability, scenario IDs, policy applicability, legal regimes, and remedy status.
- `eu261_delay_or_cancellation` remains ambiguous without route and incident subtype; it never activates EU/UK scope by itself.
- A model `null` patch value is a no-op. Only an explicit user `clear` operation removes an existing fact.
- Ordinary missing facts return `needs_information` in a successful result. High-risk and out-of-scope results contain no ordinary asks, scripts, or similar outcomes.
- Provider commitments require an exact normalized applicable-carrier/role record, current source review, and matched typed event predicates; a missing predicate can be only `conditional`.
- Keep every task green with `npm run verify`; do not redesign the UI in this plan beyond the smallest API consumer migration needed to compile.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/domain/claim-contract.ts` | Canonical raw, resolved, remedy, workflow, and presentation-neutral types |
| `lib/domain/incident-taxonomy.ts` | Frozen public allowlist and non-authoritative alias normalization |
| `lib/domain/raw-fact-schema.ts` | Runtime parsers and strict model patch JSON Schema |
| `lib/domain/fact-merge.ts` | Set/clear, provenance, conflict, and revision semantics |
| `lib/domain/context-resolver.ts` | Server-owned provider, route, carrier-region, and controllability resolution |
| `lib/domain/scenario-resolver.ts` | Four scenario admissions, overlap, and presentation order |
| `lib/domain/scenario-evaluator.ts` | Material conditions and evaluator interface |
| `lib/domain/remedy-assessment.ts` | Per-remedy statuses, evidence, requests, cautions, and next actions |
| `lib/domain/policy-applicability.ts` | Complete policy eligibility and legal-regime derivation before display ranking |
| `lib/domain/safety-guard.ts` | Preflight and post-merge scope/high-risk decisions |
| `lib/model/raw-fact-extractor.ts` | Local/OpenAI patch extraction and allowlisted model input |
| `lib/knowledge/knowledge-contract.ts` | Plan C Task 6-owned carrier/snapshot/repository contract |
| `lib/knowledge/knowledge-repository.ts` | Plan C Task 6-owned validated local repository, extended by Task 7 |
| `lib/api/analyze-contract.ts` | Request/result/error transport types |
| `lib/claim-workflow.ts` | One orchestration path from turn input to assessment and retrieval trace |
| `tests/fixtures/raw-claims.ts` | Typed empty/state/resolved claim builders shared by domain tests |
| `tests/fixtures/knowledge.ts` | Typed policy/case/commitment builders shared by domain tests |
| `tests/fixtures/workflow.ts` | Assessment lookup and workflow dependency builders |

## Frozen Domain and Test Contracts

These names are canonical throughout this plan. Do not introduce `RawFactState`, `AnalysisStatus`, or `ScoredRetrievalItem` aliases.

```ts
export type FactSource =
  | "user_correction"
  | "user_message"
  | "deterministic_extraction"
  | "openai_extraction";

export type FactProvenance = {
  source: FactSource;
  factsRevision: number;
};

export type ClaimState = {
  facts: RawClaimFacts;
  provenance: Partial<Record<RawFactPath, FactProvenance>>;
  revision: number;
  conflicts: FactConflict[];
  unresolvedFields: RawFactPath[];
};

export type FactConflict = {
  field: RawFactPath;
  candidates: Array<{
    value: RawFactValue;
    source: "deterministic_extraction" | "openai_extraction";
  }>;
};

export type RawFactPatch = {
  set: Partial<Record<RawFactPath, RawFactValue | null>>;
};

export type UserFactEdit = {
  set: Partial<Record<RawFactPath, RawFactValue>>;
  clear: RawFactPath[];
};

export type MergeRawFactsInput = {
  prior: ClaimState;
  baseRevision: number;
  correction?: UserFactEdit;
  deterministicPatch: RawFactPatch;
  openaiPatch?: RawFactPatch;
};

export type MergeRawFactsResult = {
  state: ClaimState;
  baseRevision: number;
  changedFields: RawFactPath[];
  conflicts: FactConflict[];
  unresolvedFields: RawFactPath[];
};

export type ScenarioDecision = {
  scenarioId: ScenarioId;
  status: "active" | "excluded" | "unresolved";
  reasons: string[];
  missingFacts: RawFactPath[];
};

export type ScenarioResolution =
  | {
      status: "resolved";
      scenarioIds: ScenarioId[];
      primaryScenario: ScenarioId;
      decisions: ScenarioDecision[];
      missingFacts: [];
    }
  | {
      status: "needs_information" | "out_of_scope";
      scenarioIds: [];
      primaryScenario: null;
      decisions: ScenarioDecision[];
      missingFacts: RawFactPath[];
    };

export type DerivedApplicability = "applies" | "does_not_apply" | "unknown";

export type ResolvedJurisdiction = {
  originRegion: ResolvedValue<PolicyRouteRegion | null>;
  destinationRegion: ResolvedValue<PolicyRouteRegion | null>;
  operatingCarrierRegion: ResolvedValue<PolicyRouteRegion | null>;
  eu261: ResolvedValue<DerivedApplicability>;
  uk261: ResolvedValue<DerivedApplicability>;
};
```

By the end of Task 3, `lib/api/analyze-contract.ts` exports the stateless request and intake response below. Task 5 adds the final internal-domain response after `AssessmentResult` and `ResolvedClaimContext` both exist. Plan B owns the final public view-model response:

```ts
export type AnalyzeClaimRequest = {
  message: string;
  prior: ClaimState;
  correction?: UserFactEdit;
  baseRevision: number;
  requestedMode?: ExtractionMode;
  privacyAcknowledged?: boolean;
};

export type AnalyzeClaimIntakeResponse = {
  baseRevision: number;
  claimState: ClaimState;
  status: "needs_information" | "ready";
};
```

Request intent is unambiguous: an initial/message turn has no `correction` and a non-blank `message`; a correction-only turn has a non-empty `correction`, uses `message: ""`, and must skip both extractors. `UserFactEdit.set` accepts only a real `RawFactValue`; null is invalid and explicit removal must use `clear`. A request containing both non-blank message text and a correction is invalid in this release.

Task 5 adds this compile-safe domain response:

```ts
export type AnalyzeClaimDomainResponse = {
  baseRevision: number;
  claimState: ClaimState;
  result: AssessmentResult;
  context: ResolvedClaimContext | null;
};
```

Shared tests import only these declared helpers:

```ts
// tests/fixtures/raw-claims.ts
export function rawFacts(overrides?: DeepPartial<RawClaimFacts>): RawClaimFacts;
export function claimState(
  factOverrides?: DeepPartial<RawClaimFacts>,
  revision?: number,
  stateOverrides?: Partial<Pick<ClaimState, "provenance" | "conflicts" | "unresolvedFields">>
): ClaimState;
export function resolvedContext(overrides?: DeepPartial<RawClaimFacts>): ResolvedClaimContext;

// tests/fixtures/knowledge.ts
export function policyFixture(overrides?: Partial<Policy>): Policy;
export function caseFixture(overrides?: Partial<Case>): Case;
export function carrierCommitmentFixture(overrides?: Partial<CarrierCommitment>): CarrierCommitment;

// tests/fixtures/workflow.ts
export function remedyById(result: AssessmentResult, remedyId: RemedyId): RemedyAssessment;
export function runWorkflowFixture(input: {
  facts: DeepPartial<RawClaimFacts>;
  commitments?: CarrierCommitment[];
  asOf: string;
}): Promise<AssessmentResult>;
```

`DeepPartial<T>` recursively makes object properties optional but leaves primitive and array values intact. Each builder starts from one fully valid frozen value, deep-merges overrides without mutating either input, and returns fresh arrays/objects. `resolvedContext()` builds one `ClaimState`, derives its `resolutionFacts` through `buildResolutionFacts()`, and runs the real context/scenario resolver; it never fabricates a second unmasked fact copy. `runWorkflowFixture()` defaults to a complete controllable United JFK→LAX cancellation; `carrierCommitmentFixture()` defaults to a source-reviewed-shaped United record with all four allowed remedies and is labelled test data. Fixture dates and `asOf` values are fixed strings; tests never depend on `Date.now()`.
`claimState()` always includes fresh `conflicts: []` and `unresolvedFields: []` defaults; its third argument may supply copied provenance and both conflict arrays for multi-turn tests. Most multi-turn tests pass the preceding response state directly instead of rebuilding it.

### Task 1: Freeze Canonical Incidents and Public Scenario Catalog (WP1-01)

**Files:**
- Create: `lib/domain/claim-contract.ts`
- Create: `lib/domain/incident-taxonomy.ts`
- Create: `tests/domain/incident-taxonomy.test.ts`
- Create: `tests/api/public-scope.test.ts`
- Modify: `lib/issueTaxonomy.ts:1-73`
- Modify: `lib/scenarios.ts:1-56`
- Modify: `app/api/scenarios/route.ts:1-17`
- Modify: `app/api/analyze/route.ts:11-71`

**Interfaces:**
- Produces: `CanonicalIncident`, `LegacyIncidentAlias`, `ScenarioId`, `WorkflowStatus`, `ExtractionMode`, `ExtractionProvider`, `IncidentNormalization`, `PublicScenarioSummary`, `PUBLIC_SCENARIOS`, `getPublicScenarioCatalog()`, `normalizeIncidentInput()`.
- Consumes: no new interface.

- [ ] **Step 1: Write failing taxonomy and public-scope tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeIncidentInput } from "../../lib/domain/incident-taxonomy";

describe("normalizeIncidentInput", () => {
  it.each([
    ["hotel_walk", "hotel_walk"],
    ["controllable_airline_delay", "airline_delay"],
    ["controllable_airline_cancellation", "airline_cancellation"]
  ] as const)("normalizes %s without deriving eligibility", (input, incident) => {
    expect(normalizeIncidentInput(input)).toEqual({ incident, legacy: input !== incident, needsSubtype: false });
  });

  it("keeps the EU alias ambiguous", () => {
    expect(normalizeIncidentInput("eu261_delay_or_cancellation")).toEqual({
      incident: null,
      legacy: true,
      needsSubtype: true
    });
  });

  it.each(["baggage_delay", "hotel_property_loss", "insurance_claim"])(
    "rejects dormant public input %s",
    (input) => expect(normalizeIncidentInput(input)).toBeNull()
  );
});
```

Add this route contract test using direct handler imports:

```ts
import { describe, expect, it } from "vitest";
import { GET as getScenarios } from "../../app/api/scenarios/route";
import { POST as analyze } from "../../app/api/analyze/route";

it("publishes exactly the four frozen scenarios", async () => {
  const response = await getScenarios();
  const body = await response.json();
  expect(body.scenarios.map(({ id }: { id: string }) => id)).toEqual([
    "marriott_hotel_walk",
    "us_airline_disruption",
    "us_denied_boarding",
    "eu_uk_air_disruption"
  ]);
});

it("keeps the EU legacy alias unresolved without incident subtype", async () => {
  const response = await analyze(new Request("http://local/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issueType: "eu261_delay_or_cancellation" })
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "needs_information" });
});

it("returns a safe out-of-scope envelope for a dormant incident", async () => {
  const response = await analyze(new Request("http://local/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issueType: "baggage_delay" })
  }));
  expect(await response.json()).toEqual({
    status: "out_of_scope",
    primaryScenario: null,
    scenarioIds: [],
    missingFacts: [],
    assessments: [],
    cautions: ["This competition build supports four frozen travel-disruption journeys."],
    nextActions: []
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing modules fail**

Run: `npm test -- tests/domain/incident-taxonomy.test.ts tests/api/public-scope.test.ts`

Expected: FAIL because `lib/domain/incident-taxonomy.ts` and the four-ID response do not exist.

- [ ] **Step 3: Add the canonical contract and alias normalizer**

```ts
// lib/domain/claim-contract.ts
export const CANONICAL_INCIDENTS = [
  "hotel_walk",
  "airline_delay",
  "airline_cancellation",
  "denied_boarding"
] as const;

export type CanonicalIncident = (typeof CANONICAL_INCIDENTS)[number];
export type LegacyIncidentAlias =
  | "controllable_airline_delay"
  | "controllable_airline_cancellation"
  | "eu261_delay_or_cancellation";
export type ScenarioId =
  | "marriott_hotel_walk"
  | "us_airline_disruption"
  | "us_denied_boarding"
  | "eu_uk_air_disruption";
export type WorkflowStatus =
  | "ready"
  | "needs_information"
  | "out_of_scope"
  | "unsupported_high_risk";
export type ExtractionMode = "gpt" | "local";
export type ExtractionProvider = "openai" | "local";
export type RemedyStatus = "supported" | "conditional" | "not_applicable";

export type PublicScenarioSummary = {
  id: ScenarioId;
  label: string;
};

export const PUBLIC_SCENARIOS: readonly PublicScenarioSummary[] = [
  { id: "marriott_hotel_walk", label: "Marriott hotel walk" },
  { id: "us_airline_disruption", label: "US airline delay or cancellation" },
  { id: "us_denied_boarding", label: "US denied boarding" },
  { id: "eu_uk_air_disruption", label: "EU/UK airline delay or cancellation" }
];

export function getPublicScenarioCatalog(): readonly PublicScenarioSummary[] {
  return PUBLIC_SCENARIOS;
}
```

```ts
// lib/domain/incident-taxonomy.ts
import { CANONICAL_INCIDENTS, type CanonicalIncident } from "./claim-contract";

export type IncidentNormalization = {
  incident: CanonicalIncident | null;
  legacy: boolean;
  needsSubtype: boolean;
};

const aliases = {
  controllable_airline_delay: "airline_delay",
  controllable_airline_cancellation: "airline_cancellation"
} as const;

export function normalizeIncidentInput(value: unknown): IncidentNormalization | null {
  if (typeof value !== "string") return null;
  if (CANONICAL_INCIDENTS.includes(value as CanonicalIncident)) {
    return { incident: value as CanonicalIncident, legacy: false, needsSubtype: false };
  }
  if (value in aliases) {
    return { incident: aliases[value as keyof typeof aliases], legacy: true, needsSubtype: false };
  }
  if (value === "eu261_delay_or_cancellation") {
    return { incident: null, legacy: true, needsSubtype: true };
  }
  return null;
}
```

- [ ] **Step 4: Make scenario and route compatibility delegate to the frozen contract**

Return `getPublicScenarioCatalog()` from the route. In `app/api/analyze/route.ts`, normalize any legacy `issueType` before calling existing analysis. Use a locally named `LegacySafeScopeResponse` for the temporary Task 1 response so it cannot be mistaken for the canonical Task 5 API contract. Return the exact safe envelope below for a known dormant input; the ambiguous EU alias uses the same shape with `status: "needs_information"`, `missingFacts: ["incidentType"]`, and a subtype-specific caution.

```ts
return Response.json({
  status: "out_of_scope",
  primaryScenario: null,
  scenarioIds: [],
  missingFacts: [],
  assessments: [],
  cautions: ["This competition build supports four frozen travel-disruption journeys."],
  nextActions: []
});
```

- [ ] **Step 5: Run targeted and full deterministic verification**

Run: `npm test -- tests/domain/incident-taxonomy.test.ts tests/api/public-scope.test.ts && npm run verify`

Expected: both targeted files PASS; `verify` exits 0.

- [ ] **Step 6: Commit the frozen taxonomy**

```bash
git add lib/domain/claim-contract.ts lib/domain/incident-taxonomy.ts lib/issueTaxonomy.ts lib/scenarios.ts app/api/scenarios/route.ts app/api/analyze/route.ts tests/domain/incident-taxonomy.test.ts tests/api/public-scope.test.ts
git commit -m "refactor: freeze public claim scenarios"
```

### Task 2: Separate Raw Facts from Server-Owned Context (WP1-02)

**Files:**
- Create: `lib/domain/raw-fact-schema.ts`
- Create: `lib/domain/context-resolver.ts`
- Create: `lib/domain/scenario-resolver.ts`
- Create: `tests/fixtures/raw-claims.ts`
- Create: `tests/domain/context-resolver.test.ts`
- Create: `tests/domain/scenario-resolver.test.ts`
- Modify: `lib/domain/claim-contract.ts`
- Modify: `lib/jurisdiction.ts:1-224`
- Modify: `lib/provider.ts:1-252`
- Modify: `lib/policyScope.ts:1-188`
- Modify: `lib/claimFacts.ts:1-383`

**Interfaces:**
- Consumes: `CanonicalIncident`, `ScenarioId` from Task 1.
- Produces: `RawClaimFacts`, `RAW_FACT_PATHS`, `RawFactPath`, `RawFactValue`, `FactSource`, `FactProvenance`, `FactConflict`, `ClaimState`, `buildResolutionFacts()`, `ResolvedValue<T>`, `ResolvedJurisdiction`, `ResolvedClaimContext`, `ScenarioDecision`, `ScenarioResolution`, `parseRawClaimFacts()`, `resolveClaimContext()`, `resolveScenarioSet()`.

- [ ] **Step 1: Write failing authority and overlap tests**

```ts
it("ignores injected derived regions and recomputes the US route", () => {
  const base = rawFacts({
    incidentType: "airline_cancellation",
    origin: { airport: "JFK", country: "United States" },
    destination: { airport: "LAX", country: "United States" }
  });
  const input: unknown = {
    ...base,
    origin: { ...base.origin, region: "EU_EEA_CH" },
    destination: { ...base.destination, region: "EU_EEA_CH" }
  };
  const parsed = parseRawClaimFacts(input);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error(parsed.errors.join("; "));
  const context = resolveClaimContext({
    state: {
      facts: parsed.data,
      provenance: {},
      revision: 0,
      conflicts: [],
      unresolvedFields: []
    }
  });
  expect(context.jurisdiction.originRegion.value).toBe("US");
  expect(context.jurisdiction.destinationRegion.value).toBe("US");
});

it("activates EU/UK before US for a qualifying Paris to New York cancellation", () => {
  const context = resolvedContext({
    incidentType: "airline_cancellation",
    origin: { airport: "CDG" },
    destination: { airport: "JFK" },
    operatingCarrier: "Air France"
  });
  expect(context.scenarios.scenarioIds).toEqual(["eu_uk_air_disruption", "us_airline_disruption"]);
  expect(context.scenarios.primaryScenario).toBe("eu_uk_air_disruption");
});
```

Also test non-EU carrier inbound EU exclusion, US denied boarding requiring US departure, non-Marriott hotel walk exclusion, and unknown route returning `needs_information` rather than `out_of_scope`. Add JFK→CDG with a normalized carrier whose carrier region is unknown: retain the known-active US decision, add unresolved EU/UK, return public `scenarioIds: []`, and require `operatingCarrier`. Add CDG→unknown destination: retain known-active EU/UK, add unresolved US, and require `destination.airport`. Neither may silently return a partial resolved set. Add prior-state regressions where stored `confirmedHotelReservation: true`, `wasWalked: true`, or `origin.airport: "JFK"` is also named in `unresolvedFields`; scenario admission must see null, return `needs_information`, and preserve the old value only inside `claimState` for fact review.

- [ ] **Step 2: Run tests and confirm the old trusted-region behavior fails**

Run: `npm test -- tests/domain/context-resolver.test.ts tests/domain/scenario-resolver.test.ts`

Expected: FAIL because raw facts still contain trusted region fields and there is no scenario-set resolver.

- [ ] **Step 3: Add the complete raw-fact contract and parser**

Add this exact user-observable shape; it contains no region, carrier region, legal regime, controllability, or scenario ID:

```ts
export type RawLocation = { city: string | null; airport: string | null; country: string | null };

export type AssistanceFacts = {
  refundOffered: boolean | null;
  refundAccepted: boolean | null;
  creditOffered: boolean | null;
  creditAccepted: boolean | null;
  reroutingOffered: boolean | null;
  reroutingAccepted: boolean | null;
  replacementTravelOffered: boolean | null;
  replacementTravelAccepted: boolean | null;
  lodgingOffered: boolean | null;
  lodgingAccepted: boolean | null;
  mealsOffered: boolean | null;
  mealsAccepted: boolean | null;
  groundTransportOffered: boolean | null;
  groundTransportAccepted: boolean | null;
};

export type RawClaimFacts = {
  incidentType: CanonicalIncident | null;
  providerType: "hotel" | "airline" | null;
  provider: string | null;
  brandOrProperty: string | null;
  operatingCarrier: string | null;
  origin: RawLocation;
  destination: RawLocation;
  statedReason: string | null;
  reasonCategory: "crew" | "mechanical" | "oversales" | "weather" |
    "late_inbound_aircraft" | "other_controllable" | "other_uncontrollable" | null;
  userInitiatedChange: boolean | null;
  scheduledFinalArrival: string | null;
  actualFinalArrival: string | null;
  finalArrivalDelayMinutes: number | null;
  isOvernight: boolean | null;
  cancellationNoticeHours: number | null;
  assistance: AssistanceFacts;
  deniedBoardingKind: "voluntary" | "involuntary" | null;
  oversalesConfirmed: boolean | null;
  confirmedReservation: boolean | null;
  checkedInOnTime: boolean | null;
  atGateOnTime: boolean | null;
  documentsCompliant: boolean | null;
  replacementArrivalDelayMinutes: number | null;
  confirmedHotelReservation: boolean | null;
  qualifyingHotelReservation: boolean | null;
  bookingChannel: "direct" | "ota" | "portal" | null;
  loyaltyStatus: string | null;
  membershipAttached: boolean | null;
  wasWalked: boolean | null;
  replacementLodgingProvided: boolean | null;
  expenses: string[];
  evidence: string[];
  userGoal: string | null;
};
```

Declare the exact path literal below. `RawFactValue` is `string | number | boolean | string[]`. `emptyRawClaimFacts()` returns every nullable leaf as `null`, locations with three null leaves, assistance with 14 null leaves, and arrays empty.

```ts
export const RAW_FACT_PATHS = [
  "incidentType", "providerType", "provider", "brandOrProperty", "operatingCarrier",
  "origin.city", "origin.airport", "origin.country",
  "destination.city", "destination.airport", "destination.country",
  "statedReason", "reasonCategory", "userInitiatedChange", "scheduledFinalArrival",
  "actualFinalArrival", "finalArrivalDelayMinutes", "isOvernight",
  "cancellationNoticeHours", "assistance.refundOffered", "assistance.refundAccepted",
  "assistance.creditOffered", "assistance.creditAccepted", "assistance.reroutingOffered",
  "assistance.reroutingAccepted", "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted", "assistance.lodgingOffered",
  "assistance.lodgingAccepted", "assistance.mealsOffered", "assistance.mealsAccepted",
  "assistance.groundTransportOffered", "assistance.groundTransportAccepted",
  "deniedBoardingKind", "oversalesConfirmed", "confirmedReservation",
  "checkedInOnTime", "atGateOnTime", "documentsCompliant",
  "replacementArrivalDelayMinutes", "confirmedHotelReservation",
  "qualifyingHotelReservation", "bookingChannel", "loyaltyStatus", "membershipAttached",
  "wasWalked", "replacementLodgingProvided", "expenses", "evidence", "userGoal"
] as const;
export type RawFactPath = (typeof RAW_FACT_PATHS)[number];
export type RawFactValue = string | number | boolean | string[];
```

`parseRawClaimFacts(value)` is a discriminated `{ success: true; data } | { success: false; errors }` parser. It copies only `RAW_FACT_PATHS`, ignores injected derived/unknown keys, trims bounded strings, preserves `false` and `0`, validates non-negative integer minute/hour values, deduplicates string arrays without mutation, and returns all validation errors. The strict model patch schema in Task 3 instead uses `additionalProperties: false`.

Create the sole eligibility/read mask:

```ts
export function buildResolutionFacts(state: ClaimState): RawClaimFacts {
  let facts = structuredClone(state.facts);
  for (const path of state.unresolvedFields) {
    facts = writeResolutionPath(
      facts,
      path,
      path === "expenses" || path === "evidence" ? [] : null
    );
  }
  return facts;
}
```

`writeResolutionPath()` accepts only `RAW_FACT_PATHS`, supports only the declared top-level or one-level nested paths, returns a fresh object, and throws `invalid_raw_fact_path` for anything else. It never changes `ClaimState`: scalar/enum/boolean/number/location fields named unresolved become null only in this derived copy; the two array fields become empty arrays. `resolveClaimContext()` calls `buildResolutionFacts()` exactly once, passes that copy to provider, airport/country, carrier-region, controllability, jurisdiction, and scenario resolvers, and stores it as `context.resolutionFacts`. A source scan test rejects direct `context.raw.facts`/`input.raw.facts` reads in resolver/evaluator modules outside the mask implementation.

```ts
export type ResolvedValue<T> = {
  value: T;
  source:
    | "provider_registry"
    | "airport_registry"
    | "country_rule"
    | "carrier_registry"
    | "reason_rule"
    | "scenario_rule"
    | "insufficient_facts";
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type ResolvedClaimContext = {
  raw: ClaimState;
  resolutionFacts: RawClaimFacts;
  normalizedProvider: ResolvedValue<string | null>;
  normalizedOperatingCarrier: ResolvedValue<string | null>;
  jurisdiction: ResolvedJurisdiction;
  controllability: ResolvedValue<"controllable" | "uncontrollable" | "unknown">;
  scenarios: ScenarioResolution;
};
```

- [ ] **Step 4: Implement authoritative context and scenario resolution**

Move existing airport/country/carrier tables behind resolver helpers. The public parser copies only allowlisted raw fields, so injected derived keys are discarded. Freeze the resolver input and decision rules:

```ts
export type ResolvedContextWithoutScenarios = Omit<ResolvedClaimContext, "scenarios">;

export function resolveClaimContext(input: {
  state: ClaimState;
}): ResolvedClaimContext;

export function resolveScenarioSet(input: ResolvedContextWithoutScenarios): ScenarioResolution {
  const facts = input.resolutionFacts;
  const originRegion = input.jurisdiction.originRegion.value;
  const destinationRegion = input.jurisdiction.destinationRegion.value;
  const decisions: ScenarioDecision[] = [];

  if (facts.incidentType === "hotel_walk") {
    if (!facts.provider && !facts.brandOrProperty) {
      return needsInformation("marriott_hotel_walk", ["provider"]);
    }
    if (input.normalizedProvider.value !== "Marriott") return outOfScope("marriott_hotel_walk");
    const admissionCandidates: Array<RawFactPath | null> = [
      facts.confirmedHotelReservation === null ? "confirmedHotelReservation" : null,
      facts.wasWalked === null ? "wasWalked" : null
    ];
    const admissionMissing = admissionCandidates.filter(
      (path): path is RawFactPath => path !== null
    );
    if (admissionMissing.length > 0) {
      return needsInformation("marriott_hotel_walk", admissionMissing);
    }
    if (!facts.confirmedHotelReservation || !facts.wasWalked) {
      return outOfScope("marriott_hotel_walk");
    }
    return resolved(["marriott_hotel_walk"]);
  }
  if (facts.incidentType === "denied_boarding") {
    if (originRegion === null) return needsInformation("us_denied_boarding", ["origin.airport"]);
    return originRegion === "US"
      ? resolved(["us_denied_boarding"])
      : outOfScope("us_denied_boarding");
  }
  if (facts.incidentType !== "airline_delay" && facts.incidentType !== "airline_cancellation") {
    return needsInformation("us_airline_disruption", ["incidentType"]);
  }

  const euUkActive =
    input.jurisdiction.eu261.value === "applies" ||
    input.jurisdiction.uk261.value === "applies";
  const usActive = originRegion === "US" || destinationRegion === "US";
  if (euUkActive) {
    decisions.push(activeDecision("eu_uk_air_disruption"));
  }
  if (usActive) {
    decisions.push(activeDecision("us_airline_disruption"));
  }
  const unresolvedDecisions: ScenarioDecision[] = [];
  if (!euUkActive && (
    input.jurisdiction.eu261.value === "unknown" ||
    input.jurisdiction.uk261.value === "unknown"
  )) {
    unresolvedDecisions.push(unresolvedDecision(
      "eu_uk_air_disruption",
      missingRouteOrCarrierPaths(input)
    ));
  }
  if (!usActive && (originRegion === null || destinationRegion === null)) {
    unresolvedDecisions.push(unresolvedDecision(
      "us_airline_disruption",
      missingUsRoutePaths(input)
    ));
  }
  if (unresolvedDecisions.length > 0) {
    return unresolvedParallelScenarios(decisions, unresolvedDecisions);
  }
  if (decisions.length > 0) {
    const scenarioIds = decisions.map((decision) => decision.scenarioId);
    return { status: "resolved", scenarioIds, primaryScenario: scenarioIds[0], decisions, missingFacts: [] };
  }
  return outOfScope("us_airline_disruption");
}
```

Use these pure constructors; they inspect no external state:

```ts
function activeDecision(scenarioId: ScenarioId): ScenarioDecision {
  return { scenarioId, status: "active", reasons: ["admission_rule_matched"], missingFacts: [] };
}

function unresolvedDecision(
  scenarioId: ScenarioId,
  missingFacts: RawFactPath[]
): ScenarioDecision {
  if (missingFacts.length === 0) throw new Error("unresolved_scenario_requires_missing_fact");
  return {
    scenarioId,
    status: "unresolved",
    reasons: ["parallel_scenario_admission_unknown"],
    missingFacts: [...new Set(missingFacts)]
  };
}

function unresolvedParallelScenarios(
  active: ScenarioDecision[],
  unresolved: ScenarioDecision[]
): ScenarioResolution {
  const missingFacts = [...new Set(unresolved.flatMap((decision) => decision.missingFacts))];
  return {
    status: "needs_information",
    scenarioIds: [],
    primaryScenario: null,
    decisions: [...active, ...unresolved],
    missingFacts
  };
}

function resolved(scenarioIds: ScenarioId[]): ScenarioResolution {
  if (scenarioIds.length === 0) throw new Error("resolved_scenario_set_cannot_be_empty");
  return {
    status: "resolved",
    scenarioIds,
    primaryScenario: scenarioIds[0],
    decisions: scenarioIds.map(activeDecision),
    missingFacts: []
  };
}

function needsInformation(scenarioId: ScenarioId, paths: RawFactPath[]): ScenarioResolution {
  const missingFacts = [...new Set(paths)];
  return {
    status: "needs_information",
    scenarioIds: [],
    primaryScenario: null,
    decisions: [{ scenarioId, status: "unresolved", reasons: ["required_admission_fact_missing"], missingFacts }],
    missingFacts
  };
}

function outOfScope(scenarioId: ScenarioId): ScenarioResolution {
  return {
    status: "out_of_scope",
    scenarioIds: [],
    primaryScenario: null,
    decisions: [{ scenarioId, status: "excluded", reasons: ["admission_rule_not_matched"], missingFacts: [] }],
    missingFacts: []
  };
}

function missingRouteOrCarrierPaths(input: ResolvedContextWithoutScenarios): RawFactPath[] {
  const paths: RawFactPath[] = [];
  if (input.jurisdiction.originRegion.value === null) paths.push("origin.airport");
  if (input.jurisdiction.destinationRegion.value === null) paths.push("destination.airport");
  if (
    (input.jurisdiction.eu261.value === "unknown" || input.jurisdiction.uk261.value === "unknown") &&
    input.jurisdiction.operatingCarrierRegion.value === null
  ) paths.push("operatingCarrier");
  return [...new Set(paths)];
}

function missingUsRoutePaths(input: ResolvedContextWithoutScenarios): RawFactPath[] {
  const paths: RawFactPath[] = [];
  if (input.jurisdiction.originRegion.value === null) paths.push("origin.airport");
  if (input.jurisdiction.destinationRegion.value === null) paths.push("destination.airport");
  return paths;
}
```

EU261/UK261 applicability is tri-state: outbound qualifying region applies; inbound requires a matching EU/UK operating-carrier region; absent route/carrier information remains `unknown`, never false. Air disruption resolution is complete-set conservative: a known-active US or EU/UK decision does not hide another still-unresolved parallel scenario. While any possible parallel scenario is unresolved, public `scenarioIds` stays empty and `decisions` retains both the known-active and unresolved explanations. Ensure `resolveClaimContext()` calls the fact mask, provider, jurisdiction, carrier-region, controllability, then scenario resolution in that order. Keep `lib/claimFacts.ts` as a compatibility façade that converts legacy `ClaimFacts` into raw facts without preserving supplied derived fields.

- [ ] **Step 5: Run injection, route, and regression tests**

Run: `npm test -- tests/domain/context-resolver.test.ts tests/domain/scenario-resolver.test.ts tests/regional-policy.test.ts && npm run verify`

Expected: all tests PASS; changing display order cannot change the active set.

- [ ] **Step 6: Commit the trust boundary**

```bash
git add lib/domain/claim-contract.ts lib/domain/raw-fact-schema.ts lib/domain/context-resolver.ts lib/domain/scenario-resolver.ts lib/jurisdiction.ts lib/provider.ts lib/policyScope.ts lib/claimFacts.ts tests/fixtures/raw-claims.ts tests/domain/context-resolver.test.ts tests/domain/scenario-resolver.test.ts
git commit -m "refactor: derive claim context on the server"
```

### Task 3: Implement Patch Merge, Provenance, and Revision Semantics (WP1-03)

**Files:**
- Modify: `lib/domain/raw-fact-schema.ts`
- Create: `lib/domain/fact-merge.ts`
- Create: `lib/model/raw-fact-extractor.ts`
- Create: `lib/api/analyze-contract.ts`
- Create: `tests/domain/fact-merge.test.ts`
- Create: `tests/model/raw-fact-extractor.test.ts`
- Modify: `lib/domain/claim-contract.ts`
- Modify: `lib/intake.ts:19-330`
- Modify: `lib/llm.ts:1-284`
- Modify: `app/api/intake/route.ts:1-31`

**Interfaces:**
- Consumes: `RawClaimFacts`, `ResolvedClaimContext`, `FactSource`, `FactProvenance`, and `FactConflict` from Task 2.
- Produces: `RawFactPatch`, `UserFactEdit`, `MergeRawFactsInput`, `MergeRawFactsResult`, `mergeRawFacts()`, `RawFactExtractor`, `AnalyzeClaimRequest`, `AnalyzeClaimIntakeResponse`.

- [ ] **Step 1: Write failing merge and extractor tests**

Test all six merge rules with explicit values, including `false` and `0`:

```ts
it("uses explicit clear but treats model null as no update", () => {
  const prior = claimState({ deniedBoardingKind: "voluntary", finalArrivalDelayMinutes: 240 }, 3);
  const result = mergeRawFacts({
    prior,
    correction: { set: {}, clear: ["deniedBoardingKind"] },
    deterministicPatch: { set: { finalArrivalDelayMinutes: null } },
    openaiPatch: { set: { deniedBoardingKind: null } },
    baseRevision: 3
  });
  expect(result.state.facts.deniedBoardingKind).toBeNull();
  expect(result.state.facts.finalArrivalDelayMinutes).toBe(240);
  expect(result.state.revision).toBe(4);
  expect(result.changedFields).toEqual(["deniedBoardingKind"]);
});

it("marks conflicting current-turn candidates unresolved", () => {
  const result = mergeRawFacts({
    prior: claimState(),
    deterministicPatch: { set: { deniedBoardingKind: "voluntary" } },
    openaiPatch: { set: { deniedBoardingKind: "involuntary" } },
    baseRevision: 0
  });
  expect(result.conflicts[0]?.field).toBe("deniedBoardingKind");
  expect(result.unresolvedFields).toContain("deniedBoardingKind");
  expect(result.state.facts.deniedBoardingKind).toBeNull();
});
```

Add cases for Paris→London correction, user correction overriding both extractors, preserved `false`/`0`, preserved expenses/evidence/goal, rejected stale `baseRevision`, echoed `baseRevision`, duplicate/unknown clear paths, correction `set` with null rejected in favor of `clear`, and conflict blocking use of an older value. Output token and oversized model-response tests belong to Plan C Task 2.

Add a two-turn stateless regression: turn one creates a `deniedBoardingKind` extractor conflict while an older stored value is present; turn two passes only `turnOne.state` as `prior` and updates an unrelated fact. Assert the conflict and unresolved path remain in `ClaimState`, `buildResolutionFacts(turnTwo.state).deniedBoardingKind === null`, and only an explicit correction or a later single accepted candidate removes that conflict. Task 4 proves the masked value cannot satisfy a remedy condition.

Add a route-level two-turn correction regression: submit an anonymous initial message, then send its returned `claimState` with `{ message: "", correction: { set: { deniedBoardingKind: "involuntary" }, clear: [] } }`. At this Task 3 intake-contract checkpoint, assert both extractor spies remain at their first-turn call counts, the intake response base/state revision invariants hold, and no prior narrative is stored or replayed. Task 5 adds the final domain-result metadata assertion after `AssessmentResult` exists.

- [ ] **Step 2: Verify tests fail on complete-object merge**

Run: `npm test -- tests/domain/fact-merge.test.ts tests/model/raw-fact-extractor.test.ts`

Expected: FAIL because current intake returns complete `ClaimFacts`, retains stale values, and has no revision or patch schema.

- [ ] **Step 3: Implement path-safe merge helpers and precedence**

```ts
export function mergeRawFacts(input: MergeRawFactsInput): MergeRawFactsResult {
  if (input.prior.revision !== input.baseRevision) {
    throw new Error("stale_base_revision");
  }
  let facts = structuredClone(input.prior.facts);
  const provenance = { ...input.prior.provenance };
  let conflicts = input.prior.conflicts.map((conflict) => ({
    ...conflict,
    candidates: conflict.candidates.map((candidate) => ({ ...candidate }))
  }));
  const unresolved = new Set(input.prior.unresolvedFields);
  const changed = new Set<RawFactPath>();

  for (const path of input.correction?.clear ?? []) {
    facts = writeFactPath(facts, path, clearedValue(path));
    provenance[path] = { source: "user_correction", factsRevision: input.baseRevision + 1 };
    resolveConflict(path);
    changed.add(path);
  }
  for (const [path, value] of patchEntries({ set: input.correction?.set ?? {} })) {
    if (value !== null) applyCandidate(path, value, "user_correction");
  }
  for (const path of allPatchPaths(input.deterministicPatch, input.openaiPatch)) {
    if (changed.has(path)) continue;
    const deterministic = readPatchValue(input.deterministicPatch, path);
    const openai = readPatchValue(input.openaiPatch, path);
    if (deterministic !== null && openai !== null && !isEqual(deterministic, openai)) {
      conflicts = conflicts.filter(({ field }) => field !== path);
      conflicts.push({ field: path, candidates: [
        { value: deterministic, source: "deterministic_extraction" },
        { value: openai, source: "openai_extraction" }
      ] });
      unresolved.add(path);
      changed.add(path);
      continue;
    }
    const value = openai ?? deterministic;
    if (value !== null) applyCandidate(path, value, openai !== null ? "openai_extraction" : "deterministic_extraction");
  }

  return {
    state: {
      facts,
      provenance,
      revision: changed.size > 0 ? input.baseRevision + 1 : input.baseRevision,
      conflicts,
      unresolvedFields: RAW_FACT_PATHS.filter((path) => unresolved.has(path))
    },
    baseRevision: input.baseRevision,
    conflicts,
    unresolvedFields: RAW_FACT_PATHS.filter((path) => unresolved.has(path)),
    changedFields: [...changed]
  };

  function applyCandidate(path: RawFactPath, value: unknown, source: FactSource) {
    facts = writeFactPath(facts, path, value as RawFactValue);
    provenance[path] = { source, factsRevision: input.baseRevision + 1 };
    resolveConflict(path);
    changed.add(path);
  }

  function resolveConflict(path: RawFactPath) {
    conflicts = conflicts.filter(({ field }) => field !== path);
    unresolved.delete(path);
  }
}
```

Implement the helpers with these exact contracts:

```ts
const RAW_FACT_PATH_SET: ReadonlySet<string> = new Set(RAW_FACT_PATHS);

function patchEntries(patch: RawFactPatch): Array<[RawFactPath, RawFactValue | null]> {
  return Object.entries(patch.set).map(([path, value]) => {
    if (!RAW_FACT_PATH_SET.has(path)) throw new Error("invalid_raw_fact_path");
    return [path as RawFactPath, value ?? null];
  });
}

function readPatchValue(patch: RawFactPatch | undefined, path: RawFactPath): RawFactValue | null {
  if (!patch || !Object.prototype.hasOwnProperty.call(patch.set, path)) return null;
  return patch.set[path] ?? null;
}

function allPatchPaths(...patches: Array<RawFactPatch | undefined>): RawFactPath[] {
  return RAW_FACT_PATHS.filter((path) =>
    patches.some((patch) => patch && Object.prototype.hasOwnProperty.call(patch.set, path))
  );
}

function clearedValue(path: RawFactPath): RawFactValue | null {
  return path === "expenses" || path === "evidence" ? [] : null;
}

function isEqual(left: RawFactValue, right: RawFactValue): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

function writeFactPath(
  facts: RawClaimFacts,
  path: RawFactPath,
  value: RawFactValue | null
): RawClaimFacts {
  if (!RAW_FACT_PATH_SET.has(path)) throw new Error("invalid_raw_fact_path");
  const [parent, leaf, extra] = path.split(".");
  if (extra) throw new Error("invalid_raw_fact_depth");
  if (!leaf) return { ...facts, [parent]: value } as RawClaimFacts;
  if (parent !== "origin" && parent !== "destination" && parent !== "assistance") {
    throw new Error("invalid_raw_fact_parent");
  }
  const nestedParent: "origin" | "destination" | "assistance" = parent;
  return {
    ...facts,
    [nestedParent]: { ...facts[nestedParent], [leaf]: value }
  } as RawClaimFacts;
}

export function parseRawFactPatch(value: unknown):
  | { success: true; data: RawFactPatch }
  | { success: false; errors: string[] };
```

`parseRawFactPatch()` uses a strict JSON Schema whose `set` object has only the exact dotted `RAW_FACT_PATHS` properties, `additionalProperties: false`, per-path value types, and null as “no new value”. When a conflict occurs, the old value remains stored for review but `unresolvedFields` prevents it from satisfying a condition until a user correction resolves the field.

- [ ] **Step 4: Convert local and OpenAI extraction to allowlisted patches**

`RawFactExtractor.extract()` receives the current message and bounded co-reference facts and returns `RawFactPatch`. `processClaimTurn()` invokes it only when `correction` is absent. A correction-only turn supplies empty deterministic/OpenAI patches and calls `mergeRawFacts()` with the explicit correction; it never reuses a prior narrative or performs either extraction. Plan C Task 3 later inserts deterministic redaction before any OpenAI call, and Plan C Task 2 adds the `max_output_tokens` transport bound. Do not remove the DeepSeek class, but public routes in this task instantiate Local extraction only until Plan C Tasks 2-5 install privacy, error, access, and limit gates.

```ts
export interface RawFactExtractor {
  readonly provider: ExtractionProvider;
  readonly model: "gpt-5.6-luna" | null;
  extract(input: RawFactExtractionInput): Promise<RawFactPatch>;
}

export interface RawFactExtractionInput {
  message: string;
  prior: Pick<RawClaimFacts,
    | "incidentType"
    | "provider"
    | "operatingCarrier"
    | "origin"
    | "destination"
    | "reasonCategory"
    | "finalArrivalDelayMinutes"
    | "deniedBoardingKind">;
  unresolvedFields: RawFactPath[];
}
```

The caller copies `request.prior.unresolvedFields` into `RawFactExtractionInput.unresolvedFields`; it never reconstructs unresolved state from the current message. An untouched prior conflict survives byte-for-byte. An explicit user clear/set or one accepted deterministic/OpenAI value for that same path removes the old conflict; a fresh extractor disagreement replaces it with the current candidates.

- [ ] **Step 5: Return revision-safe intake results**

Create the exact `AnalyzeClaimRequest`/`AnalyzeClaimIntakeResponse` types frozen above; do not reference Task 5 assessment types yet. Update intake and route responses to echo `baseRevision`, return the complete `claimState`, and use `needs_information`. Validate `request.baseRevision === request.prior.revision`, the exclusive message/correction intent rule, and at least one correction set/clear operation. Keep a compatibility adapter for the current page until Task 5 replaces the intake response with the domain response and Plan B Task 1 moves that adapter to the page boundary; Plan B Task 2 then removes it. The server stays stateless and never stores or increments a revision outside the response.

- [ ] **Step 6: Run merge, adapter, and intake regression**

Run: `npm test -- tests/domain/fact-merge.test.ts tests/model/raw-fact-extractor.test.ts tests/intake.test.ts tests/intake-evals.test.ts && npm run verify`

Expected: all tests PASS; model schema contains raw patch fields only; public routes remain Local-only pending Plan C gates.

- [ ] **Step 7: Commit revision-safe fact intake**

```bash
git add lib/domain/claim-contract.ts lib/domain/raw-fact-schema.ts lib/domain/fact-merge.ts lib/model/raw-fact-extractor.ts lib/api/analyze-contract.ts lib/intake.ts lib/llm.ts app/api/intake/route.ts tests/domain/fact-merge.test.ts tests/model/raw-fact-extractor.test.ts tests/intake.test.ts tests/intake-evals.test.ts
git commit -m "refactor: merge revisioned raw fact patches"
```

### Task 4: Implement Four Scenario Condition Matrices (WP1-04)

**Files:**
- Create: `lib/domain/scenario-evaluator.ts`
- Create: `lib/domain/evaluators/marriott-hotel-walk.ts`
- Create: `lib/domain/evaluators/us-airline-disruption.ts`
- Create: `lib/domain/evaluators/us-denied-boarding.ts`
- Create: `lib/domain/evaluators/eu-uk-air-disruption.ts`
- Create: `tests/domain/scenario-evaluators.test.ts`
- Modify: `lib/domain/claim-contract.ts`

**Interfaces:**
- Consumes: `ResolvedClaimContext`, active `ScenarioId` set.
- Produces: `RemedyId`, `ConditionId`, `ConditionResult`, `RemedyConditionEvaluation`, `ScenarioConditionEvaluation`, `ScenarioEvaluator`, four named evaluator instances, `evaluateScenarioConditions()`.

Every evaluator reads eligibility values only from `context.resolutionFacts`; `context.raw.facts` is presentation/review state and is forbidden in a condition predicate. The Task 2 source-scan test covers these evaluator files as they are added.

- [ ] **Step 1: Write a table-driven failing decision matrix**

```ts
type EvaluatorFixture = {
  name: string;
  scenario: ScenarioId;
  facts: RawClaimFacts;
  remedyId: RemedyId;
  missing?: ConditionId;
  excluded?: ConditionId;
};

const fixtures: EvaluatorFixture[] = [
  { name: "Marriott missing membership", scenario: "marriott_hotel_walk", facts: rawFacts({ membershipAttached: null }), remedyId: "hotel_guarantee_compensation", missing: "membership_attached" },
  { name: "US weather cancellation", scenario: "us_airline_disruption", facts: rawFacts({ incidentType: "airline_cancellation", reasonCategory: "weather" }), remedyId: "us_hotel", excluded: "controllable_disruption" },
  { name: "voluntary bump", scenario: "us_denied_boarding", facts: rawFacts({ incidentType: "denied_boarding", deniedBoardingKind: "voluntary" }), remedyId: "denied_boarding_compensation", excluded: "involuntary_boarding" },
  { name: "20 minute EU delay", scenario: "eu_uk_air_disruption", facts: rawFacts({ incidentType: "airline_delay", finalArrivalDelayMinutes: 20 }), remedyId: "eu_uk_fixed_compensation", excluded: "three_hour_arrival_delay" }
];

it.each(fixtures)("evaluates $name", ({ scenario, facts, remedyId, missing, excluded }) => {
  const result = evaluatorFor(scenario).evaluateConditions(resolvedContext(facts));
  const remedy = result.remedies.find((item) => item.remedyId === remedyId);
  expect(remedy).toBeDefined();
  if (missing) expect(remedy?.missingConditions.map(({ id }) => id)).toContain(missing);
  if (excluded) expect(remedy?.exclusions.map(({ id }) => id)).toContain(excluded);
});
```

Add supported/needs-information/not-applicable fixtures for every scenario and one dual US+EU route fixture. Reuse Task 3's two-turn boarding conflict and assert the unresolved old `deniedBoardingKind` becomes a missing condition rather than satisfying voluntary or involuntary boarding.

- [ ] **Step 2: Verify the matrix fails against free-text policy conditions**

Run: `npm test -- tests/domain/scenario-evaluators.test.ts`

Expected: FAIL because `applicable_conditions` are not executed and current strength depends on policy presence.

- [ ] **Step 3: Implement explicit condition results**

```ts
export type RemedyId =
  | "hotel_relocation"
  | "hotel_transport"
  | "hotel_guarantee_compensation"
  | "us_refund"
  | "us_rerouting"
  | "us_meal"
  | "us_hotel"
  | "us_ground_transport"
  | "voluntary_bump_offer"
  | "denied_boarding_written_rights"
  | "denied_boarding_compensation"
  | "eu_uk_care"
  | "eu_uk_refund_or_rerouting"
  | "eu_uk_fixed_compensation";

export type ConditionId =
  | "confirmed_hotel_reservation" | "reservation_not_honored" | "qualifying_reservation"
  | "membership_attached" | "qualifying_booking_channel" | "replacement_lodging_missing"
  | "us_route" | "delay_or_cancellation" | "traveler_did_not_initiate"
  | "refund_alternative_declined" | "controllable_disruption" | "overnight_disruption"
  | "matching_carrier_commitment" | "us_departure" | "oversales" | "confirmed_reservation"
  | "timely_check_in" | "timely_gate" | "documents_compliant" | "voluntary_boarding"
  | "involuntary_boarding" | "replacement_arrival_delay" | "qualifying_route_and_carrier"
  | "care_delay_threshold" | "five_hour_delay" | "three_hour_arrival_delay"
  | "cancellation_notice" | "alternative_accepted" | "extraordinary_circumstances";

export type ConditionResult = {
  id: ConditionId;
  label: string;
  status: "matched" | "missing" | "excluded";
  factFields: RawFactPath[];
};

export type RemedyConditionEvaluation = {
  remedyId: RemedyId;
  material: boolean;
  matchedConditions: ConditionResult[];
  missingConditions: ConditionResult[];
  exclusions: ConditionResult[];
};

export type ScenarioConditionEvaluation = {
  scenarioId: ScenarioId;
  remedies: RemedyConditionEvaluation[];
};

export interface ScenarioEvaluator {
  readonly scenarioId: ScenarioId;
  evaluateConditions(context: ResolvedClaimContext): ScenarioConditionEvaluation;
}

export const marriottHotelWalkEvaluator: ScenarioEvaluator;
export const usAirlineDisruptionEvaluator: ScenarioEvaluator;
export const usDeniedBoardingEvaluator: ScenarioEvaluator;
export const euUkAirDisruptionEvaluator: ScenarioEvaluator;

export function evaluatorFor(scenarioId: ScenarioId): ScenarioEvaluator;
export function evaluateScenarioConditions(
  context: ResolvedClaimContext
): ScenarioConditionEvaluation[];
```

Define `RemedyId` with the fourteen IDs in Task 5. Define exact condition IDs:

```ts
export const CONDITION_IDS = {
  marriott: ["confirmed_hotel_reservation", "reservation_not_honored", "qualifying_reservation", "membership_attached", "qualifying_booking_channel", "replacement_lodging_missing"],
  usDisruption: ["us_route", "delay_or_cancellation", "traveler_did_not_initiate", "refund_alternative_declined", "controllable_disruption", "overnight_disruption", "matching_carrier_commitment"],
  usDeniedBoarding: ["us_departure", "oversales", "confirmed_reservation", "timely_check_in", "timely_gate", "documents_compliant", "voluntary_boarding", "involuntary_boarding", "replacement_arrival_delay"],
  euUkDisruption: ["qualifying_route_and_carrier", "delay_or_cancellation", "care_delay_threshold", "five_hour_delay", "three_hour_arrival_delay", "cancellation_notice", "alternative_accepted", "extraordinary_circumstances"]
} as const;
```

Implement the matrix below literally; `missing` means the required fact is null/unresolved, `excluded` means a known value defeats only that remedy, and `matched` means the predicate is true:

| Remedy | Required predicates | Known exclusion |
|---|---|---|
| `hotel_relocation` | Marriott scenario, confirmed hotel reservation, actual walk | reservation false or walk false |
| `hotel_transport` | relocation predicates, replacement lodging not already provided | replacement lodging already provided |
| `hotel_guarantee_compensation` | confirmed/qualifying reservation, actual walk, membership attached, booking channel direct or portal | non-qualifying reservation, no attached membership, or OTA booking |
| `us_refund` | US disruption, traveler did not initiate, cancellation or qualifying significant change, refund/rerouting not accepted | user-initiated change or accepted alternative |
| `us_rerouting` | US disruption, traveler did not initiate, delay/cancellation, rerouting not accepted | user-initiated change or accepted rerouting |
| `us_meal` | controllable disruption | uncontrollable reason; Task 5 appends the exact carrier-record condition |
| `us_hotel` | controllable and overnight disruption | uncontrollable or non-overnight; Task 5 appends the carrier condition |
| `us_ground_transport` | controllable and overnight disruption | uncontrollable or non-overnight; Task 5 appends the carrier condition |
| `voluntary_bump_offer` | voluntary denied boarding | known involuntary boarding |
| `denied_boarding_written_rights` | involuntary oversales from US | voluntary boarding, non-oversales, or non-US departure |
| `denied_boarding_compensation` | written-rights predicates, confirmed reservation, timely check-in/gate, compliant documents, replacement arrival delay | failure of any prerequisite; delay determines compensation tier rather than admission |
| `eu_uk_care` | qualifying scope plus cancellation, or delay at least 120 minutes | delay below 120 minutes |
| `eu_uk_refund_or_rerouting` | qualifying scope plus cancellation, or delay at least 300 minutes, and no accepted alternative | delay below 300 minutes or accepted alternative |
| `eu_uk_fixed_compensation` | qualifying scope; delay at least 180 minutes or qualifying late cancellation; no extraordinary circumstance | short delay, timely cancellation notice, or extraordinary circumstance |

For `eu_uk_care`, a delay from 120 through 239 minutes remains `conditional` because distance-dependent thresholds are not in the frozen raw contract; 240 minutes or a cancellation can be assessed without guessing distance. Cancellation fixed compensation remains `conditional` unless notice and alternative-offer facts are sufficient. Weather maps controllability to an exclusion only for controllable carrier-care/fixed-compensation remedies; it never excludes reason-independent US refund analysis. Voluntary bumping excludes involuntary compensation but activates negotiation. Every predicate names its `RawFactPath`; conflicts force `missing` even when an older stored value exists. Task 4 has no knowledge dependency: it emits no matched `matching_carrier_commitment`; Task 5, after Plan C Task 6, appends that condition from a validated exact record before computing status.

- [ ] **Step 4: Run scenario and context tests**

Run: `npm test -- tests/domain/scenario-evaluators.test.ts tests/domain/scenario-resolver.test.ts && npm run verify`

Expected: all scenario matrices PASS and dual-scenario results retain both evaluator outputs.

- [ ] **Step 5: Commit condition matrices**

```bash
git add lib/domain/claim-contract.ts lib/domain/scenario-evaluator.ts lib/domain/evaluators/marriott-hotel-walk.ts lib/domain/evaluators/us-airline-disruption.ts lib/domain/evaluators/us-denied-boarding.ts lib/domain/evaluators/eu-uk-air-disruption.ts tests/domain/scenario-evaluators.test.ts
git commit -m "feat: evaluate four claim scenario matrices"
```

### Task 5: Replace Claim Strength with Per-Remedy Assessment (WP1-05)

**Files:**
- Create: `lib/domain/remedy-assessment.ts`
- Create: `lib/domain/policy-applicability.ts`
- Create: `lib/claim-workflow.ts`
- Create: `tests/fixtures/knowledge.ts`
- Create: `tests/fixtures/workflow.ts`
- Create: `tests/domain/remedy-assessment.test.ts`
- Create: `tests/api/analyze-contract.test.ts`
- Modify: `lib/domain/claim-contract.ts`
- Modify: `lib/api/analyze-contract.ts`
- Modify: `lib/generator.ts:559-653`
- Modify: `lib/analyze.ts:42-109`
- Modify: `lib/types.ts:225-244`
- Modify: `app/api/analyze/route.ts:11-71`
- Modify: `app/page.tsx:1-599`

**Interfaces:**
- Consumes: scenario conditions from Task 4 and `CarrierCommitment` records from Plan C Task 6.
- Produces: `ProviderCommitmentEvidence`, `RemedyAssessment`, `RequestOption`, `assessPolicyApplicability()`, `regimesFromApplicability()`, `buildUnrankedRetrievalTrace()`, `evaluateActiveScenarios()`, `AssessmentResult` without `strength`, and the final `AnalyzeClaimDomainResponse`; consumes the fixed `RemedyId` from Task 4.

- [ ] **Step 1: Write failing remedy and carrier-specific tests**

Cover these exact outcomes:

```ts
it("supports United overnight care only from a matching reviewed commitment", async () => {
  const result = await runWorkflowFixture({
    facts: { operatingCarrier: "United", reasonCategory: "crew", isOvernight: true },
    commitments: [carrierCommitmentFixture({ normalizedCarrier: "United", lastChecked: "2026-07-18" })],
    asOf: "2026-07-18"
  });
  expect(remedyById(result, "us_hotel")).toMatchObject({
    status: "supported",
    providerCommitment: {
      normalizedCarrier: "United",
      applicableCarrierRole: "operating_carrier",
      legalRegime: "US_AIRLINE_COMMITMENT",
      commitmentId: expect.any(String)
    }
  });
});

it.each([null, "No Matching Commitment Air"])("does not generalize dashboard care for %s", async (carrier) => {
  const result = await runWorkflowFixture({
    facts: { operatingCarrier: carrier, reasonCategory: "crew", isOvernight: true },
    commitments: [carrierCommitmentFixture({ normalizedCarrier: "United", lastChecked: "2026-07-18" })],
    asOf: "2026-07-18"
  });
  expect(remedyById(result, "us_hotel").status).toBe("conditional");
});
```

Also assert exact outcomes: `membershipAttached: false` makes `hotel_guarantee_compensation` not applicable while `null` makes it conditional; a 20-minute EU delay makes fixed compensation not applicable; weather does not remove US refund; voluntary bump supports negotiation and makes involuntary compensation not applicable; stale carrier records are conditional; a carrier record whose typed event predicate needs an absent wait/overnight/controllability fact is conditional, never supported; every request option links to the same existing remedy/status. Complete Task 3's two-turn route case by asserting the correction-only domain result reports `{ performed: false, provider: null, model: null, notRunReason: "correction_only" }`. Add an API assertion that the canonical response has `claimState`, matching revisions, and no `strength` property at any depth.

- [ ] **Step 2: Run tests and confirm legacy strength semantics fail**

Run: `npm test -- tests/domain/remedy-assessment.test.ts`

Expected: FAIL because current generator emits one `strength` and one primary regime.

- [ ] **Step 3: Add remedy and result contracts**

```ts
export type ProviderCommitmentEvidence = {
  commitmentId: string;
  normalizedCarrier: string;
  applicableCarrierRole: "operating_carrier";
  sourceUrl: string;
  sourceTitle: string;
  sourceProvider: string;
  sourceType: "official_dashboard" | "official_policy";
  legalRegime: "US_AIRLINE_COMMITMENT";
  authority: "medium";
  sourceLastChecked: string;
  conditions: string[];
  rights: string[];
};

export type RemedyAssessment = {
  remedyId: RemedyId;
  scenarioId: ScenarioId;
  title: string;
  material: boolean;
  status: RemedyStatus;
  factsUsed: RawFactPath[];
  matchedConditions: ConditionResult[];
  missingConditions: ConditionResult[];
  exclusions: ConditionResult[];
  sourceIds: string[];
  providerCommitment?: ProviderCommitmentEvidence;
  evidence: { status: "complete" | "partial" | "missing"; held: string[]; missing: string[] };
  requestOptions: RequestOption[];
  cautions: string[];
  nextAction: string;
};

export type RequestOption = {
  tone: "conservative" | "standard" | "assertive";
  remedyId: RemedyId;
  remedyStatus: RemedyStatus;
  text: string;
  sourceIds: string[];
};

export type RankedDisplayItem<T> = {
  item: T;
  reasons: RetrievalMatchReason[];
  score: number;
};

export type PolicyApplicability = {
  policy: Policy;
  status: "applicable" | "conditional" | "not_applicable";
  matchedConditions: string[];
  missingConditions: string[];
  exclusions: string[];
  applicableCarrier: string | null;
};

export type RetrievalTrace = {
  policyApplicability: PolicyApplicability[];
  displayedPolicies: RankedDisplayItem<Policy>[];
  displayedCases: RankedDisplayItem<Case>[];
  displayedScripts: RankedDisplayItem<Script>[];
};

export type FactDisplayItem = {
  path: RawFactPath;
  label: string;
  value: RawFactValue | null;
  provenance: FactProvenance | null;
};

export type ExtractionMetadata =
  | {
      performed: false;
      requestedMode: ExtractionMode;
      provider: null;
      model: null;
      notRunReason: "preflight_guard" | "correction_only";
    }
  | {
      performed: true;
      requestedMode: "gpt";
      provider: "openai";
      model: "gpt-5.6-luna";
    }
  | {
      performed: true;
      requestedMode: "local";
      provider: "local";
      model: null;
    }
  | {
      performed: true;
      requestedMode: "gpt";
      provider: "local";
      model: null;
      fallbackReason: string;
    };

export type AssessmentResult = {
  status: WorkflowStatus;
  primaryScenario: ScenarioId | null;
  scenarioIds: ScenarioId[];
  factsRevision: number;
  factsUsed: FactDisplayItem[];
  missingFacts: RawFactPath[];
  legalRegimes: LegalRegime[];
  extraction: ExtractionMetadata;
  assessments: RemedyAssessment[];
  retrieval: RetrievalTrace;
  cautions: string[];
  nextActions: string[];
};

export type AnalyzeClaimDomainResponse = {
  baseRevision: number;
  claimState: ClaimState;
  result: AssessmentResult;
  context: ResolvedClaimContext | null;
};
```

- [ ] **Step 4: Implement status aggregation without success prediction**

```ts
export function statusFromConditions(input: {
  matched: ConditionResult[];
  missing: ConditionResult[];
  excluded: ConditionResult[];
}): RemedyStatus {
  if (input.excluded.length > 0) return "not_applicable";
  if (input.missing.length > 0) return "conditional";
  return "supported";
}

export function topLevelStatus(remedies: RemedyAssessment[], unresolvedScenario: boolean): WorkflowStatus {
  if (unresolvedScenario) return "needs_information";
  const material = remedies.filter(({ material }) => material);
  if (material.length === 0) return "needs_information";
  return material.every(
    ({ status, missingConditions }) => status === "conditional" && missingConditions.length > 0
  ) ? "needs_information" : "ready";
}
```

Provider-care evaluation queries by normalized carrier, applicable carrier role, incident, controllability, remedy ID, the record's typed predicates, and fixed injected `asOf`; raw eligibility inputs come only from `context.resolutionFacts`. `factsUsed` likewise includes only resolved, actually consumed paths/values; an unresolved stored value remains visible in fact review but never appears as assessment evidence. Records older than 30 days cannot support a remedy. Every predicate is evaluated as `matched`, `missing`, or `excluded`; any missing predicate forces `conditional`, and any excluded predicate makes the provider commitment unavailable. Copy the exact matched record's source title/provider/URL/regime/authority/display conditions/rights into `ProviderCommitmentEvidence`. An umbrella dashboard policy may establish the source category but cannot grant or fill presentation fields for a carrier remedy. Preserve all active scenario assessments; `primaryScenario` is display metadata only.

- [ ] **Step 5: Build complete applicability before any display ranking**

Create `lib/domain/policy-applicability.ts` with the compile-safe foundation Task 7 consumes:

```ts
export function assessPolicyApplicability(
  context: ResolvedClaimContext,
  policies: readonly Policy[]
): PolicyApplicability[];

export function regimesFromApplicability(
  assessments: readonly PolicyApplicability[]
): LegalRegime[];

export function buildUnrankedRetrievalTrace(
  context: ResolvedClaimContext,
  knowledge: KnowledgeSnapshot
): RetrievalTrace;
```

`assessPolicyApplicability()` evaluates every policy against scenario, route, regime, provider, and carrier scope. `regimesFromApplicability()` uses all `applicable` and `conditional` entries, keeps first-seen order, and deduplicates. `buildUnrankedRetrievalTrace()` returns that complete list with all three display arrays empty; it is deliberately presentation-incomplete but domain-complete. Tests prove changing the empty display arrays cannot change remedies or `legalRegimes`. Task 7 replaces only display ranking and never redefines applicability.

Freeze workflow signatures:

```ts
export type ProcessClaimTurnInput = AnalyzeClaimRequest;

export type ProcessClaimDependencies = {
  localExtractor: RawFactExtractor;
  openaiExtractor?: RawFactExtractor;
  knowledgeRepository: KnowledgeRepository;
  now: () => string;
};

export function evaluateActiveScenarios(input: {
  context: ResolvedClaimContext;
  knowledge: KnowledgeSnapshot;
  asOf: string;
}): RemedyAssessment[];

export function processClaimTurn(
  input: ProcessClaimTurnInput,
  dependencies: ProcessClaimDependencies
): Promise<AnalyzeClaimDomainResponse>;
```

`processClaimTurn()` validates base revision, extracts/merges, resolves all derived context from scratch, evaluates every active scenario, evaluates complete policy applicability, builds a retrieval trace, and returns a response whose `claimState.revision === result.factsRevision`. At this checkpoint public dependencies provide Local extraction only; Plan C later adds guarded OpenAI selection.

For `ready` and `needs_information`, `context` is non-null and `result.primaryScenario`/`scenarioIds` come only from that context. For `out_of_scope` and `unsupported_high_risk`, `context` is exactly `null`, `primaryScenario` is null, and `scenarioIds`, `legalRegimes`, assessments, and all retrieval arrays are empty. No blocked response may reuse a derived context from `prior.facts`.

- [ ] **Step 6: Route new results while keeping the current page compilable**

Change `buildAnalysisFromFacts()` to delegate to the new workflow and temporarily expose a compatibility mapper only inside `app/page.tsx`. Plan B Task 1 updates that page-local mapper when the API changes to `AnalysisViewModel`; Plan B Task 2 deletes it while replacing the page composition. Delete `strength` from the canonical result immediately; do not add it to the new contract. The API contract test recursively walks keys to prove it is absent.

- [ ] **Step 7: Run remedy, API, and regression tests**

Run: `npm test -- tests/domain/remedy-assessment.test.ts tests/claimFacts.test.ts tests/regional-policy.test.ts && npm run verify`

Expected: all tests PASS; no canonical API response contains `strength`.

- [ ] **Step 8: Commit remedy assessment**

```bash
git add lib/domain/claim-contract.ts lib/domain/remedy-assessment.ts lib/domain/policy-applicability.ts lib/claim-workflow.ts lib/api/analyze-contract.ts lib/generator.ts lib/analyze.ts lib/types.ts app/api/analyze/route.ts app/page.tsx tests/fixtures/knowledge.ts tests/fixtures/workflow.ts tests/domain/remedy-assessment.test.ts tests/api/analyze-contract.test.ts tests/claimFacts.test.ts tests/regional-policy.test.ts
git commit -m "feat: assess travel remedies by condition"
```

### Task 6: Add Two-Stage High-Risk and Unsupported Guards (WP1-06)

**Files:**
- Create: `lib/domain/safety-guard.ts`
- Create: `tests/domain/safety-guard.test.ts`
- Modify: `lib/claim-workflow.ts`
- Modify: `app/api/intake/route.ts`
- Modify: `app/api/analyze/route.ts`
- Modify: `tests/api/public-scope.test.ts`

**Interfaces:**
- Consumes: `RawClaimFacts`, `WorkflowStatus`.
- Produces: `ScopeGuardDecision`, `projectGuardText()`, `preflightGuard()`, `postMergeGuard()`.

- [ ] **Step 1: Write five-family bilingual failing tests with call spies**

```ts
const riskyMessages = [
  "I swallowed a cleaning chemical at the hotel",
  "There is an active fire and I need emergency help",
  "I was injured and need compensation for medical harm",
  "Tell me how to sue and run the litigation",
  "The hotel lost jewelry worth $50,000",
  "Interpret this complex travel-insurance coverage denial",
  "酒店清洁剂让我中毒了",
  "我在机场受伤需要处理人身伤害",
  "帮我制定起诉航司的诉讼策略",
  "酒店弄丢了价值很高的珠宝",
  "帮我解释复杂的旅行保险拒赔条款"
];

it.each(riskyMessages)("blocks %s before normal analysis", async (message) => {
  const extractor = { provider: "local", model: null, extract: vi.fn() } satisfies RawFactExtractor;
  const repository = { load: vi.fn() } satisfies KnowledgeRepository;
  const response = await processClaimTurn(
    { message, prior: claimState(), baseRevision: 0, requestedMode: "local" },
    { localExtractor: extractor, knowledgeRepository: repository, now: () => "2026-07-18" }
  );
  expect(response.result.status).toBe("unsupported_high_risk");
  expect(response.context).toBeNull();
  expect(response.result.primaryScenario).toBeNull();
  expect(response.result.scenarioIds).toEqual([]);
  expect(response.result.legalRegimes).toEqual([]);
  expect(response.result.extraction).toEqual({
    performed: false,
    requestedMode: "local",
    provider: null,
    model: null,
    notRunReason: "preflight_guard"
  });
  expect(extractor.extract).not.toHaveBeenCalled();
  expect(repository.load).not.toHaveBeenCalled();
  expect(response.result.assessments).toEqual([]);
  expect(response.result.retrieval).toEqual({
    policyApplicability: [], displayedPolicies: [], displayedCases: [], displayedScripts: []
  });
  expect(response.result.missingFacts).toEqual([]);
  expect(response.result.nextActions).toEqual([]);
});
```

Add a post-merge fixture whose direct phrase misses preflight but whose merged `userGoal` reveals litigation; the extractor runs once but repository load remains zero. Add correction-only table rows that use `message: ""` and write high-risk phrases into `statedReason`, `provider`, `evidence`, and `expenses`; both extractors and repository must remain at zero calls. Seed a prior state with facts that would otherwise resolve a frozen scenario and assert the blocked response still has `context: null`, empty scenario/regime arrays, and no reused derived fields. Add negative cases such as “I want to file a DOT complaint”, “I need a meal voucher”, and “酒店不给我房间” to prove normal frozen journeys are not blocked.

- [ ] **Step 2: Run tests and confirm high-risk input currently reaches normal flow**

Run: `npm test -- tests/domain/safety-guard.test.ts tests/api/public-scope.test.ts`

Expected: FAIL because current taxonomy falls back to unknown or a dormant ordinary issue.

- [ ] **Step 3: Implement explicit safety categories and response**

```ts
export type HighRiskCategory =
  | "acute_medical_or_safety"
  | "personal_injury"
  | "litigation_strategy"
  | "significant_property_loss"
  | "complex_insurance";

export type ScopeGuardDecision =
  | { status: "pass" }
  | { status: "unsupported_high_risk"; category: HighRiskCategory; message: string }
  | { status: "out_of_scope"; message: string };

export const HIGH_RISK_RULES: readonly {
  category: HighRiskCategory;
  pattern: RegExp;
  userMessage: string;
}[] = [
  {
    category: "acute_medical_or_safety",
    pattern: /\b(emergency|poison(?:ed|ing)?|overdose|fire|unconscious|cant breathe|cannot breathe)\b|中毒|火灾|昏迷|无法呼吸|急救/iu,
    userMessage: "This may require immediate emergency or medical help; this tool cannot analyze it as an ordinary travel claim."
  },
  {
    category: "personal_injury",
    pattern: /\b(personal injury|bodily injury|injured|medical harm)\b|人身伤害|受伤|医疗损害/iu,
    userMessage: "Personal-injury claims need qualified medical and legal support beyond this tool."
  },
  {
    category: "litigation_strategy",
    pattern: /\b(litigation strategy|how to sue|prepare (?:my )?lawsuit|court strategy)\b|诉讼策略|如何起诉|准备起诉/iu,
    userMessage: "Litigation strategy requires a qualified lawyer; this tool will not provide ordinary claim analysis for it."
  },
  {
    category: "significant_property_loss",
    pattern: /\b(lost|stolen|destroyed)\b.{0,40}\b(jewelry|jewellery|valuable property|\$[1-9][0-9]{3,})\b|高价值.{0,12}(财物|珠宝)|珠宝.{0,12}(丢失|被盗|损坏)/iu,
    userMessage: "Significant property loss may require police, insurer, or legal assistance beyond this tool."
  },
  {
    category: "complex_insurance",
    pattern: /\b(complex|interpret|coverage dispute)\b.{0,40}\b(insurance|policy exclusion|coverage denial)\b|复杂.{0,16}(保险|拒赔)|解释.{0,16}(保险条款|拒赔)/iu,
    userMessage: "Complex insurance interpretation requires a qualified insurance or legal professional."
  }
];

export function preflightGuard(message: string): ScopeGuardDecision {
  const text = message.normalize("NFKC").toLowerCase();
  const match = HIGH_RISK_RULES.find(({ pattern }) => pattern.test(text));
  return match
    ? { status: "unsupported_high_risk", category: match.category, message: match.userMessage }
    : { status: "pass" };
}

export function projectGuardText(facts: RawClaimFacts): string {
  return [
    facts.provider,
    facts.brandOrProperty,
    facts.operatingCarrier,
    facts.origin.city,
    facts.origin.airport,
    facts.origin.country,
    facts.destination.city,
    facts.destination.airport,
    facts.destination.country,
    facts.statedReason,
    facts.scheduledFinalArrival,
    facts.actualFinalArrival,
    facts.loyaltyStatus,
    ...facts.expenses,
    ...facts.evidence,
    facts.userGoal
  ].filter((value): value is string => typeof value === "string").join("\n");
}

export function postMergeGuard(message: string, facts: RawClaimFacts): ScopeGuardDecision {
  return preflightGuard([message, projectGuardText(facts)].join("\n"));
}
```

`projectGuardText()` is the sole deterministic post-merge text projection. It enumerates every free-text/string-array raw fact users or extractors can alter; controlled enum fields and booleans cannot carry arbitrary phrases. It never serializes the object generically, never reads derived context, and receives only facts that already passed Task 2/Plan C length and collection bounds.

The fixed category message is placed in `cautions`; high-risk and ordinary out-of-scope results have `context: null` and no ordinary missing fields, legal regimes, assessments, retrieval items, scripts, or compensation requests. A preflight block uses the exact `performed: false` extraction variant; a post-merge block truthfully retains the actual performed extraction metadata. `claimState` remains the complete revision-safe state, but blocked presentation code must not derive or display scenario eligibility from it.

- [ ] **Step 4: Put guards on both sides of extraction**

In `processClaimTurn()`: preflight before selecting/calling an extractor; post-merge before context resolution, repository load, or retrieval. Inject extractor/repository dependencies so tests can assert zero calls.

- [ ] **Step 5: Run safety and full verification**

Run: `npm test -- tests/domain/safety-guard.test.ts tests/api/public-scope.test.ts && npm run verify`

Expected: all direct fixtures make zero model/retrieval calls; all fixtures produce no normal analysis.

- [ ] **Step 6: Commit safety gates**

```bash
git add lib/domain/safety-guard.ts lib/claim-workflow.ts app/api/intake/route.ts app/api/analyze/route.ts tests/domain/safety-guard.test.ts tests/api/public-scope.test.ts
git commit -m "feat: block high-risk claim analysis"
```

### Task 7: Decouple Applicability from Display Ranking (WP1-07)

**Files:**
- Modify: `lib/knowledge/knowledge-repository.ts`
- Create: `tests/domain/applicability-ranking.test.ts`
- Modify: `lib/retrieval.ts:1-126`
- Modify: `lib/retrievalScoring.ts:1-450`
- Modify: `lib/policyScope.ts:80-188`
- Modify: `lib/types.ts:184-224`
- Modify: `lib/claim-workflow.ts`
- Modify: `lib/generator.ts`

**Interfaces:**
- Consumes: Task 5 `assessPolicyApplicability()`, `regimesFromApplicability()`, `ResolvedClaimContext`, `RemedyAssessment`, and Plan C Task 6's validated `KnowledgeSnapshot` with non-empty, policy-backed `Script.source_ids`.
- Produces: `rankApplicablePolicies()`, `rankCases()`, `rankScripts()`, and `buildRetrievalTrace()` using the Task 5-frozen `PolicyApplicability`, `RankedDisplayItem<T>`, and `RetrievalTrace` types.

- [ ] **Step 1: Write failing invariance, trace, and source-priority tests**

```ts
it("keeps four applicable policies when display limit is three", () => {
  const context = resolvedContext({
    incidentType: "airline_cancellation",
    origin: { airport: "CDG" }, destination: { airport: "JFK" },
    operatingCarrier: "Air France"
  });
  const assessment = assessPolicyApplicability(context, [
    policyFixture({
      policy_id: "eu-a", policy_name: "EU A", provider_type: "government",
      provider: "European Union", legal_regime: "EU261", applicability_rule: "eu261_route",
      incident_types: ["airline_cancellation"], applicable_regions: ["EU_EEA_CH"],
      applicable_providers: [], required_controllability: "any"
    }),
    policyFixture({
      policy_id: "eu-b", policy_name: "EU B", provider_type: "government",
      provider: "European Union", legal_regime: "EU261", applicability_rule: "eu261_route",
      incident_types: ["airline_cancellation"], applicable_regions: ["EU_EEA_CH"],
      applicable_providers: [], required_controllability: "any"
    }),
    policyFixture({
      policy_id: "us-a", policy_name: "US A", provider_type: "government",
      provider: "US DOT", legal_regime: "US_DOT_REFUND",
      applicability_rule: "origin_or_destination_region",
      incident_types: ["airline_cancellation"], applicable_regions: ["US"],
      applicable_providers: [], required_controllability: "any"
    }),
    policyFixture({
      policy_id: "us-b", policy_name: "US B", provider_type: "government",
      provider: "US DOT", legal_regime: "US_DOT_REFUND",
      applicability_rule: "origin_or_destination_region",
      incident_types: ["airline_cancellation"], applicable_regions: ["US"],
      applicable_providers: [], required_controllability: "any"
    })
  ]);
  expect(assessment.filter(({ status }) => status !== "not_applicable")).toHaveLength(4);
  expect(rankApplicablePolicies(context, assessment, 3)).toHaveLength(3);
  expect(regimesFromApplicability(assessment)).toEqual(["EU261", "US_DOT_REFUND"]);
});

it("preserves reasons and ranks a comparable real case before synthetic", () => {
  const context = resolvedContext({ incidentType: "airline_cancellation", operatingCarrier: "United" });
  const ranked = rankCases(context, [
    caseFixture({ case_id: "real", source_type: "community_dp" }),
    caseFixture({ case_id: "synthetic", source_type: "synthetic_example" })
  ], 3);
  expect(ranked.map(({ item }) => item.source_type)).toEqual(["community_dp", "synthetic_example"]);
  expect(ranked[0]?.reasons.length).toBeGreaterThan(0);
});
```

Also assert changing `policyLimit` does not alter scenario IDs, remedies, or legal regimes; dormant approved cases are filtered; synthetic can appear when no comparable real case exists; and selecting a displayed case cannot call or preserve the legacy `withSelectedCaseFacts()` authority path, overwrite `ClaimState`, or alter scenarios/remedies. Add one EU-only cancellation context and one US-only cancellation context; the same canonical cancellation case is comparable in each because incident-to-scenario mapping returns both candidates and intersects with the actual active set.
Add three script assertions: a script whose every `source_ids` policy is applicable/conditional is retained with the exact frozen ID array; a script with any not-applicable or absent source policy is filtered before display; and lowering `policyLimit` below a script's cited policy does not remove that valid script or strip its citation.

- [ ] **Step 2: Run tests and confirm Top-K currently changes regime output**

Run: `npm test -- tests/domain/applicability-ranking.test.ts`

Expected: FAIL because `RetrievalResult` discards scored reasons and generator derives regimes from displayed policies.

- [ ] **Step 3: Add applicability and trace contracts**

```ts
export function rankApplicablePolicies(
  context: ResolvedClaimContext,
  assessments: readonly PolicyApplicability[],
  limit: number
): RankedDisplayItem<Policy>[];

export function buildRetrievalTrace(
  context: ResolvedClaimContext,
  knowledge: KnowledgeSnapshot,
  limits: Required<RetrievalLimits>
): RetrievalTrace;

export function rankCases(
  context: ResolvedClaimContext,
  cases: readonly Case[],
  limit: number
): RankedDisplayItem<Case>[];

export function rankScripts(
  context: ResolvedClaimContext,
  scripts: readonly Script[],
  admissiblePolicyIds: ReadonlySet<string>,
  limit: number
): RankedDisplayItem<Script>[];

export type RetrievalLimits = {
  policyLimit?: number;
  caseLimit?: number;
  scriptLimit?: number;
};

export function scenariosForIncident(value: string): readonly ScenarioId[];
```

Task 7 imports `assessPolicyApplicability()` and `regimesFromApplicability()` unchanged from `lib/domain/policy-applicability.ts`; it must not fork or duplicate either rule.

- [ ] **Step 4: Filter applicability before ranking and preserve reasons**

`assessPolicyApplicability()` evaluates all policies against the active scenario set and carrier scope. Ranking consumes only applicable/conditional candidates; display slicing happens last. `buildRetrievalTrace()` derives `admissiblePolicyIds` from the complete, unsliced applicability list where status is `applicable` or `conditional`, and passes it to `rankScripts()`. A script is display-eligible only when `source_ids` is non-empty and every ID is in that set; the validated source array is copied unchanged into the ranked item. Missing, not-applicable, or unknown references fail closed rather than being guessed. Return `RankedDisplayItem<T>` objects instead of discarding metadata with `.item`.

Use a source tier only after eligibility/comparability filtering:

```ts
function caseSourceTier(item: Case): number {
  if (item.source_type === "community_dp") return 0;
  if (item.source_type === "user_submitted") return 1;
  return 2;
}

type RankedComparableCase = RankedDisplayItem<Case> & { comparabilityKey: string };

ranked.sort((left: RankedComparableCase, right: RankedComparableCase) => {
  if (left.comparabilityKey === right.comparabilityKey) {
    return caseSourceTier(left.item) - caseSourceTier(right.item)
      || right.score - left.score
      || left.item.case_id.localeCompare(right.item.case_id);
  }
  return right.score - left.score
    || left.comparabilityKey.localeCompare(right.comparabilityKey)
    || left.item.case_id.localeCompare(right.item.case_id);
});
```

`rankCases()` computes and attaches the non-null key before sorting, then removes only the internal key from the public result. Apply source tier only inside the same comparable scenario/provider pool. Across different keys, relevance score comes first, then stable key and case ID, so a generic real case cannot outrank an exact-provider synthetic case merely because it is real. Add a United context with one generic real case and one exact-United synthetic case whose relevance score is higher; assert the exact match leads. A same-key comparable real case still leads a same-key synthetic case.

Freeze comparability as a pure tuple:

```ts
export function caseComparabilityKey(
  context: ResolvedClaimContext,
  item: Case
): string | null {
  const candidates = scenariosForIncident(item.issue_type);
  const scenario = context.scenarios.scenarioIds.find((active) => candidates.includes(active));
  if (!scenario) return null;
  const provider = providerMatchKey(item.provider);
  const currentProvider = providerMatchKey(
    context.normalizedOperatingCarrier.value ?? context.normalizedProvider.value
  );
  if (provider && currentProvider && provider !== currentProvider) return null;
  return `${scenario}:${provider && currentProvider ? provider : "any"}`;
}
```

`scenariosForIncident()` maps hotel walk and denied boarding to their single scenario, maps canonical airline delay/cancellation (and their accepted legacy aliases) to both `us_airline_disruption` and `eu_uk_air_disruption`, and returns `[]` for dormant/unknown incidents. Comparability chooses the first intersection in the context's already-frozen active display order. First discard a case with no active intersection, review status not approved, invalid source disclosure, or a named provider different from the current named provider. If either side has no provider, use the conservative `any` pool; only an exact named match enters a provider pool. There is no implicit cross-provider exception in this release. Within a key, real source tier precedes synthetic; relevance score and stable case ID break ties.

- [ ] **Step 5: Replace only the display slice in the workflow trace**

Delete legacy `getLegalRegimes(retrieval)` and `getPrimaryLegalRegime(retrieval)`. Keep Task 5's complete applicability and `legalRegimes` calculation unchanged, then replace the three empty display arrays with independently limited ranked arrays. Delete/neutralize `withSelectedCaseFacts()` so `caseId` is presentation context only.

- [ ] **Step 6: Run domain, legacy, and full verification**

Run: `npm test -- tests/domain/applicability-ranking.test.ts tests/retrieval.test.ts tests/regional-policy.test.ts && npm run verify`

Expected: all tests PASS; display limits never alter assessment; reasons and exact validated script source IDs remain in the workflow result.

- [ ] **Step 7: Commit applicability-first retrieval**

```bash
git add lib/knowledge/knowledge-repository.ts lib/retrieval.ts lib/retrievalScoring.ts lib/policyScope.ts lib/types.ts lib/claim-workflow.ts lib/generator.ts tests/domain/applicability-ranking.test.ts tests/retrieval.test.ts tests/regional-policy.test.ts
git commit -m "refactor: separate applicability from ranking"
```

## Plan A Completion Gate

- [ ] Run `npm run verify` and confirm exit 0.
- [ ] Run `npm test -- tests/domain tests/api/public-scope.test.ts tests/model/raw-fact-extractor.test.ts` and confirm all new domain tests pass.
- [ ] Inspect `git grep -n "strength" -- app/api lib/domain lib/claim-workflow.ts` and confirm canonical routes/domain contain no claim-strength field.
- [ ] Inspect `git grep -n "operatingCarrierRegion\|legalRegime\|controllability" -- lib/domain/raw-fact-schema.ts` and confirm the model/raw input schema contains none of those derived fields.
- [ ] Confirm `git status --short` is empty before starting Plan B.
