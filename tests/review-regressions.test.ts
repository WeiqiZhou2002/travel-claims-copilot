import { describe, expect, it, vi } from "vitest";
import { emptyClaimFacts } from "../lib/claimFacts";
import { processIntake } from "../lib/intake";
import { buildAnalysisFromFacts } from "../lib/analyze";
import policies from "../data/policies.json";
import cases from "../data/cases.json";
import scripts from "../data/scripts.json";
import type { Policy, Case, Script } from "../lib/types";
import { POST as analyzePost } from "../app/api/analyze/route";
import { POST as intakePost } from "../app/api/intake/route";

describe("request boundaries", () => {
  it("bounds repeated public intake requests", async () => {
    vi.stubEnv("LLM_PROVIDER", "disabled");
    try {
      const statuses: number[] = [];
      for (let index = 0; index < 65; index++) {
        const response = await intakePost(new Request("http://localhost/api/intake", { method: "POST", body: JSON.stringify({ message: "Marriott hotel has no room." }) }));
        statuses.push(response.status);
      }
      expect(statuses).toContain(429);
    } finally { vi.unstubAllEnvs(); }
  });
  it("checks safety in structured facts even when description is omitted", async () => {
    const facts = { ...emptyClaimFacts(), issueType: "hotel_walk", providerType: "hotel", provider: "Marriott",
      userGoal: "I want to sue the hotel over my injury and hospitalization" };
    const response = await analyzePost(new Request("http://localhost/api/analyze", { method: "POST", body: JSON.stringify({ facts }) }));
    expect(response.status).toBe(422);
    expect((await response.json()).safety).toBeDefined();
  });
  it.each([analyzePost, intakePost])("bounds actual body bytes without trusting Content-Length", async (post) => {
    const request = new Request("http://localhost/api", { method: "POST",
      body: JSON.stringify({ description: "hotel walk", message: "hotel walk", padding: "x".repeat(65_000) }) });
    expect((await post(request)).status).toBe(413);
  });
});

const analyze = (facts: ReturnType<typeof emptyClaimFacts>) =>
  buildAnalysisFromFacts(facts, policies as Policy[], cases as Case[], scripts as Script[]);

describe("consistent analysis", () => {
  it("does not use synthetic success stories as similar traveler cases", () => {
    const result = analyze({ ...emptyClaimFacts(), issueType: "hotel_walk", providerType: "hotel", provider: "Marriott" });
    expect(result.similarCases.some(item => item.source_type === "synthetic_example")).toBe(false);
  });
  it("does not claim Bonvoy membership or hide unverified guarantee requirements", () => {
    const result = analyze({ ...emptyClaimFacts(), issueType: "hotel_walk", providerType: "hotel", provider: "Marriott",
      loyaltyStatus: "Not a member", bookingChannel: "ota" });
    expect(result.scripts.map(script => script.template).join(" ")).not.toContain("my Marriott Bonvoy number attached");
    expect(result.evidenceCoverage.unresolvedConditionCount + result.evidenceCoverage.unmetRemedyConditionCount).toBeGreaterThan(0);
  });
  it("does not request an unused-ticket refund after a completed short delay", async () => {
    const intake = {facts:{...emptyClaimFacts(),issueType:"airline_delay" as const,providerType:"airline" as const,provider:"United",operatingCarrier:"United",arrivalDelayMinutes:30,disruptionReason:"weather" as const,journeyStage:"completed" as const,origin:{city:"New York",airport:null,country:"United States",region:"US" as const},destination:{city:"Los Angeles",airport:null,country:"United States",region:"US" as const}}};
    const result = analyze(intake.facts);
    expect(result.scripts.some(script => script.script_id === "us_dot_refund_request_en")).toBe(false);
    expect(result.suggestedAsks.standard.join(" ")).not.toMatch(/refund/i);
    expect(result.evidenceChecklist.join(" ")).not.toMatch(/refund|no alternative/i);
    expect(result.handlingPlaybook?.askLadder.join(" ")).not.toMatch(/refund/i);
  });
  it("does not contradict a voluntary passenger in a copyable script", () => {
    const result = analyze({ ...emptyClaimFacts(), issueType: "denied_boarding", providerType: "airline",
      provider: "Delta", operatingCarrier: "Delta", origin: { city: "New York", country: "United States", region: "US", airport: null },
      disruptionReason: "oversales", deniedBoardingKind: "voluntary", journeyStage: "completed" });
    expect(result.scripts.some(script => script.template.includes("did not volunteer"))).toBe(false);
  });
});

describe.runIf(process.env.RUN_LIVE_LLM_EVALS === "1")("live model review regression accuracy", () => {
  it("recognizes injury while respecting an explicit denial and keeps a detected risk across turns", async () => {
    const ordinary = await processIntake("My Marriott hotel was oversold. I was not injured and do not want to sue anyone. I only need a replacement room.", emptyClaimFacts(), {});
    expect(ordinary.status).not.toBe("unsupported");
    const injury = await processIntake("My Marriott hotel was oversold and I broke my arm.", emptyClaimFacts(), {});
    expect(injury.status).toBe("unsupported");
    const followup = await processIntake("Please give me the normal compensation email.", injury.facts, {});
    expect(followup.status).toBe("unsupported");
  });
  it("does not invent oversales for a document-related denial", async () => {
    const result = await processIntake(
      "United denied boarding from New York to Los Angeles because my passport was invalid; I did not volunteer. I am at the airport.",
      emptyClaimFacts(), {}
    );
    expect(result.facts.disruptionReason).toBe("unknown");
  });
  it("distinguishes the operating carrier from the marketed airline", async () => {
    const result = await processIntake(
      "My United flight from New York to Paris was delayed 4 hours by a mechanical issue. The flight was operated by Lufthansa. I reached my final destination.",
      emptyClaimFacts(), {}
    );
    expect(result.facts.operatingCarrier).toBe("Lufthansa");
    expect(result.facts.operatingCarrierRegion).toBe("EU_EEA_CH");
  });
  it("keeps final arrival delay distinct from arriving early at the airport", async () => {
    const result = await processIntake(
      "My Air France flight from Paris to New York was delayed. I got to the airport 4 hours early, but arrived at my final destination 90 minutes late. It was mechanical.",
      emptyClaimFacts(), {}
    );
    expect(result.facts.arrivalDelayMinutes).toBe(90);
  });
  it("provides airport guidance without demanding a future arrival time", async () => {
    const first = await processIntake(
      "My United flight from New York to Los Angeles is delayed for a mechanical issue. I am at the airport.",
      emptyClaimFacts(), {}
    );
    const second = await processIntake(
      "还没有起飞，不知道最终会晚到多久。", first.facts, {}
    );
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(second.facts.journeyStage).toBe("at_airport");
    expect(second.facts.arrivalDelayMinutes).toBeNull();
  });
});
