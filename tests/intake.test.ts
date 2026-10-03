import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/intake/route";
import { POST as analyzePost } from "../app/api/analyze/route";
import { emptyClaimFacts, normalizeClaimFacts, type ClaimFacts } from "../lib/claimFacts";
import { parseAnalyzeClaimRequest } from "../lib/api/analyze-contract";
import { createIntakePostHandler, processClaimTurn, processIntake } from "../lib/intake";
import { isBlockedWorkflowStatus } from "../lib/domain/workflow-status";
import { ModelFailure } from "../lib/model/model-error";
import { LocalRawFactExtractor, type RawFactExtractor } from "../lib/model/raw-fact-extractor";
import { canonicalizeProviderName } from "../lib/provider";
import {
  createStructuredOutputClientFromEnv,
  DeepSeekChatCompletionsClient,
  OpenAIResponsesClient,
  resolveLlmProvider
} from "../lib/llm";
import { claimState } from "./fixtures/raw-claims";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("workflow status safety predicate", () => {
  it.each([
    ["unsupported_high_risk", true],
    ["out_of_scope", true],
    ["ready", false],
    ["needs_information", false],
    ["needs_info", false]
  ] as const)("classifies %s blocked=%s", (status, blocked) => {
    expect(isBlockedWorkflowStatus(status)).toBe(blocked);
  });
});

const delayed = (): ClaimFacts => ({
  ...emptyClaimFacts(),
  issueType: "airline_delay",
  providerType: "airline",
  provider: "United",
  confidence: "high"
});

describe("LLM-only guided intake contract (mocked model output, not accuracy evaluation)", () => {
  it("uses schema-validated model facts without regex overwrites", async () => {
    const output = {
      ...emptyClaimFacts(),
      providerType: "airline" as const,
      issueType: "airline_delay" as const,
      provider: "Lufthansa",
      operatingCarrier: "Lufthansa",
      arrivalDelayMinutes: 90
    };
    const result = await processIntake(
      "Ana arrived in the United Kingdom 4 hours early. United marketed the flight, operated by Lufthansa.",
      emptyClaimFacts(),
      { llmClient: { generate: vi.fn().mockResolvedValue(output) } }
    );
    expect(result.facts.operatingCarrier).toBe("Lufthansa");
    expect(result.facts.provider).toBe("Lufthansa");
    expect(result.facts.arrivalDelayMinutes).toBe(90);
    expect(result.extractionMode).toBe("llm");
    expect(result.warning).toBeUndefined();
  });

  it("does not fill an unknown model output from keyword guesses", async () => {
    const result = await processIntake(
      "My name is Ana. I am in the United Kingdom.",
      emptyClaimFacts(),
      { llmClient: { generate: vi.fn().mockResolvedValue(emptyClaimFacts()) } }
    );
    expect(result.facts.provider).toBeNull();
    expect(result.facts.operatingCarrier).toBeNull();
    expect(result.status).toBe("needs_info");
  });

  it("reports a hotel problem as outside the airline-only scope", async () => {
    const output = {
      ...emptyClaimFacts(),
      providerType: "hotel" as const,
      provider: "Marriott",
      confidence: "high" as const
    };
    const result = await processIntake("万豪到店没有房间了", emptyClaimFacts(), {
      llmClient: { generate: vi.fn().mockResolvedValue(output) }
    });
    expect(result.status).toBe("out_of_scope");
    expect(result.question).toBeNull();
    expect(result.cautions).toEqual([
      "目前只支持航班问题：延误、取消和超售拒载。酒店问题暂不支持。"
    ]);
  });

  it("passes prior facts and the latest correction to the model without mutating prior facts", async () => {
    const prior = delayed();
    const before = structuredClone(prior);
    const generate = vi.fn().mockResolvedValue({ ...delayed(), provider: "Delta" });
    const result = await processIntake("Correction: Delta", prior, { llmClient: { generate } });
    expect(JSON.parse(generate.mock.calls[0][0].input)).toEqual({
      priorFacts: prior,
      latestUserMessage: "Correction: Delta"
    });
    expect(prior).toEqual(before);
    expect(result.facts.provider).toBe("Delta");
  });

  it("preserves model unknowns and explicit acceptance decisions", async () => {
    const output = { ...delayed(), acceptedAlternative: false, arrivalDelayMinutes: null };
    const result = await processIntake("Automatically rebooked", emptyClaimFacts(), {
      llmClient: { generate: vi.fn().mockResolvedValue(output) }
    });
    expect(result.facts.acceptedAlternative).toBe(false);
    expect(result.facts.arrivalDelayMinutes).toBeNull();
  });

  it("fails clearly when unconfigured instead of classifying with rules", async () => {
    await expect(
      processIntake("United oversold", delayed(), { llmClient: null })
    ).rejects.toMatchObject({ category: "not_configured", status: 503 });
  });

  it.each([
    [new DOMException("timeout", "AbortError"), "timeout"],
    [Object.assign(new Error("openai_request_failed"), { status: 401 }), "authentication"],
    [new ModelFailure("upstream_rate_limited", true, true), "rate_limit"],
    [new ModelFailure("invalid_model_schema", true, true), "invalid_output"],
    [new SyntaxError("invalid JSON"), "invalid_output"],
    [new Error("network failed"), "upstream"]
  ])("propagates model failure without changing facts (%s)", async (error, category) => {
    const prior = delayed();
    await expect(
      processIntake("United cancelled", prior, {
        llmClient: { generate: vi.fn().mockRejectedValue(error) }
      })
    ).rejects.toMatchObject({ category });
    expect(prior).toEqual(delayed());
  });

  it("rejects malformed structured output instead of invoking fallback", async () => {
    await expect(
      processIntake("United oversold", emptyClaimFacts(), {
        llmClient: { generate: vi.fn().mockResolvedValue({ provider: "United" }) }
      })
    ).rejects.toMatchObject({ category: "invalid_output" });
  });

  it("normalizes only exact aliases in structured fields", () => {
    expect(canonicalizeProviderName("United Kingdom")).toBe("United Kingdom");
    expect(canonicalizeProviderName("Avianca Airlines")).toBe("Avianca Airlines");
    expect(canonicalizeProviderName("AA", "airline")).toBe("American Airlines");
  });

  it("both public free-text endpoints return a retryable failure without configuration", async () => {
    vi.stubEnv("LLM_PROVIDER", "disabled");
    const req = (body: unknown) =>
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    const responses = await Promise.all([
      POST(req({ message: "Marriott oversold" })),
      analyzePost(req({ description: "Marriott oversold" }))
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(responses.map((response) => response.status)).toEqual([503, 503]);
    expect(bodies.map((body) => body.failureCategory)).toEqual([
      "not_configured",
      "not_configured"
    ]);
  });
});

describe("OpenAI Responses client", () => {
  it("requests strict JSON Schema output without storing the response", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(emptyClaimFacts()) }]
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
      input: "Example",
      maxOutputTokens: 1_200
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

describe("DeepSeek Chat Completions client", () => {
  it("uses DeepSeek JSON mode and parses the assistant message", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify(emptyClaimFacts())
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new DeepSeekChatCompletionsClient({
      apiKey: "test-key",
      model: "deepseek-v4",
      baseUrl: "https://api.deepseek.com/",
      fetcher
    });

    const result = await client.generate({
      schemaName: "claim_facts",
      schema: { type: "object", required: ["issueType"] },
      instructions: "Extract facts.",
      input: "Example",
      maxOutputTokens: 1_200
    });

    expect(result).toEqual(emptyClaimFacts());
    expect(fetcher.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");

    const request = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.messages).toEqual([
      {
        role: "system",
        content: expect.stringContaining("valid JSON matching this JSON Schema")
      },
      { role: "user", content: "Example" }
    ]);
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.max_tokens).toBe(1_200);
    expect(request).not.toHaveProperty("text");
    expect(request).not.toHaveProperty("input");
  });

  it("rejects truncated structured output", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { role: "assistant", content: "{}" }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new DeepSeekChatCompletionsClient({ apiKey: "test-key", fetcher });

    await expect(
      client.generate({
        schemaName: "claim_facts",
        schema: { type: "object" },
        instructions: "Extract facts.",
        input: "Example",
        maxOutputTokens: 1_200
      })
    ).rejects.toMatchObject({ code: "invalid_model_schema" });
  });
});

describe("LLM provider configuration", () => {
  it("recognizes the existing OpenAI-compatible DeepSeek environment", () => {
    const env = {
      OPENAI_API_KEY: "test-key",
      OPENAI_INTAKE_MODEL: "deepseek-v4",
      OPENAI_BASE_URL: "https://api.deepseek.com/"
    };

    expect(resolveLlmProvider(env)).toBe("deepseek");
    expect(createStructuredOutputClientFromEnv(env)).toBeInstanceOf(DeepSeekChatCompletionsClient);
  });

  it("respects an explicit OpenAI provider", () => {
    const env = {
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_INTAKE_MODEL: "test-model"
    };

    expect(resolveLlmProvider(env)).toBe("openai");
    expect(createStructuredOutputClientFromEnv(env)).toBeInstanceOf(OpenAIResponsesClient);
  });
});

describe("intake API", () => {
  it("preserves a legacy high-risk block without calling either extractor", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const handler = createIntakePostHandler({ localExtractor, openaiExtractor });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "There is an active fire and I need emergency help",
          facts: null
        })
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("unsupported_high_risk");
    expect(result.question).toBeNull();
    expect(result.missingFields).toEqual([]);
    expect(result.cautions).toEqual([
      "This may require immediate emergency or medical help; this tool cannot analyze it as an ordinary travel claim."
    ]);
    expect(localExtractor.extract).not.toHaveBeenCalled();
    expect(openaiExtractor.extract).not.toHaveBeenCalled();
  });

  it("preserves a legacy out-of-scope block without returning an ordinary ask", async () => {
    const currentFacts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      providerType: "hotel",
      provider: "Hyatt",
      confidence: "high"
    });
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "No additional facts.", facts: currentFacts })
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe("out_of_scope");
    expect(result.question).toBeNull();
    expect(result.missingFields).toEqual([]);
    expect(result.cautions).toEqual([
      "Only airline disruptions are supported right now; hotel problems are not supported."
    ]);
  });
});

describe("canonical revision-safe intake", () => {
  const validProviderConflict = {
    field: "provider",
    candidates: [
      { value: "Delta", source: "deterministic_extraction" },
      { value: "Air France", source: "openai_extraction" }
    ]
  };

  it.each([
    [
      "high-risk",
      {
        message: "There is an active fire and I need emergency help",
        prior: claimState(),
        baseRevision: 0,
        requestedMode: "local"
      },
      "unsupported_high_risk"
    ],
    [
      "out-of-scope",
      {
        message: "No additional facts.",
        prior: claimState({ providerType: "hotel", provider: "Hyatt" }),
        baseRevision: 0,
        requestedMode: "local"
      },
      "out_of_scope"
    ]
  ] as const)("preserves the canonical top-level status for %s", async (_label, body, status) => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.status).toBe(status);
    expect(result.status).toBe(result.result.status);
  });

  it.each([
    ["stale base revision", { message: "new facts", prior: claimState({}, 2), baseRevision: 1 }],
    [
      "message plus correction",
      {
        message: "new facts",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    ["blank message", { message: "", prior: claimState(), baseRevision: 0 }],
    [
      "whitespace correction message",
      {
        message: "  ",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: [] }
      }
    ],
    [
      "empty correction",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: {}, clear: [] }
      }
    ],
    [
      "null correction set",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: null }, clear: [] }
      }
    ],
    [
      "duplicate clear",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: {}, clear: ["provider", "provider"] }
      }
    ],
    [
      "unknown clear",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: {}, clear: ["origin.region"] }
      }
    ],
    [
      "set-clear overlap",
      {
        message: "",
        prior: claimState(),
        baseRevision: 0,
        correction: { set: { provider: "Delta" }, clear: ["provider"] }
      }
    ],
    [
      "untrusted provenance source",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          provenance: { provider: { source: "client_asserted", factsRevision: 0 } }
        },
        baseRevision: 0
      }
    ],
    [
      "untrusted conflict source",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [{ value: "Delta", source: "user_correction" }]
            }
          ]
        },
        baseRevision: 0
      }
    ],
    [
      "untrusted unresolved path",
      {
        message: "new facts",
        prior: { ...claimState(), unresolvedFields: ["origin.region"] },
        baseRevision: 0
      }
    ],
    [
      "duplicate conflict fields",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [validProviderConflict, structuredClone(validProviderConflict)],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict with one candidate",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [{ value: "Delta", source: "deterministic_extraction" }]
            }
          ],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict with duplicate candidate sources",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [
                { value: "Delta", source: "deterministic_extraction" },
                { value: "Air France", source: "deterministic_extraction" }
              ]
            }
          ],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict with equal normalized values",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [
            {
              field: "provider",
              candidates: [
                { value: "Delta", source: "deterministic_extraction" },
                { value: " Delta ", source: "openai_extraction" }
              ]
            }
          ],
          unresolvedFields: ["provider"]
        },
        baseRevision: 0
      }
    ],
    [
      "a conflict missing its unresolved marker",
      {
        message: "new facts",
        prior: {
          ...claimState(),
          conflicts: [validProviderConflict],
          unresolvedFields: []
        },
        baseRevision: 0
      }
    ]
  ])("rejects %s", (_label, request) => {
    expect(parseAnalyzeClaimRequest(request).success).toBe(false);
  });

  it.each([
    [
      "duplicate conflict fields",
      {
        ...claimState(),
        conflicts: [validProviderConflict, structuredClone(validProviderConflict)],
        unresolvedFields: ["provider"]
      }
    ],
    [
      "invalid candidate cardinality",
      {
        ...claimState(),
        conflicts: [
          {
            field: "provider",
            candidates: [{ value: "Delta", source: "deterministic_extraction" }]
          }
        ],
        unresolvedFields: ["provider"]
      }
    ],
    [
      "conflict not marked unresolved",
      {
        ...claimState(),
        conflicts: [validProviderConflict],
        unresolvedFields: []
      }
    ]
  ])("rejects route state with %s before extraction", async (_label, prior) => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const handler = createIntakePostHandler({ localExtractor, openaiExtractor });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", prior, baseRevision: 0 })
      })
    );

    expect(response.status).toBe(422);
    expect(localExtractor.extract).not.toHaveBeenCalled();
    expect(openaiExtractor.extract).not.toHaveBeenCalled();
  });

  it("rejects malformed state before calling either extractor", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };

    await expect(
      processClaimTurn(
        {
          message: "new facts",
          prior: {
            ...claimState(),
            provenance: { "origin.region": { source: "user_message", factsRevision: 0 } }
          },
          baseRevision: 0
        },
        { localExtractor, openaiExtractor }
      )
    ).rejects.toThrow("invalid_analyze_claim_request");
    expect(localExtractor.extract).not.toHaveBeenCalled();
    expect(openaiExtractor.extract).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an unresolved mask without a conflict",
      claimState(
        {
          incidentType: "denied_boarding",
          origin: { airport: "JFK" },
          deniedBoardingKind: "voluntary"
        },
        0,
        { unresolvedFields: ["deniedBoardingKind"] }
      )
    ],
    [
      "a valid stored conflict",
      claimState(
        {
          incidentType: "denied_boarding",
          origin: { airport: "JFK" },
          provider: "Delta"
        },
        0,
        {
          conflicts: [validProviderConflict as never],
          unresolvedFields: ["provider"]
        }
      )
    ]
  ])(
    "returns needs_information for %s even when scenario admission resolves",
    async (_label, prior) => {
      const response = await processClaimTurn(
        { message: "No new material fact.", prior, baseRevision: 0, requestedMode: "local" },
        {
          localExtractor: {
            provider: "local",
            model: null,
            extract: vi.fn().mockResolvedValue({ set: {} })
          }
        }
      );

      expect(response.status).toBe("needs_information");
    }
  );

  it.each([
    [undefined, 0],
    ["local", 0],
    ["gpt", 1]
  ] as const)("calls OpenAI only for requestedMode %s", async (requestedMode, openaiCalls) => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    await processClaimTurn(
      {
        message: "No new material fact.",
        prior: claimState(),
        baseRevision: 0,
        ...(requestedMode ? { requestedMode } : {})
      },
      { localExtractor, openaiExtractor }
    );

    expect(localExtractor.extract).toHaveBeenCalledOnce();
    expect(openaiExtractor.extract).toHaveBeenCalledTimes(openaiCalls);
  });

  it("preserves a nonblank message exactly in the parsed contract", () => {
    const message = "  Keep this spacing and punctuation!  ";
    const parsed = parseAnalyzeClaimRequest({ message, prior: claimState(), baseRevision: 0 });

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.errors.join("; "));
    expect(parsed.data.message).toBe(message);
  });

  it("passes the exact nonblank message to extractors", async () => {
    const message = "  Keep this spacing and punctuation!  ";
    const extract = vi.fn().mockResolvedValue({ set: {} });

    await processClaimTurn(
      { message, prior: claimState(), baseRevision: 0, requestedMode: "local" },
      { localExtractor: { provider: "local", model: null, extract } }
    );

    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ message }));
  });

  it("reports a hotel problem as outside the airline-only scope in canonical intake", async () => {
    const response = await processClaimTurn(
      {
        message: "I had a reservation at Marriott, and the hotel had no room.",
        prior: claimState(),
        baseRevision: 0,
        requestedMode: "local"
      },
      { localExtractor: new LocalRawFactExtractor() }
    );

    expect(response.status).toBe("out_of_scope");
    expect(response.claimState.facts.providerType).toBe("hotel");
    expect(response.claimState.facts.incidentType).toBeNull();
  });

  it("masks a legacy dual-extractor conflict instead of projecting the old value as ready", async () => {
    const currentFacts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "denied_boarding",
      providerType: "airline",
      provider: "Delta",
      origin: { city: null, airport: "JFK", country: "United States", region: "US" },
      disruptionType: "denied_boarding",
      deniedBoardingKind: "voluntary",
      confidence: "high"
    });
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: { deniedBoardingKind: "voluntary" } })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: { deniedBoardingKind: "involuntary" } })
    };

    const result = await processIntake("I was bumped.", currentFacts, {
      localExtractor,
      openaiExtractor
    });

    expect(result.status).toBe("needs_info");
    expect(result.facts.deniedBoardingKind).toBe("unknown");
    expect(result.missingFields).toContain("deniedBoardingKind");
  });

  it("asks a generic legacy question when an unresolved field is not a legacy missing field", async () => {
    const currentFacts = normalizeClaimFacts({
      ...emptyClaimFacts(),
      issueType: "denied_boarding",
      providerType: "airline",
      provider: "Delta",
      origin: { city: null, airport: "JFK", country: "United States", region: "US" },
      disruptionType: "denied_boarding",
      deniedBoardingKind: "voluntary",
      loyaltyStatus: "Gold Medallion",
      confidence: "high"
    });
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: { loyaltyStatus: "Gold" } })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({ set: { loyaltyStatus: "Platinum" } })
    };

    const result = await processIntake("My status changed.", currentFacts, {
      localExtractor,
      openaiExtractor
    });

    expect(result.status).toBe("needs_info");
    expect(result.missingFields).toEqual([]);
    expect(result.question).toBe("Please add a little more detail about what happened.");
  });

  it("runs a stateless two-turn correction without replaying narrative or extractors", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({
        set: {
          incidentType: "denied_boarding",
          "origin.airport": "JFK",
          deniedBoardingKind: "voluntary"
        }
      })
    };
    const openaiExtractor: RawFactExtractor = {
      provider: "openai",
      model: "gpt-5.6-luna",
      extract: vi.fn().mockResolvedValue({
        set: {
          incidentType: "denied_boarding",
          "origin.airport": "JFK",
          deniedBoardingKind: "voluntary"
        }
      })
    };
    const handler = createIntakePostHandler({ localExtractor, openaiExtractor });

    const firstResponse = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "My original anonymous denied-boarding narrative.",
          prior: claimState(),
          baseRevision: 0,
          requestedMode: "gpt"
        })
      })
    );
    const first = await firstResponse.json();
    const secondResponse = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "",
          prior: first.claimState,
          baseRevision: first.claimState.revision,
          correction: { set: { deniedBoardingKind: "involuntary" }, clear: [] },
          requestedMode: "gpt"
        })
      })
    );
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(localExtractor.extract).toHaveBeenCalledTimes(1);
    expect(openaiExtractor.extract).toHaveBeenCalledTimes(1);
    expect(first.baseRevision).toBe(0);
    expect(first.claimState.revision).toBe(1);
    expect(second.baseRevision).toBe(1);
    expect(second.claimState.revision).toBe(2);
    expect(second.claimState.facts.deniedBoardingKind).toBe("involuntary");
    expect(second.result.extraction).toEqual({
      performed: false,
      requestedMode: "gpt",
      provider: null,
      model: null,
      notRunReason: "correction_only"
    });
    expect(JSON.stringify(first)).not.toContain("original anonymous denied-boarding narrative");
    expect(JSON.stringify(second)).not.toContain("original anonymous denied-boarding narrative");
  });

  it("does not select DeepSeek or create an external model without GPT access", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "configured-but-must-not-be-used");
    vi.stubEnv("LLM_PROVIDER", "deepseek");
    const fetcher = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My flight was delayed by 20 minutes.",
          prior: claimState(),
          baseRevision: 0,
          requestedMode: "gpt"
        })
      })
    );

    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps malformed canonical-shaped requests out of the legacy branch", async () => {
    const localExtractor: RawFactExtractor = {
      provider: "local",
      model: null,
      extract: vi.fn().mockResolvedValue({ set: {} })
    };
    const handler = createIntakePostHandler({ localExtractor });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({
          message: "new facts",
          prior: claimState(),
          facts: null
        })
      })
    );

    expect(response.status).toBe(422);
    expect(localExtractor.extract).not.toHaveBeenCalled();
  });

  it("returns a fixed safe 422 envelope for canonical parse failures", async () => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", prior: claimState() })
      })
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "unprocessable_request",
        message: "Request could not be processed.",
        requestId: expect.any(String),
        retryable: false
      }
    });
  });

  it.each([new Error("private upstream response"), "model_refusal", "model_timeout"] as const)(
    "returns a fixed safe 502 for an untrusted canonical rejection",
    async (rejection) => {
      const handler = createIntakePostHandler({
        localExtractor: {
          provider: "local",
          model: null,
          extract: vi.fn().mockRejectedValue(rejection)
        }
      });
      const response = await handler(
        new Request("http://localhost/api/intake", {
          method: "POST",
          body: JSON.stringify({
            message: "new facts",
            prior: claimState(),
            baseRevision: 0,
            requestedMode: "local"
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toEqual({
        error: {
          code: "upstream_failure",
          message: "The analysis service is temporarily unavailable.",
          requestId: expect.any(String),
          retryable: true
        }
      });
      expect(JSON.stringify(body)).not.toContain(
        rejection instanceof Error ? rejection.message : rejection
      );
    }
  );

  it.each([new Error("private legacy detail"), "model_refusal", "model_timeout"] as const)(
    "returns a fixed safe 502 for an untrusted legacy rejection",
    async (rejection) => {
      const handler = createIntakePostHandler({
        localExtractor: {
          provider: "local",
          model: null,
          extract: vi.fn().mockRejectedValue(rejection)
        }
      });
      const response = await handler(
        new Request("http://localhost/api/intake", {
          method: "POST",
          body: JSON.stringify({ message: "new facts", facts: null })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body).toEqual({
        error: {
          code: "upstream_failure",
          message: "The analysis service is temporarily unavailable.",
          requestId: expect.any(String),
          retryable: true
        }
      });
      expect(JSON.stringify(body)).not.toContain(
        rejection instanceof Error ? rejection.message : rejection
      );
    }
  );

  it("returns a fixed safe 422 for invalid legacy facts", async () => {
    const handler = createIntakePostHandler({
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        body: JSON.stringify({ message: "new facts", facts: {} })
      })
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "unprocessable_request",
        message: "Request could not be processed.",
        requestId: expect.any(String),
        retryable: false
      }
    });
  });
});
