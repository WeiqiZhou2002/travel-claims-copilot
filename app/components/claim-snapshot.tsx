import type { ClaimFacts } from "../../lib/claimFacts";
import type { IntakeExtractionMode } from "../../lib/intake";
import { issueLabels } from "./labels";
export function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-8 text-center text-ink/65">
      Complete the guided intake to retrieve official references, reviewed
      cases, and scripts.
    </div>
  );
}

export function ClaimSnapshot({
  facts,
  extractionMode,
}: {
  facts: ClaimFacts | null;
  extractionMode: IntakeExtractionMode | null;
}) {
  const route = facts
    ? [formatLocation(facts.origin), formatLocation(facts.destination)]
        .filter(Boolean)
        .join(" → ")
    : "";

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">
          Case file
        </h2>
        {extractionMode ? (
          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">
            {extractionMode === "llm" ? "LLM" : "Scope check"}
          </span>
        ) : null}
      </div>

      {facts ? (
        <dl className="mt-4 space-y-3 text-sm">
          <FactRow
            label="Issue"
            value={issueLabels[facts.issueType] ?? "Needs more detail"}
          />
          {facts.providerType === "airline" ? (
            <>
              <FactRow
                label="Ticketing provider"
                value={
                  facts.bookingProvider ?? facts.validatingCarrier ?? "Unknown"
                }
              />
              <FactRow
                label="Operating carrier"
                value={facts.operatingCarrier ?? "Unknown"}
              />
            </>
          ) : (
            <FactRow label="Provider" value={facts.provider ?? "Unknown"} />
          )}
          <FactRow label="Route" value={route || "Unknown"} />
          <FactRow
            label="Event"
            value={facts.disruptionType.replaceAll("_", " ")}
          />
          {facts.providerType === "airline" ? (
            <FactRow label="Reason" value={formatDisruptionReason(facts)} />
          ) : null}
          {facts.providerType === "airline" &&
          facts.journeyStage !== "unknown" ? (
            <FactRow
              label="Stage"
              value={facts.journeyStage.replaceAll("_", " ")}
            />
          ) : null}
          {facts.providerType === "airline" &&
          facts.disruptionTiming !== "unknown" ? (
            <FactRow
              label="Timing"
              value={facts.disruptionTiming.replaceAll("_", " ")}
            />
          ) : null}
          {facts.providerType === "airline" &&
          facts.ticketType !== "unknown" ? (
            <FactRow label="Ticket" value={formatTicket(facts)} />
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 text-sm leading-6 text-ink/65">
          Facts will appear here as the conversation becomes specific enough to
          search.
        </p>
      )}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 border-b border-ink/5 pb-3 last:border-0 last:pb-0">
      <dt className="text-ink/45">{label}</dt>
      <dd className="font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}

function formatLocation(location: ClaimFacts["origin"]): string {
  return location.airport ?? location.city ?? location.country ?? "";
}

function formatDisruptionReason(facts: ClaimFacts): string {
  if (facts.disruptionReasonStatus === "unavailable") {
    return "Not provided by airline";
  }
  return facts.disruptionReason === "unknown"
    ? "Not provided yet"
    : facts.disruptionReason.replaceAll("_", " ");
}

function formatTicket(facts: ClaimFacts): string {
  const issuer =
    facts.awardProgram ?? facts.bookingProvider ?? facts.validatingCarrier;
  return issuer ? `${facts.ticketType} · ${issuer}` : facts.ticketType;
}
