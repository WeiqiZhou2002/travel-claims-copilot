"use client";

import { useState } from "react";
import type { ClaimFacts } from "../lib/claimFacts";
import type { AnalysisResult } from "../lib/types";

export function FactEditor({
  facts,
  disabled,
  onChange,
  onAnalyze,
}: {
  facts: ClaimFacts;
  disabled: boolean;
  onChange: (facts: ClaimFacts) => void;
  onAnalyze: () => void;
}) {
  const inputClass =
    "mt-1 w-full rounded border border-ink/20 bg-white px-2 py-2 text-sm";
  return (
    <details className="rounded-lg border border-ink/10 bg-white p-5">
      <summary className="cursor-pointer font-semibold">
        Review or correct facts
      </summary>
      <fieldset disabled={disabled} className="mt-4 space-y-3 text-sm">
        <label className="block">
          {facts.providerType === "airline" ? "Ticketing provider" : "Provider"}
          <input
            className={inputClass}
            maxLength={120}
            value={
              (facts.providerType === "airline"
                ? (facts.bookingProvider ?? facts.validatingCarrier)
                : facts.provider) ?? ""
            }
            onChange={(event) =>
              onChange(
                facts.providerType === "airline"
                  ? {
                      ...facts,
                      bookingProvider: event.target.value || null,
                      validatingCarrier: null,
                    }
                  : { ...facts, provider: event.target.value || null },
              )
            }
          />
        </label>
        {facts.providerType === "hotel" ? (
          <label className="block">
            Membership status
            <input
              className={inputClass}
              maxLength={120}
              value={facts.loyaltyStatus ?? ""}
              onChange={(event) =>
                onChange({
                  ...facts,
                  loyaltyStatus: event.target.value || null,
                })
              }
            />
          </label>
        ) : (
          <>
            <label className="block">
              Actual operating airline
              <input
                className={inputClass}
                maxLength={120}
                value={facts.operatingCarrier ?? ""}
                onChange={(event) =>
                  onChange({
                    ...facts,
                    operatingCarrier: event.target.value || null,
                    operatingCarrierRegion: null,
                  })
                }
              />
            </label>
            <label className="block">
              Trip stage
              <select
                className={inputClass}
                value={facts.journeyStage}
                onChange={(event) =>
                  onChange({
                    ...facts,
                    journeyStage: event.target
                      .value as ClaimFacts["journeyStage"],
                  })
                }
              >
                {(
                  [
                    "unknown",
                    "pre_trip",
                    "at_airport",
                    "en_route",
                    "completed",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Final arrival delay (minutes; leave blank if not known yet)
              <input
                className={inputClass}
                type="number"
                min="0"
                step="1"
                value={facts.arrivalDelayMinutes ?? ""}
                onChange={(event) =>
                  onChange({
                    ...facts,
                    arrivalDelayMinutes:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="block">
              Accepted or used an alternative flight, credit or voucher?
              <select
                className={inputClass}
                value={
                  facts.acceptedAlternative === null
                    ? "unknown"
                    : String(facts.acceptedAlternative)
                }
                onChange={(event) =>
                  onChange({
                    ...facts,
                    acceptedAlternative:
                      event.target.value === "unknown"
                        ? null
                        : event.target.value === "true",
                  })
                }
              >
                <option value="unknown">Not confirmed</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </>
        )}
        <p className="text-xs text-ink/60">
          Changes invalidate the previous analysis. For flights, confirm the
          actual airline operating the service.
        </p>
        <button
          type="button"
          className="rounded bg-ink px-3 py-2 text-white disabled:opacity-40"
          onClick={onAnalyze}
        >
          Analyze corrected facts
        </button>
      </fieldset>
    </details>
  );
}

export function RemedySection({ result }: { result: AnalysisResult }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
        Requests and remaining checks
      </h2>
      {result.remedies.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border border-ink/10 bg-white p-4"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold">{item.title}</h3>
            <span className="text-xs text-ink/60">
              {item.status === "not_supported"
                ? "Not supported by current facts or data"
                : "Conditions still need verification"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            {item.explanation}
          </p>
          {item.sourceIds.length > 0 && (
            <p className="mt-2 text-xs text-ink/60">
              Basis:{" "}
              {item.sourceIds
                .map(
                  (id) =>
                    result.officialBasis.find(
                      (policy) => policy.policy_id === id,
                    )?.policy_name ?? id,
                )
                .join("; ")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

export function OutcomeSection({
  facts,
  result,
}: {
  facts: ClaimFacts;
  result: AnalysisResult;
}) {
  const [rating, setRating] = useState("unclear");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  function save() {
    try {
      const key = "travel-claims-outcomes-v1";
      const previous: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      const entries = Array.isArray(previous) ? previous.slice(-19) : [];
      localStorage.setItem(
        key,
        JSON.stringify([
          ...entries,
          {
            version: 1,
            recordedAt: new Date().toISOString(),
            issueType: facts.issueType,
            provider: facts.provider,
            rating,
            notes,
            suggestedAsks: result.suggestedAsks,
          },
        ]),
      );
      setNotice("Saved on this device. This is not a verified community case.");
    } catch {
      setNotice("Could not save locally. Export the case file instead.");
    }
  }
  function exportCase() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              exportedAt: new Date().toISOString(),
              facts,
              result,
              feedback: { rating, notes },
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "travel-claim.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-3 rounded-lg border border-ink/10 bg-white p-5">
      <h2 className="font-semibold">Record the outcome</h2>
      <label className="block text-sm">
        Was this useful?
        <select
          className="ml-3 rounded border p-2"
          value={rating}
          onChange={(event) => setRating(event.target.value)}
        >
          <option value="unclear">Not sure yet</option>
          <option value="useful">Useful</option>
          <option value="not_useful">Not useful</option>
        </select>
      </label>
      <label className="block text-sm">
        Action taken and provider response
        <textarea
          className="mt-2 w-full rounded border p-3"
          value={notes}
          maxLength={2000}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <p className="text-xs text-ink/60">
        Outcome notes stay in this browser. Export includes your case facts and
        may contain personal information.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={save}
        >
          Save outcome locally
        </button>
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={exportCase}
        >
          Export case file
        </button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
