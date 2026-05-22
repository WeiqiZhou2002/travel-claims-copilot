"use client";

import { useMemo, useState } from "react";

import type { AnalysisResult, Case, Policy, Script, SuggestedAsks } from "../lib/types";

const exampleText =
  "I had a confirmed Sheraton reservation, but the hotel said they were oversold and had no room when I arrived.";

const issueLabels: Partial<Record<AnalysisResult["issueType"], string>> = {
  hotel_walk: "Hotel walk",
  controllable_airline_cancellation: "Controllable airline cancellation",
  controllable_airline_delay: "Controllable airline delay",
  eu261_delay_or_cancellation: "EU261 delay or cancellation",
  denied_boarding: "Denied boarding or voluntary bump",
  baggage_delay: "Baggage delay",
  airline_delay_trip_insurance: "Airline delay and trip insurance",
  airline_baggage_not_checked: "Baggage not accepted at check-in",
  airline_rebooking_mixed_carrier_delay: "Mixed-carrier rebooking delay",
  hotel_billing_dispute: "Hotel billing dispute",
  hotel_service_issue: "Hotel service issue",
  hotel_property_loss: "Hotel property loss",
  hotel_relocation_before_opening: "Hotel relocation before opening",
  hotel_room_feature_mismatch: "Hotel room feature mismatch",
  hotel_elite_benefit_closure: "Hotel elite benefit closure",
  unknown: "Needs more detail"
};

const strengthStyles: Record<AnalysisResult["strength"], string> = {
  high: "bg-mint text-white",
  medium: "bg-coral text-white",
  low: "bg-ink text-white"
};

export default function Home() {
  const [description, setDescription] = useState(exampleText);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  async function analyzeClaim() {
    setIsLoading(true);
    setError("");
    setCopiedScriptId(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Analysis failed.");
      }

      setResult(payload);
    } catch (caughtError) {
      setResult(null);
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyScript(script: Script) {
    await navigator.clipboard.writeText(script.template);
    setCopiedScriptId(script.script_id);
  }

  return (
    <main className="min-h-screen">
      <section className="border-b border-ink/10 bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-mint">
              Travel Claims Copilot
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-5xl">
              Analyze a travel dispute and prepare the ask.
            </h1>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink/80">Dispute description</span>
              <textarea
                className="min-h-44 w-full resize-y rounded-lg border border-ink/15 bg-white p-4 text-base leading-7 text-ink shadow-sm outline-none transition focus:border-mint focus:ring-4 focus:ring-mint/15"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe what happened, including provider, route or hotel, timing, and expenses."
              />
            </label>
            <button
              className="h-12 rounded-lg bg-ink px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/40 lg:w-36"
              type="button"
              onClick={analyzeClaim}
              disabled={isLoading}
            >
              {isLoading ? "Analyzing" : "Analyze"}
            </button>
          </div>

          {error ? (
            <div className="rounded-lg border border-coral/30 bg-white px-4 py-3 text-sm font-medium text-coral">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4">
          <SummaryPanel result={result} />
          {result ? <SuggestedAsks asks={result.suggestedAsks} /> : null}
        </aside>

        <div className="flex flex-col gap-5">
          {!result ? (
            <EmptyState />
          ) : (
            <>
              <PolicySection policies={result.officialBasis} />
              <CaseSection cases={result.similarCases} />
              <Checklist title="Evidence checklist" items={result.evidenceChecklist} />
              <ScriptSection
                scripts={result.scripts}
                copiedScriptId={copiedScriptId}
                onCopy={copyScript}
              />
              <Checklist title="Cautions" items={result.cautions} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-8 text-center text-ink/65">
      Enter a claim description and run the analysis.
    </div>
  );
}

function SummaryPanel({ result }: { result: AnalysisResult | null }) {
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
            <span className="text-sm text-ink/60">Claim strength</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${strengthStyles[result.strength]}`}
            >
              {result.strength}
            </span>
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

function SuggestedAsks({ asks }: { asks: SuggestedAsks }) {
  const tiers = useMemo(
    () =>
      [
        ["Conservative", asks.conservative],
        ["Standard", asks.standard],
        ["Aggressive", asks.aggressive]
      ] as const,
    [asks]
  );

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">
        Suggested asks
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {tiers.map(([label, items]) => (
          <div key={label}>
            <h3 className="text-sm font-semibold text-ink">{label}</h3>
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

function PolicySection({ policies }: { policies: Policy[] }) {
  return (
    <Section title="Official basis">
      {policies.length === 0 ? (
        <FallbackText>No matching official policy found in local demo data.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {policies.map((policy) => (
            <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" key={policy.policy_id}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-ink">{policy.policy_name}</h3>
                  <p className="text-sm text-ink/60">{policy.provider}</p>
                </div>
                <a
                  className="text-sm font-semibold text-mint hover:text-coral"
                  href={policy.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Source
                </a>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink/75">{policy.summary}</p>
              <TagList items={policy.compensation_or_rights} />
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function CaseSection({ cases }: { cases: Case[] }) {
  return (
    <Section title="Similar cases">
      {cases.length === 0 ? (
        <FallbackText>No similar local case found yet.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {cases.map((item) => (
            <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" key={item.case_id}>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-ink">{item.brand_or_airline}</h3>
                <p className="text-sm text-ink/60">
                  {item.provider} · {item.booking_channel} · {item.confidence} confidence
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink/75">{item.facts}</p>
              <p className="mt-3 text-sm leading-6 text-ink">
                <span className="font-semibold">Outcome:</span> {item.actual_outcome}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/75">{item.reusable_lesson}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function ScriptSection({
  scripts,
  copiedScriptId,
  onCopy
}: {
  scripts: Script[];
  copiedScriptId: string | null;
  onCopy: (script: Script) => Promise<void>;
}) {
  return (
    <Section title="Scripts">
      {scripts.length === 0 ? (
        <FallbackText>No matching script found in local demo data.</FallbackText>
      ) : (
        <div className="grid gap-3">
          {scripts.map((script) => (
            <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm" key={script.script_id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold capitalize text-ink">
                    {script.channel.replaceAll("_", " ")}
                  </h3>
                  <p className="text-sm text-ink/60">
                    {script.tone.replaceAll("_", " ")} · {script.when_to_use}
                  </p>
                </div>
                <button
                  className="h-10 rounded-lg border border-ink/15 px-4 text-sm font-semibold text-ink transition hover:border-mint hover:text-mint"
                  type="button"
                  onClick={() => onCopy(script)}
                >
                  {copiedScriptId === script.script_id ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-4 rounded-lg bg-paper p-4 text-sm leading-6 text-ink/80">
                {script.template}
              </p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li className="flex gap-3 text-sm leading-6 text-ink/75" key={item}>
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">{title}</h2>
      {children}
    </section>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-medium text-mint" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function FallbackText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-5 text-sm text-ink/65">
      {children}
    </div>
  );
}
