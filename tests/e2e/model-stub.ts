import type { Page } from "@playwright/test";

import { emptyClaimFacts, parseClaimFacts, type ClaimFacts } from "../../lib/claimFacts";
import { processIntake } from "../../lib/intake";

type FactPatch = Partial<ClaimFacts>;

const paris = { city: "Paris", airport: "CDG", country: "France", region: "EU_EEA_CH" } as const;
const newYork = {
  city: "New York",
  airport: "JFK",
  country: "United States",
  region: "US"
} as const;
const chicago = {
  city: "Chicago",
  airport: "ORD",
  country: "United States",
  region: "US"
} as const;
const beijing = { city: "Beijing", airport: "PEK", country: "China", region: "CN" } as const;
const losAngeles = {
  city: "Los Angeles",
  airport: "LAX",
  country: "United States",
  region: "US"
} as const;

const unitedChinaCancellation: FactPatch = {
  issueType: "airline_cancellation",
  providerType: "airline",
  provider: "United",
  operatingCarrier: "United",
  origin: chicago,
  destination: beijing,
  disruptionType: "cancellation",
  disruptionReasonStatus: "unavailable",
  journeyStage: "at_airport",
  confidence: "high"
};

/**
 * What a structured-output model would extract for each scripted browser message. The stub stands
 * in for the model only: the real intake still validates, safety-checks and asks follow-ups.
 * Extraction accuracy is measured separately by the live evaluations (npm run eval:intake).
 */
const modelTurns: Record<string, FactPatch> = {
  "I have a confirmed Marriott reservation booked directly, but the hotel had no room when I arrived.":
    {
      issueType: "unknown",
      providerType: "hotel",
      provider: "Marriott",
      bookingChannel: "direct",
      confidence: "high"
    },
  "My Air France flight from Paris to New York was cancelled. I was rerouted and reached my final destination four hours late.":
    {
      issueType: "airline_cancellation",
      providerType: "airline",
      provider: "Air France",
      operatingCarrier: "Air France",
      origin: paris,
      destination: newYork,
      disruptionType: "cancellation",
      arrivalDelayMinutes: 240,
      journeyStage: "completed",
      confidence: "high"
    },
  "I don't know the reason.": {
    disruptionReason: "unknown",
    disruptionReasonStatus: "unavailable"
  },
  "My United flight from Chicago to Beijing was cancelled. I am at the airport and no reason was given.":
    unitedChinaCancellation,
  "My American Airlines flight from JFK to LAX was oversold and I was involuntarily denied boarding.":
    {
      issueType: "denied_boarding",
      providerType: "airline",
      provider: "American Airlines",
      operatingCarrier: "American Airlines",
      origin: newYork,
      destination: losAngeles,
      disruptionType: "denied_boarding",
      disruptionReason: "oversales",
      deniedBoardingKind: "involuntary",
      confidence: "high"
    },
  "I am at the airport.": { journeyStage: "at_airport" }
};

export function stubModelOutput(message: string, priorFacts: ClaimFacts): ClaimFacts {
  const patch = modelTurns[message];
  if (!patch) throw new Error(`No stubbed model output for browser message: ${message}`);
  return { ...priorFacts, ...patch };
}

/** Serves /api/intake with the real intake pipeline and a stubbed structured-output model. */
export async function stubIntakeModel(page: Page): Promise<void> {
  await page.route("**/api/intake", async (route) => {
    const body = route.request().postDataJSON() as { message: string; facts: unknown };
    const parsed = body.facts ? parseClaimFacts(body.facts) : null;
    if (parsed && !parsed.success) throw new Error(parsed.errors.join("; "));
    const priorFacts = parsed?.data ?? emptyClaimFacts();
    const result = await processIntake(body.message, priorFacts, {
      llmClient: {
        async generate<T>(): Promise<T> {
          return stubModelOutput(body.message, priorFacts) as T;
        }
      }
    });
    await route.fulfill({ json: result });
  });
}
