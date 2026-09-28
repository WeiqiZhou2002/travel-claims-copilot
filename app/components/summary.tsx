import type { AnalysisResult,SuggestedAsks } from "../../lib/types";
import { evidenceCoverageStyles,issueLabels } from "./labels";
export function SummaryPanel({ result }: { result: AnalysisResult | null }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">Result</h2>
      {result ? (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-sm text-ink/60">Issue type</p>
            <p className="mt-1 text-xl font-semibold text-ink">
              {issueLabels[result.issueType] ?? result.issueType.replaceAll("_", " ")}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink/60">Evidence coverage</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${evidenceCoverageStyles[result.evidenceCoverage.officialBasisStatus]}`}
            >
              {result.evidenceCoverage.officialBasisStatus.replaceAll("_", " ")}
            </span>
          </div>
          <p className="text-xs leading-5 text-ink/55">
            This describes source coverage and unresolved checks—not the likelihood of a payout.
          </p>
          <div className="grid gap-2 border-t border-ink/5 pt-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Official sources</span>
              <span className="font-medium text-ink">
                {result.evidenceCoverage.officialSourceCount}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Reported cases</span>
              <span className="font-medium text-ink">
                {result.evidenceCoverage.reportedCaseCount}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Synthetic examples</span>
              <span className="font-medium text-ink">
                {result.evidenceCoverage.syntheticCaseCount}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Unresolved checks</span>
              <span className="font-medium text-ink">
                {result.evidenceCoverage.unresolvedConditionCount}
              </span>
            </div>
            {result.evidenceCoverage.unmetRemedyConditionCount > 0 ? (
              <div className="flex items-start justify-between gap-3">
                <span className="text-ink/60">Unmet remedy checks</span>
                <span className="font-medium text-ink">
                  {result.evidenceCoverage.unmetRemedyConditionCount}
                </span>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Route regions</span>
              <span className="text-right font-medium text-ink">
                {result.policyRegions.length > 0
                  ? result.policyRegions.join(", ").replaceAll("_", " ")
                  : "Unresolved"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Legal regimes</span>
              <span className="text-right font-medium text-ink">
                {result.legalRegimes.length > 0
                  ? result.legalRegimes.join(", ").replaceAll("_", " ")
                  : "Unresolved"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-ink/60">Controllability</span>
              <span className="font-medium capitalize text-ink">
                {result.controllability}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-ink/65">
          The classification and retrieval results will appear here.
        </p>
      )}
    </div>
  );
}

export function SuggestedAsks({ asks }: { asks: SuggestedAsks }) {
  const tiers = [
    ["Conservative", asks.conservative],
    ["Standard", asks.standard],
    ["Aggressive", asks.aggressive]
  ] as const;

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">
        Suggested asks
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {tiers.map(([label, items]) => (
          <div key={label}>
            <h3 className="text-sm font-semibold text-ink">{label}</h3>
            {items.length === 0 && <p className="mt-2 text-sm text-ink/60">No additional request is supported by the current facts and local sources.</p>}
            <ul className="mt-2 space-y-2 text-sm leading-6 text-ink/70">
              {items.map((item) => (
                <li className="border-l-2 border-mint/40 pl-3" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

