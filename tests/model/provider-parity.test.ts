import { describe, expect, it, vi } from "vitest";

import {
  DeepSeekChatCompletionsClient,
  OpenAIResponsesClient,
  type StructuredOutputClient,
  type StructuredOutputRequest
} from "../../lib/llm";

const request: StructuredOutputRequest = {
  schemaName: "travel_claim_facts",
  schema: { type: "object", properties: {}, additionalProperties: false },
  instructions: "Return only supported travel claim facts.",
  input: '{"message":"A bounded fixture"}',
  maxOutputTokens: 1_200
};

function successResponse(provider: "openai" | "deepseek", text = "{}"): Response {
  return new Response(
    JSON.stringify(
      provider === "openai"
        ? { output: [{ content: [{ type: "output_text", text }] }] }
        : {
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }]
          }
    ),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function clientsWith(fetcher: typeof fetch): StructuredOutputClient[] {
  return [
    new OpenAIResponsesClient({ apiKey: "test-key", fetcher }),
    new DeepSeekChatCompletionsClient({ apiKey: "test-key", fetcher })
  ];
}

describe("guided-intake provider parity", () => {
  it("sends the same output ceiling through each provider-native field", async () => {
    const openAIFetcher = vi.fn().mockResolvedValue(successResponse("openai"));
    const deepSeekFetcher = vi.fn().mockResolvedValue(successResponse("deepseek"));

    await new OpenAIResponsesClient({ apiKey: "test-key", fetcher: openAIFetcher }).generate(
      request
    );
    await new DeepSeekChatCompletionsClient({
      apiKey: "test-key",
      fetcher: deepSeekFetcher
    }).generate(request);

    const openAIBody = JSON.parse(openAIFetcher.mock.calls[0][1].body as string);
    const deepSeekBody = JSON.parse(deepSeekFetcher.mock.calls[0][1].body as string);
    expect(openAIBody.max_output_tokens).toBe(1_200);
    expect(deepSeekBody.max_tokens).toBe(1_200);
    expect(openAIBody.text.format.schema).toEqual(request.schema);
    expect(deepSeekBody.messages[0].content).toContain(JSON.stringify(request.schema));
  });

  it("rejects an unexpected output ceiling before either provider is called", async () => {
    const fetcher = vi.fn();
    const invalidRequest = { ...request, maxOutputTokens: 1_201 };

    await Promise.all(
      clientsWith(fetcher).map((client) =>
        expect(client.generate(invalidRequest)).rejects.toThrow("invalid_model_output_token_limit")
      )
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])("uses the same safe failure code for HTTP %i", async (status) => {
    const expectedCode = status === 429 ? "upstream_rate_limited" : "upstream_unavailable";

    await Promise.all(
      clientsWith(vi.fn().mockResolvedValue(new Response(null, { status }))).map((client) =>
        expect(client.generate(request)).rejects.toMatchObject({ code: expectedCode })
      )
    );
  });

  it("uses the same invalid JSON failure for both response envelopes", async () => {
    const clients = [
      new OpenAIResponsesClient({
        apiKey: "test-key",
        fetcher: vi.fn().mockResolvedValue(successResponse("openai", "not-json"))
      }),
      new DeepSeekChatCompletionsClient({
        apiKey: "test-key",
        fetcher: vi.fn().mockResolvedValue(successResponse("deepseek", "not-json"))
      })
    ];

    await Promise.all(
      clients.map((client) =>
        expect(client.generate(request)).rejects.toMatchObject({ code: "invalid_model_json" })
      )
    );
  });

  it("applies the same UTF-8 response-size ceiling", async () => {
    const oversized = "é".repeat(32_769);
    const clients = [
      new OpenAIResponsesClient({
        apiKey: "test-key",
        fetcher: vi.fn().mockResolvedValue(successResponse("openai", oversized))
      }),
      new DeepSeekChatCompletionsClient({
        apiKey: "test-key",
        fetcher: vi.fn().mockResolvedValue(successResponse("deepseek", oversized))
      })
    ];

    await Promise.all(
      clients.map((client) =>
        expect(client.generate(request)).rejects.toMatchObject({
          code: "invalid_model_schema"
        })
      )
    );
  });
});
