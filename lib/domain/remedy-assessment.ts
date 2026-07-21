import type {
  ConditionResult,
  ProviderCommitmentEvidence,
  RawClaimFacts,
  RawFactPath,
  RawFactValue,
  RemedyAssessment,
  RemedyConditionEvaluation,
  RemedyId,
  RemedyStatus,
  RequestOption,
  ResolvedClaimContext,
  ScenarioId,
  WorkflowStatus
} from "./claim-contract";
import {
  evaluateCarrierCommitmentPredicate,
  type CarrierCommitment,
  type CarrierCommitmentRemedy,
  type KnowledgeSnapshot
} from "../knowledge/knowledge-contract";

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESHNESS_DAYS = 30;

const titles: Record<RemedyId, string> = {
  hotel_relocation: "Comparable replacement hotel",
  hotel_transport: "Transportation to replacement lodging",
  hotel_guarantee_compensation: "Hotel reservation guarantee compensation",
  us_refund: "Refund for a cancellation or significant change",
  us_rerouting: "Carrier rerouting commitment",
  us_meal: "Carrier meal commitment",
  us_hotel: "Carrier overnight hotel commitment",
  us_ground_transport: "Carrier hotel ground transportation commitment",
  voluntary_bump_offer: "Voluntary denied-boarding negotiation",
  denied_boarding_written_rights: "Written denied-boarding rights",
  denied_boarding_compensation: "Involuntary denied-boarding compensation",
  eu_uk_care: "EU/UK care",
  eu_uk_refund_or_rerouting: "EU/UK refund or rerouting",
  eu_uk_fixed_compensation: "EU/UK fixed compensation"
};

const carrierRemedies = new Set<RemedyId>([
  "us_rerouting",
  "us_meal",
  "us_hotel",
  "us_ground_transport"
]);

function calendarDateEpoch(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const epoch = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(epoch);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
    ? epoch
    : null;
}

function isFresh(commitment: CarrierCommitment, asOf: string): boolean {
  const asOfEpoch = calendarDateEpoch(asOf);
  const checkedEpoch = calendarDateEpoch(commitment.lastChecked);
  return Boolean(
    asOfEpoch !== null &&
      checkedEpoch !== null &&
      checkedEpoch <= asOfEpoch &&
      (asOfEpoch - checkedEpoch) / DAY_MS <= FRESHNESS_DAYS
  );
}

function commitmentCondition(
  status: ConditionResult["status"],
  factFields: RawFactPath[]
): ConditionResult {
  return {
    id: "matching_carrier_commitment",
    label: "Matching reviewed operating-carrier commitment",
    status,
    factFields: [...new Set(factFields)]
  };
}

function providerEvidence(
  commitment: CarrierCommitment,
  remedy: CarrierCommitmentRemedy
): ProviderCommitmentEvidence {
  return {
    commitmentId: commitment.commitmentId,
    normalizedCarrier: commitment.normalizedCarrier,
    applicableCarrierRole: commitment.applicableCarrierRole,
    sourceUrl: commitment.sourceUrl,
    sourceTitle: commitment.sourceTitle,
    sourceProvider: commitment.sourceProvider,
    sourceType: commitment.sourceType,
    legalRegime: commitment.legalRegime,
    authority: commitment.authority,
    sourceLastChecked: commitment.lastChecked,
    conditions: [...remedy.displayConditions],
    rights: [...remedy.rights]
  };
}

function evaluateProviderCommitment(input: {
  context: ResolvedClaimContext;
  knowledge: KnowledgeSnapshot;
  remedyId: RemedyId;
  asOf: string;
}): { condition: ConditionResult; evidence?: ProviderCommitmentEvidence } {
  const carrier = input.context.normalizedOperatingCarrier.value;
  if (!carrier) {
    return { condition: commitmentCondition("missing", ["operatingCarrier"]) };
  }
  const candidates = input.knowledge.carrierCommitments
    .filter(
      (commitment) =>
        commitment.normalizedCarrier === carrier &&
        commitment.applicableCarrierRole === "operating_carrier"
    )
    .flatMap((commitment) =>
      commitment.remedies
        .filter((remedy) => remedy.remedyId === input.remedyId && remedy.committed)
        .map((remedy) => ({ commitment, remedy }))
    );
  if (candidates.length === 0) {
    return { condition: commitmentCondition("missing", ["operatingCarrier"]) };
  }

  const facts = input.context.resolutionFacts;
  const predicateFacts = {
    incidentType: facts.incidentType,
    controllability: input.context.controllability.value,
    isOvernight: facts.isOvernight
  };
  const evaluated = candidates.map(({ commitment, remedy }) => {
    const predicateResults = remedy.predicates.map((predicate) => ({
      predicate,
      status: evaluateCarrierCommitmentPredicate(predicate, predicateFacts)
    }));
    const factFields: RawFactPath[] = ["operatingCarrier"];
    predicateResults.forEach(({ predicate }) => {
      if (predicate.kind === "event") factFields.push("incidentType");
      if (predicate.kind === "controllability") factFields.push("reasonCategory");
      if (predicate.kind === "overnight") factFields.push("isOvernight");
    });
    const requiredKindsPresent =
      remedy.predicates.some(({ kind }) => kind === "event") &&
      remedy.predicates.some(({ kind }) => kind === "controllability");
    let status: ConditionResult["status"] = "matched";
    if (
      !isFresh(commitment, input.asOf) ||
      !requiredKindsPresent ||
      predicateResults.length === 0
    ) {
      status = "missing";
    } else if (predicateResults.some((result) => result.status === "excluded")) {
      status = "excluded";
    } else if (predicateResults.some((result) => result.status === "missing")) {
      status = "missing";
    }
    return { commitment, remedy, status, factFields };
  });
  const factFields = [...new Set(evaluated.flatMap((candidate) => candidate.factFields))];
  const matched = evaluated
    .filter(({ status }) => status === "matched")
    .sort(
      (left, right) =>
        right.commitment.lastChecked.localeCompare(left.commitment.lastChecked) ||
        left.commitment.commitmentId.localeCompare(right.commitment.commitmentId)
    );
  if (matched.length > 0) {
    const [{ commitment, remedy }] = matched;
    return {
      condition: commitmentCondition("matched", factFields),
      evidence: providerEvidence(commitment, remedy)
    };
  }
  if (evaluated.some(({ status }) => status === "missing")) {
    return { condition: commitmentCondition("missing", factFields) };
  }
  return { condition: commitmentCondition("excluded", factFields) };
}

function readFact(facts: RawClaimFacts, path: RawFactPath): RawFactValue | null {
  const [parent, leaf] = path.split(".");
  const value = leaf
    ? (
        facts[parent as "origin" | "destination" | "assistance"] as unknown as Record<
          string,
          RawFactValue | null
        >
      )[leaf]
    : (facts[parent as keyof RawClaimFacts] as RawFactValue | null);
  if (Array.isArray(value)) return value.length > 0 ? [...value] : null;
  return value ?? null;
}

function factsUsedByConditions(
  context: ResolvedClaimContext,
  conditions: readonly ConditionResult[]
): RawFactPath[] {
  const consumed = new Set(conditions.flatMap(({ factFields }) => factFields));
  return Array.from(consumed).filter((path) => readFact(context.resolutionFacts, path) !== null);
}

function requestOptions(
  remedyId: RemedyId,
  status: RemedyStatus,
  sourceIds: string[]
): RequestOption[] {
  const title = titles[remedyId];
  const statusText = status === "supported" ? "request" : "ask the provider to assess";
  return (["conservative", "standard", "assertive"] as const).map((tone) => ({
    tone,
    remedyId,
    remedyStatus: status,
    text: `${tone === "assertive" ? "Escalate a documented request for" : `${statusText} ${title.toLowerCase()}`}${
      tone === "assertive" ? ` ${title.toLowerCase()}` : ""
    }.`,
    sourceIds: [...sourceIds]
  }));
}

export function statusFromConditions(input: {
  matched: ConditionResult[];
  missing: ConditionResult[];
  excluded: ConditionResult[];
}): RemedyStatus {
  if (input.excluded.length > 0) return "not_applicable";
  if (input.missing.length > 0) return "conditional";
  return "supported";
}

export function topLevelStatus(
  remedies: RemedyAssessment[],
  unresolvedScenario: boolean
): WorkflowStatus {
  if (unresolvedScenario) return "needs_information";
  const materialRemedies = remedies.filter(({ material }) => material);
  if (materialRemedies.length === 0) return "needs_information";
  return materialRemedies.every(
    ({ status, missingConditions }) => status === "conditional" && missingConditions.length > 0
  )
    ? "needs_information"
    : "ready";
}

export function buildRemedyAssessment(input: {
  context: ResolvedClaimContext;
  knowledge: KnowledgeSnapshot;
  scenarioId: ScenarioId;
  evaluation: RemedyConditionEvaluation;
  asOf: string;
}): RemedyAssessment {
  const matched = [...input.evaluation.matchedConditions];
  const missing = [...input.evaluation.missingConditions];
  const excluded = [...input.evaluation.exclusions];
  let evidence: ProviderCommitmentEvidence | undefined;
  if (carrierRemedies.has(input.evaluation.remedyId)) {
    const provider = evaluateProviderCommitment({
      context: input.context,
      knowledge: input.knowledge,
      remedyId: input.evaluation.remedyId,
      asOf: input.asOf
    });
    if (provider.condition.status === "matched") matched.push(provider.condition);
    if (provider.condition.status === "missing") missing.push(provider.condition);
    if (provider.condition.status === "excluded") excluded.push(provider.condition);
    evidence = provider.evidence;
  }
  const status = statusFromConditions({ matched, missing, excluded });
  const sourceIds = evidence ? [evidence.commitmentId] : [];
  const heldEvidence = [...input.context.resolutionFacts.evidence];
  const missingEvidence = missing.map(({ label }) => label);
  let evidenceStatus: RemedyAssessment["evidence"]["status"] = "complete";
  if (heldEvidence.length === 0) evidenceStatus = "missing";
  else if (missingEvidence.length > 0) evidenceStatus = "partial";
  const allConditions = [...matched, ...missing, ...excluded];
  let nextAction = `Request ${titles[input.evaluation.remedyId].toLowerCase()} with supporting records.`;
  if (status === "conditional") {
    nextAction = `Confirm the missing conditions for ${titles[
      input.evaluation.remedyId
    ].toLowerCase()}.`;
  } else if (status === "not_applicable") {
    nextAction = `Focus on other applicable remedies instead of ${titles[
      input.evaluation.remedyId
    ].toLowerCase()}.`;
  }

  return {
    remedyId: input.evaluation.remedyId,
    scenarioId: input.scenarioId,
    title: titles[input.evaluation.remedyId],
    material: input.evaluation.material,
    status,
    factsUsed: factsUsedByConditions(input.context, allConditions),
    matchedConditions: matched,
    missingConditions: missing,
    exclusions: excluded,
    sourceIds,
    ...(evidence ? { providerCommitment: evidence } : {}),
    evidence: { status: evidenceStatus, held: heldEvidence, missing: missingEvidence },
    requestOptions: requestOptions(input.evaluation.remedyId, status, sourceIds),
    cautions: [
      "This is a condition-by-condition assessment, not legal advice or a promised outcome."
    ],
    nextAction
  };
}
