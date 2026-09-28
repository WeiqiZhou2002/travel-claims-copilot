import casesJson from "../../data/cases.json";
import carrierCommitmentsJson from "../../data/carrier-commitments.json";
import policiesJson from "../../data/policies.json";
import scriptsJson from "../../data/scripts.json";
import type { KnowledgeSnapshot } from "./knowledge-contract";
import { parseKnowledgeSnapshot, type RawKnowledgeSnapshot } from "./knowledge-schema";

export type LoadKnowledgeOptions = {
  asOf?: string;
  raw?: RawKnowledgeSnapshot;
  onStaleSource?: (message: string) => void;
};

// Overdue editorial review is surfaced by validate:data and enforced by release:source-review.
// At runtime it must not become an outage; stale carrier commitments are downgraded to
// conditional by remedy assessment.
function allowStaleSource(): void {}

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function productionKnowledgeRaw(): RawKnowledgeSnapshot {
  return structuredClone({
    policies: policiesJson,
    cases: casesJson,
    scripts: scriptsJson,
    carrierCommitments: carrierCommitmentsJson
  });
}

export async function loadKnowledgeSnapshot(
  options: LoadKnowledgeOptions = {}
): Promise<KnowledgeSnapshot> {
  const raw = structuredClone(options.raw ?? productionKnowledgeRaw());
  return parseKnowledgeSnapshot(raw, {
    asOf: options.asOf ?? currentUtcDate(),
    onStaleSource: options.onStaleSource ?? allowStaleSource
  });
}
