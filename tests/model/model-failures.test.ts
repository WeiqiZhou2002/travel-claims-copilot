import { describe, expect, it, vi } from "vitest";

import { processClaimTurn, type ProcessClaimDependencies } from "../../lib/claim-workflow";
import { processIntake } from "../../lib/intake";
import { OpenAIResponsesClient, type StructuredOutputRequest } from "../../lib/llm";
import {
  classifyModelFailure,
  ModelFailure,
  type ModelFailureCode
} from "../../lib/model/model-error";
import { OpenAIRawFactExtractor, type RawFactExtractor } from "../../lib/model/raw-fact-extractor";
import type { SafeTelemetryEvent } from "../../lib/privacy/safe-telemetry";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

const structuredRequest: StructuredOutputRequest = {
  schemaName: "raw_fact_patch",
  schema: { type: "object" },
  instructions: "Return a sparse patch.",
  input: "A bounded fixture input.",
  maxOutputTokens: 1_200
};

function responsePayload(content: unknown[]): Response {
  return new Response(JSON.stringify({ output: [{ content }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function modelFailure(code: ModelFailureCode): ModelFailure {
  const specs = {
    model_refusal: [false, false],
    model_timeout: [true, true],
    upstream_rate_limited: [true, true],
    upstream_unavailable: [true, true],
    invalid_model_json: [true, true],
    invalid_model_schema: [true, true]
  } as const;
  const [retryable, safeFallbackEligible] = specs[code];
  return new ModelFailure(code, retryable, safeFallbackEligible);
}

function extractor(
  provider: "local" | "openai",
  extract: RawFactExtractor["extract"]
): RawFactExtractor {
  return {
    provider,
    model: provider === "openai" ? "gpt-5.6-luna" : null,
    extract
  } as RawFactExtractor;
}

function dependencies(input: {
  localExtract: RawFactExtractor["extract"];
  openaiExtract: RawFactExtractor["extract"];
  record?: (event: SafeTelemetryEvent) => void;
}): ProcessClaimDependencies {
  const nowMs = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);
  return {
    localExtractor: extractor("local", input.localExtract),
    openaiExtractor: extractor("openai", input.openaiExtract),
    knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
    now: () => "2026-07-20",
    ...(input.record
      ? {
          telemetry: {
            sink: { record: input.record },
            requestId: "req-failure-001",
            nowMs
          }
        }
      : {})
  };
}

const workflowRequest = {
  message: "My United flight was cancelled because of crew and I arrived four hours late.",
  prior: claimState(),
  baseRevision: 0,
  requestedMode: "gpt" as const
};

describe("closed model failure classification", () => {
  it("detects refusal before output text and never retains refusal content", async () => {
    const privateRefusal = "private-refusal-text-marker";
    const client = new OpenAIResponsesClient({
      apiKey: "offline-test-key",
      fetcher: vi.fn().mockResolvedValue(
        responsePayload([
          { type: "refusal", refusal: privateRefusal },
          { type: "output_text", text: '{"set":{}}' }
        ])
      )
    });

    const rejection = await client.generate(structuredRequest).catch((error: unknown) => error);

    expect(rejection).toEqual(modelFailure("model_refusal"));
    expect(JSON.stringify(rejection)).not.toContain(privateRefusal);
    expect((rejection as Error).message).not.toContain(privateRefusal);
  });

  it.each([
    ["AbortError", undefined, "model_timeout"],
    ["Error", 429, "upstream_rate_limited"],
    ["Error", 500, "upstream_unavailable"],
    ["Error", 503, "upstream_unavailable"]
  ] as const)("classifies %s status %s", (name, status, code) => {
    const candidate = Object.assign(new Error("private-error-message"), {
      name,
      ...(status ? { status, body: "private-upstream-body" } : {})
    });

    expect(classifyModelFailure(candidate)).toEqual(modelFailure(code));
  });

  it("leaves other HTTP 4xx, network TypeError, and unknown rejections unclassified", () => {
    expect(classifyModelFailure({ status: 400, body: "private-body" })).toBeUndefined();
    expect(classifyModelFailure(new TypeError("private-network-message"))).toBeUndefined();
    expect(classifyModelFailure("private-unknown-rejection")).toBeUndefined();
  });

  it.each([
    [429, "upstream_rate_limited"],
    [500, "upstream_unavailable"],
    [503, "upstream_unavailable"]
  ] as const)("classifies upstream HTTP %i without reading its body", async (status, code) => {
    const privateBody = "private-upstream-response-body";
    const response = new Response(privateBody, { status });
    const json = vi.spyOn(response, "json");
    const text = vi.spyOn(response, "text");
    const client = new OpenAIResponsesClient({
      apiKey: "offline-test-key",
      fetcher: vi.fn().mockResolvedValue(response)
    });

    const rejection = await client.generate(structuredRequest).catch((error: unknown) => error);

    expect(rejection).toEqual(modelFailure(code));
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(JSON.stringify(rejection)).not.toContain(privateBody);
  });

  it.each([
    [new Response("not-json", { status: 200 }), "invalid_model_json"],
    [responsePayload([]), "invalid_model_schema"],
    [responsePayload([{ type: "output_text", text: "not-json" }]), "invalid_model_json"],
    [responsePayload([{ type: "output_text", text: "é".repeat(32_769) }]), "invalid_model_schema"]
  ] as const)("classifies invalid model content as %s", async (response, code) => {
    const client = new OpenAIResponsesClient({
      apiKey: "offline-test-key",
      fetcher: vi.fn().mockResolvedValue(response)
    });

    await expect(client.generate(structuredRequest)).rejects.toEqual(modelFailure(code));
  });

  it("classifies an abort while reading the response as a timeout", async () => {
    const response = responsePayload([{ type: "output_text", text: '{"set":{}}' }]);
    vi.spyOn(response, "json").mockRejectedValue(
      Object.assign(new Error("private-stream-abort"), { name: "AbortError" })
    );
    const client = new OpenAIResponsesClient({
      apiKey: "offline-test-key",
      fetcher: vi.fn().mockResolvedValue(response)
    });

    await expect(client.generate(structuredRequest)).rejects.toEqual(modelFailure("model_timeout"));
  });

  it("maps an invalid raw patch to invalid_model_schema without parser details", async () => {
    const modelExtractor = new OpenAIRawFactExtractor({
      generate: vi.fn().mockResolvedValue({ set: { "origin.region": "EU_EEA_CH" } })
    });

    const rejection = await modelExtractor
      .extract({ message: "A bounded message.", prior: {}, unresolvedFields: [] } as never)
      .catch((error: unknown) => error);

    expect(rejection).toEqual(modelFailure("invalid_model_schema"));
    expect((rejection as Error).message).not.toContain("origin.region");
  });
});

describe("model fallback ownership", () => {
  it.each([
    "model_timeout",
    "upstream_rate_limited",
    "upstream_unavailable",
    "invalid_model_json",
    "invalid_model_schema"
  ] as const)("runs Local once after eligible %s and records one fallback", async (code) => {
    const order: string[] = [];
    const localExtract = vi.fn(async () => {
      order.push("local");
      return { set: { provider: "United" } };
    });
    const openaiExtract = vi.fn(async () => {
      order.push("openai");
      throw modelFailure(code);
    });
    const record = vi.fn();

    const response = await processClaimTurn(
      workflowRequest,
      dependencies({ localExtract, openaiExtract, record })
    );

    expect(order).toEqual(["openai", "local"]);
    expect(openaiExtract).toHaveBeenCalledOnce();
    expect(localExtract).toHaveBeenCalledOnce();
    expect(response.result.extraction).toEqual({
      performed: true,
      requestedMode: "gpt",
      provider: "local",
      model: null,
      fallbackReason: code
    });
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "fallback",
        requestedMode: "gpt",
        provider: "local",
        model: null,
        fallbackReason: code
      })
    );
  });

  it("never invokes Local for refusal and records one refusal terminal event", async () => {
    const refusal = modelFailure("model_refusal");
    const localExtract = vi.fn().mockResolvedValue({ set: {} });
    const openaiExtract = vi.fn().mockRejectedValue(refusal);
    const record = vi.fn();

    await expect(
      processClaimTurn(workflowRequest, dependencies({ localExtract, openaiExtract, record }))
    ).rejects.toBe(refusal);

    expect(openaiExtract).toHaveBeenCalledOnce();
    expect(localExtract).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "refusal",
        requestedMode: "gpt",
        provider: "openai"
      })
    );
  });

  it("does not let the legacy intake adapter bypass refusal with a second Local run", async () => {
    const refusal = modelFailure("model_refusal");
    const localExtract = vi.fn().mockResolvedValue({ set: {} });
    const openaiExtract = vi.fn().mockRejectedValue(refusal);

    await expect(
      processIntake("My flight was cancelled.", undefined, {
        localExtractor: extractor("local", localExtract),
        openaiExtractor: extractor("openai", openaiExtract)
      })
    ).rejects.toBe(refusal);

    expect(openaiExtract).toHaveBeenCalledOnce();
    expect(localExtract).not.toHaveBeenCalled();
  });

  it("does not automatically fall back for an unknown provider rejection", async () => {
    const unknown = new TypeError("private-network-failure");
    const localExtract = vi.fn().mockResolvedValue({ set: {} });
    const openaiExtract = vi.fn().mockRejectedValue(unknown);
    const record = vi.fn();

    await expect(
      processClaimTurn(workflowRequest, dependencies({ localExtract, openaiExtract, record }))
    ).rejects.toBe(unknown);

    expect(openaiExtract).toHaveBeenCalledOnce();
    expect(localExtract).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ category: "upstream_failure", provider: "openai" })
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain(unknown.message);
  });

  it("rethrows the original eligible failure if its single Local fallback fails", async () => {
    const timeout = modelFailure("model_timeout");
    const privateLocalError = new Error("private-local-fallback-error");
    const localExtract = vi.fn().mockRejectedValue(privateLocalError);
    const openaiExtract = vi.fn().mockRejectedValue(timeout);
    const record = vi.fn();

    await expect(
      processClaimTurn(workflowRequest, dependencies({ localExtract, openaiExtract, record }))
    ).rejects.toBe(timeout);

    expect(openaiExtract).toHaveBeenCalledOnce();
    expect(localExtract).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ category: "upstream_failure", provider: "openai" })
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain(privateLocalError.message);
  });

  it("records one rate-limited terminal event when a 429 fallback cannot succeed", async () => {
    const rateLimited = modelFailure("upstream_rate_limited");
    const localExtract = vi.fn().mockRejectedValue(new Error("private-local-error"));
    const openaiExtract = vi.fn().mockRejectedValue(rateLimited);
    const record = vi.fn();

    await expect(
      processClaimTurn(workflowRequest, dependencies({ localExtract, openaiExtract, record }))
    ).rejects.toBe(rateLimited);

    expect(localExtract).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ category: "rate_limited", provider: "openai" })
    );
  });

  it("runs OpenAI before its Local companion on success and merges both patches", async () => {
    const order: string[] = [];
    const openaiExtract = vi.fn(async () => {
      order.push("openai");
      return { set: { provider: "United" } };
    });
    const localExtract = vi.fn(async () => {
      order.push("local");
      return { set: { incidentType: "airline_cancellation" as const } };
    });

    const response = await processClaimTurn(
      workflowRequest,
      dependencies({ localExtract, openaiExtract })
    );

    expect(order).toEqual(["openai", "local"]);
    expect(response.result.extraction).toMatchObject({
      requestedMode: "gpt",
      provider: "openai",
      model: "gpt-5.6-luna"
    });
    expect(response.claimState.facts.provider).toBe("United");
    expect(response.claimState.facts.incidentType).toBe("airline_cancellation");
  });
});
