import { generateAnalysis } from "./generator";
import { buildHandlingPlaybook } from "./handlingPlaybook";
import { controllabilityFromReason } from "./policyScope";
import { retrieveKnowledge } from "./retrieval";
import type { ClaimFacts } from "./claimFacts";
import type {
  AnalysisResult,
  Case,
  ExtractedFacts,
  PolicyRegion,
  Policy,
  Script
} from "./types";

export { generateAnalysis } from "./generator";
export {
  getIssueAliases,
  isMvpIssueType,
  issueLabels,
  MVP_ISSUE_TYPES,
  normalizeIssueType
} from "./issueTaxonomy";
export {
  buildRetrievalQuery,
  retrieveKnowledge,
  searchCases,
  searchPolicies,
  searchScripts
} from "./retrieval";
export { rankCases, rankPolicies, rankScripts } from "./retrievalScoring";
export { buildScenarioSummaries } from "./scenarios";

function policyRegionsFromClaimFacts(facts: ClaimFacts): PolicyRegion[] {
  return Array.from(
    new Set(
      [facts.origin.region, facts.destination.region].filter(
        (region): region is NonNullable<typeof region> => Boolean(region)
      )
    )
  );
}

export function claimFactsToExtractedFacts(
  facts: ClaimFacts,
  description = ""
): ExtractedFacts {
  return {
    description,
    journeyStage: facts.journeyStage,
    ticketingProvider: facts.bookingProvider ?? facts.validatingCarrier ?? undefined,
    acceptedAlternative: facts.acceptedAlternative,
    issueType: facts.issueType,
    provider: facts.providerType === "airline" ? facts.operatingCarrier ?? facts.provider ?? undefined : facts.provider ?? undefined,
    providerType: facts.providerType === "unknown" ? undefined : facts.providerType,
    country: facts.origin.country ?? facts.destination.country ?? undefined,
    bookingChannel: facts.bookingChannel === "unknown" ? undefined : facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus ?? undefined,
    disruptionReason: facts.disruptionReason,
    arrivalDelayMinutes: facts.arrivalDelayMinutes ?? undefined,
    isOvernight: facts.isOvernight ?? undefined,
    deniedBoardingKind: facts.deniedBoardingKind,
    operatingCarrier: facts.operatingCarrier ?? undefined,
    operatingCarrierRegion: facts.operatingCarrierRegion ?? undefined,
    originRegion: facts.origin.region ?? undefined,
    destinationRegion: facts.destination.region ?? undefined,
    policyRegions: policyRegionsFromClaimFacts(facts),
    controllability: controllabilityFromReason(facts.disruptionReason),
    confidence: facts.confidence,
    signals: [],
    source: "llm"
  };
}

export function buildAnalysisFromFacts(
  facts: ClaimFacts,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  description = ""
): AnalysisResult {
  const extractedFacts = claimFactsToExtractedFacts(facts, description);
  const retrieval = retrieveKnowledge(extractedFacts, policies, cases, scripts);
  const analysis = generateAnalysis(retrieval.facts, retrieval);
  const handlingPlaybook = buildHandlingPlaybook(facts);
  if (facts.journeyStage === "completed") {
    handlingPlaybook.askLadder = [...analysis.suggestedAsks.conservative, ...analysis.suggestedAsks.standard];
  }

  return {
    ...analysis,
    handlingPlaybook
  };
}
