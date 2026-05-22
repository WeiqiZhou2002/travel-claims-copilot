import { getIssueAliases, normalizeIssueType } from "./issueTaxonomy";
import type { Case, ExtractedFacts, Policy, RetrievalResult, Script } from "./types";

function withSelectedCaseFacts(facts: ExtractedFacts, selectedCase?: Case): ExtractedFacts {
  if (!selectedCase) {
    return facts;
  }

  const selectedIssueType = normalizeIssueType(selectedCase.issue_type);

  return {
    ...facts,
    issueType: selectedIssueType ?? facts.issueType,
    provider: selectedCase.provider,
    providerType: selectedCase.provider_type,
    confidence: selectedIssueType ? "high" : facts.confidence,
    source: "selected_case"
  };
}

export function searchPolicies(facts: ExtractedFacts, policies: Policy[]): Policy[] {
  const aliases = new Set<string>(getIssueAliases(facts.issueType));

  return policies.filter((policy) => aliases.has(policy.issue_type));
}

export function searchCases(facts: ExtractedFacts, cases: Case[]): Case[] {
  const aliases = new Set<string>(getIssueAliases(facts.issueType));

  return cases.filter((item) => aliases.has(item.issue_type));
}

export function searchScripts(facts: ExtractedFacts, scripts: Script[]): Script[] {
  const aliases = new Set<string>(getIssueAliases(facts.issueType));

  return scripts.filter((script) => aliases.has(script.issue_type));
}

export function retrieveKnowledge(
  facts: ExtractedFacts,
  policies: Policy[],
  cases: Case[],
  scripts: Script[]
): RetrievalResult {
  const selectedCase = facts.caseId
    ? cases.find((item) => item.case_id === facts.caseId)
    : undefined;
  const resolvedFacts = withSelectedCaseFacts(facts, selectedCase);

  return {
    facts: resolvedFacts,
    issueAliases: getIssueAliases(resolvedFacts.issueType),
    officialBasis: searchPolicies(resolvedFacts, policies),
    similarCases: searchCases(resolvedFacts, cases),
    scripts: searchScripts(resolvedFacts, scripts),
    selectedCase
  };
}
