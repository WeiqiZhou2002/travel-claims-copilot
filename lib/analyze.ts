import { classifyInput } from "./classifier";
import { generateAnalysis } from "./generator";
import { retrieveKnowledge } from "./retrieval";
import type { AnalysisResult, AnalyzeOptions, Case, Policy, Script } from "./types";

export { classifyInput, classifyIssue } from "./classifier";
export { generateAnalysis } from "./generator";
export { getIssueAliases, issueLabels, normalizeIssueType } from "./issueTaxonomy";
export { retrieveKnowledge, searchCases, searchPolicies, searchScripts } from "./retrieval";
export { buildScenarioSummaries } from "./scenarios";

export function buildAnalysisResult(
  description: string,
  policies: Policy[],
  cases: Case[],
  scripts: Script[],
  options: AnalyzeOptions = {}
): AnalysisResult {
  const facts = classifyInput(description, options);
  const retrieval = retrieveKnowledge(facts, policies, cases, scripts);

  return generateAnalysis(retrieval.facts, retrieval);
}
