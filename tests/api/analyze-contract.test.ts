import { describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/analyze/route";
import { claimState } from "../fixtures/raw-claims";

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://local/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, key) ||
    Object.values(record).some((item) => containsKey(item, key))
  );
}

describe("canonical analyze response", () => {
  it("returns claim state, matching revisions, context, and no strength at any depth", async () => {
    const prior = claimState({
      incidentType: "airline_cancellation",
      providerType: "airline",
      operatingCarrier: "United",
      origin: { airport: "JFK" },
      destination: { airport: "LAX" },
      reasonCategory: "crew",
      userInitiatedChange: false,
      assistance: { refundAccepted: false, reroutingAccepted: false }
    });
    const response = await post({
      message: "No additional facts.",
      prior,
      baseRevision: prior.revision,
      requestedMode: "local"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("claimState");
    expect(body).toHaveProperty("context");
    expect(body.claimState.revision).toBe(body.result.factsRevision);
    expect(containsKey(body, "strength")).toBe(false);
  });

  it("reports correction-only extraction without calling fetch", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const prior = claimState(
      {
        incidentType: "denied_boarding",
        origin: { airport: "JFK" },
        deniedBoardingKind: "voluntary"
      },
      1
    );
    const response = await post({
      message: "",
      prior,
      baseRevision: 1,
      correction: { set: { deniedBoardingKind: "involuntary" }, clear: [] },
      requestedMode: "gpt"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.extraction).toEqual({
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "correction_only"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
