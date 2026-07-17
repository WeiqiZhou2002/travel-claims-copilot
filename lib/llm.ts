export type StructuredOutputRequest = {
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
};

export interface StructuredOutputClient {
  generate<T>(request: StructuredOutputRequest): Promise<T>;
}

type Fetcher = typeof fetch;

export type OpenAIResponsesClientOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractResponseText(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.output)) {
    return undefined;
  }

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return undefined;
}

export class OpenAIResponsesClient implements StructuredOutputClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: Fetcher;

  constructor(options: OpenAIResponsesClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.6-luna";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate<T>(request: StructuredOutputRequest): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          reasoning: { effort: "none" },
          store: false,
          instructions: request.instructions,
          input: request.input,
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: request.schema
            }
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OpenAI Responses API returned HTTP ${response.status}`);
      }

      const text = extractResponseText(await response.json());
      if (!text) {
        throw new Error("OpenAI Responses API returned no structured output text");
      }

      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createOpenAIClientFromEnv(): OpenAIResponsesClient | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return new OpenAIResponsesClient({
    apiKey,
    model: process.env.OPENAI_INTAKE_MODEL?.trim() || "gpt-5.6-luna",
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined
  });
}

