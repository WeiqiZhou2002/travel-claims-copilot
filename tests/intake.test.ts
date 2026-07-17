import { describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/intake/route";
import { emptyClaimFacts, normalizeClaimFacts } from "../lib/claimFacts";
import { processIntake } from "../lib/intake";
import { OpenAIResponsesClient, type StructuredOutputClient } from "../lib/llm";

describe("deterministic intake fallback", () => {
  it("understands a natural Paris cancellation without an explicit EU261 keyword", async () => {
    const result = await processIntake(
      "My Air France flight from Paris was cancelled. I was rerouted and arrived at my final destination four hours late.",
      emptyClaimFacts(),
      { llmClient: null }
    );

    expect(result.facts.issueType).toBe("eu261_delay_or_cancellation");
    expect(result.facts.origin.country).toBe("France");
    expect(result.facts.arrivalDelayMinutes).toBe(240);
    expect(result.status).toBe("needs_info");
    expect(result.missingFields).toEqual(["destination", "disruptionReason"]);
  });

  it("merges a follow-up answer into prior facts", async () => {
    const first = await processIntake(
      "My Air France flight from Paris was cancelled and I arrived four hours late.",
      emptyClaimFacts(),
      { llmClient: null }
    );
    const second = await processIntake(
      "I was flying to New York and Air France said it was a mechanical issue.",
      first.facts,
      { llmClient: null }
    );

    expect(second.status).toBe("ready");
    expect(second.facts.destination.country).toBe("United States");
    expect(second.facts.disruptionReason).toBe("mechanical");
  });
});

describe("LLM intake", () => {
  it("uses validated structured model output when a client is configured", async () => {
    const llmFacts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "hotel_walk",
      providerType: "hotel",
      provider: "Marriott",
      disruptionType: "hotel_walk",
      confidence: "high"
    });
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue(llmFacts)
    };

    const result = await processIntake("酒店说超售没房", emptyClaimFacts(), {
      llmClient: client
    });

    expect(result.status).toBe("ready");
    expect(result.extractionMode).toBe("llm");
    expect(result.facts.provider).toBe("Marriott");
  });

  it("falls back safely when model output is invalid", async () => {
    const client: StructuredOutputClient = {
      generate: vi.fn().mockResolvedValue({ issueType: "invented_type" })
    };

    const result = await processIntake(
      "United cancelled my flight because the crew timed out.",
      emptyClaimFacts(),
      { llmClient: client }
    );

    expect(result.extractionMode).toBe("deterministic");
    expect(result.warning).toBe("llm_fallback_used");
    expect(result.facts.issueType).toBe("controllable_airline_cancellation");
  });
});

describe("OpenAI Responses client", () => {
  it("requests strict JSON Schema output without storing the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(emptyClaimFacts()) }
              ]
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new OpenAIResponsesClient({
      apiKey: "test-key",
      model: "test-model",
      fetcher
    });

    await client.generate({
      schemaName: "test_schema",
      schema: { type: "object" },
      instructions: "Extract facts.",
      input: "Example"
    });

    const request = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(request.model).toBe("test-model");
    expect(request.store).toBe(false);
    expect(request.reasoning).toEqual({ effort: "none" });
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      name: "test_schema",
      strict: true
    });
  });
});

describe("intake API", () => {
  it("returns a conversational follow-up with accumulated facts", async () => {
    const request = new Request("http://localhost/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "My Air France flight from Paris was cancelled and I arrived four hours late."
      })
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("needs_info");
    expect(result.question).toContain("Where did the flight depart");
  });
});
