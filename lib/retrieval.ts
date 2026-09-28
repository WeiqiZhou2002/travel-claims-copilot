import { getIssueAliases } from "./issueTaxonomy";
import {
  controllabilityFromReason,
  evaluatePolicyApplicability,
  policyRegionsFromCountry
} from "./policyScope";
import { rankCases, rankPolicies, rankScripts } from "./retrievalScoring";
import type {
  Case,
  ExtractedFacts,
  Policy,
  RetrievalLimits,
  RetrievalQuery,
  RetrievalResult,
  Script
} from "./types";

const defaultLimits: Required<RetrievalLimits> = {
  policyLimit: 3,
  caseLimit: 3,
  scriptLimit: 2
};

// A selected case is presentation-only, so an approved synthetic example may still be shown;
// synthetic cases never enter similar-case retrieval.
function isApprovedCase(item: Case): boolean {
  return item.review_status === "approved";
}

function withSelectedCaseFacts(facts: ExtractedFacts, selectedCase?: Case): ExtractedFacts {
  return selectedCase ? { ...facts } : facts;
}

export function buildRetrievalQuery(facts: ExtractedFacts): RetrievalQuery {
  return {
    description: facts.description,
    ticketingProvider: facts.ticketingProvider,
    carrier: facts.operatingCarrier,
    journeyStage: facts.journeyStage,
    acceptedAlternative: facts.acceptedAlternative,
    issueType: facts.issueType,
    provider: facts.provider,
    providerType: facts.providerType,
    country: facts.country,
    bookingChannel: facts.bookingChannel,
    loyaltyStatus: facts.loyaltyStatus,
    disruptionReason: facts.disruptionReason,
    arrivalDelayMinutes: facts.arrivalDelayMinutes,
    isOvernight: facts.isOvernight,
    deniedBoardingKind: facts.deniedBoardingKind,
    operatingCarrier: facts.operatingCarrier,
    operatingCarrierRegion: facts.operatingCarrierRegion,
    originRegion: facts.originRegion,
    destinationRegion: facts.destinationRegion,
    policyRegions:
      facts.policyRegions && facts.policyRegions.length > 0
        ? Array.from(new Set(facts.policyRegions))
        : policyRegionsFromCountry(facts.country),
    controllability: facts.controllability ?? controllabilityFromReason(facts.disruptionReason)
  };
}

export function searchPolicies(
  query: RetrievalQuery,
  policies: Policy[],
  limit = defaultLimits.policyLimit
): Policy[] {
  return rankPolicies(query, policies)
    .slice(0, limit)
    .map((result) => result.item);
}

export function searchCases(
  query: RetrievalQuery,
  cases: Case[],
  limit = defaultLimits.caseLimit
): Case[] {
  return rankCases(query, cases)
    .slice(0, limit)
    .map((result) => result.item);
}

export function searchScripts(
  query: RetrievalQuery,
  scripts: Script[],
  limit = defaultLimits.scriptLimit
): Script[] {
  return rankScripts(query, scripts)
    .slice(0, limit)
    .map((result) => result.item);
}

export function retrieveKnowledge(
  facts: ExtractedFacts,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  limits: RetrievalLimits = {}
): RetrievalResult {
  const selectedCase = facts.caseId
    ? cases.find((item) => isApprovedCase(item) && item.case_id === facts.caseId)
    : undefined;
  const resolvedFacts = withSelectedCaseFacts(facts, selectedCase);
  const query = buildRetrievalQuery(resolvedFacts);
  const rankedPolicies = rankPolicies(query, policies);
  // Every applicable policy is kept by default so remedy assessment sees the full official basis.
  const officialBasis = rankedPolicies
    .slice(0, limits.policyLimit ?? rankedPolicies.length)
    .map(({ item }) => item);

  return {
    facts: resolvedFacts,
    query,
    issueAliases: getIssueAliases(resolvedFacts.issueType),
    legalRegimes: Array.from(new Set(rankedPolicies.map(({ item }) => item.legal_regime))),
    officialBasis,
    policyAssessments: officialBasis.map((policy) => evaluatePolicyApplicability(policy, query)),
    similarCases: searchCases(query, cases, limits.caseLimit ?? defaultLimits.caseLimit),
    scripts: searchScripts(query, scripts, limits.scriptLimit ?? defaultLimits.scriptLimit),
    selectedCase
  };
}
