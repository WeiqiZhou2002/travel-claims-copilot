"use client";

import { useState } from "react";

import type { AnalysisViewModel } from "../../lib/analysis-view-model";
import type { AnalyzeClaimResponse } from "../../lib/api/analyze-contract";
import type { ApiErrorEnvelope } from "../../lib/api/api-response";
import type { ClaimState } from "../../lib/domain/claim-contract";
import { emptyRawClaimFacts } from "../../lib/domain/raw-fact-schema";
import { SourceSections } from "./source-sections";

const exampleText = "My flight was cancelled, and I arrived the next day after paying for a hotel.";

function initialClaimState(): ClaimState {
  return {
    facts: emptyRawClaimFacts(),
    provenance: {},
    revision: 0,
    conflicts: [],
    unresolvedFields: []
  };
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

function ResultSummary({ result }: { result: AnalysisViewModel }) {
  return (
    <header className="rounded-xl border border-mint/20 bg-mint/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">
        Analysis ready · facts revision {result.factsRevision}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">{result.summary}</h2>
      <p className="mt-3 text-sm leading-6 text-ink/65">{result.disclaimer}</p>
    </header>
  );
}

export function ClaimWorkspace() {
  const [message, setMessage] = useState(exampleText);
  const [result, setResult] = useState<AnalysisViewModel | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function analyzeClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const claimMessage = message.trim();
    if (!claimMessage || isLoading) return;

    setIsLoading(true);
    setError("");
    setResult(null);
    try {
      const prior = initialClaimState();
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: claimMessage,
          prior,
          baseRevision: prior.revision,
          requestedMode: "local"
        })
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isApiErrorEnvelope(payload) ? payload.error.message : "Analysis failed.");
      }
      setResult((payload as AnalyzeClaimResponse).result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetClaim() {
    setMessage("");
    setResult(null);
    setError("");
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="border-b border-ink/10 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 md:px-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-mint">
              Travel Claims Copilot · Source-aware review
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
              See what supports each travel claim.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink/65">
              Describe one supported travel disruption. We separate binding rules, regulator
              guidance, provider commitments, reviewed reports, and synthetic examples.
            </p>
          </div>
          <button
            className="w-fit rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/65 transition hover:border-coral hover:text-coral lg:justify-self-end"
            onClick={resetClaim}
            type="button"
          >
            New claim
          </button>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 md:px-8 lg:grid-cols-[320px_1fr]">
        <aside>
          <form
            className="sticky top-6 rounded-xl border border-ink/10 bg-white p-5 shadow-sm"
            onSubmit={analyzeClaim}
          >
            <label className="block" htmlFor="claim-message">
              <span className="text-sm font-semibold text-ink">What happened?</span>
              <span className="mt-1 block text-xs leading-5 text-ink/55">
                Do not include names, booking codes, contact details, or payment data.
              </span>
            </label>
            <textarea
              className="mt-3 min-h-44 w-full resize-y rounded-lg border border-ink/15 bg-paper p-3 text-sm leading-6 text-ink transition focus:border-mint"
              data-testid="claim-message"
              id="claim-message"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the disruption without personal identifiers."
              value={message}
            />
            <button
              className="mt-4 h-11 w-full rounded-lg bg-ink px-5 text-sm font-semibold text-white transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/40"
              disabled={isLoading || !message.trim()}
              type="submit"
            >
              {isLoading ? "Analyzing…" : "Analyze claim"}
            </button>
            {error ? (
              <p
                className="mt-4 rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-coral"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </form>
        </aside>

        <section aria-label="Claim analysis">
          {result ? (
            <div aria-busy="false" className="space-y-8" data-testid="analysis-result">
              <ResultSummary result={result} />
              <SourceSections
                officialSources={result.officialSources}
                providerCommitments={result.providerCommitments}
                similarCases={result.similarCases}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-ink/20 bg-white p-8 text-center text-sm leading-6 text-ink/60">
              Submit an anonymous claim description to see source-transparent guidance.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
