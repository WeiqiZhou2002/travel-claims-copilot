import { describe, expect, it, vi } from "vitest";

import { createAnalyzeRouteHandler } from "../../lib/api/analyze-route-handler";
import { ApiFault } from "../../lib/api/api-error";
import { createIntakeRouteHandler } from "../../lib/api/intake-route-handler";
import {
  toApiErrorResponse,
  toCaughtApiErrorResponse,
  withRequestId,
  type ApiErrorCode,
  type ApiErrorEnvelope
} from "../../lib/api/api-response";
import { INPUT_LIMITS } from "../../lib/api/input-limits";
import { isClaimStateReplayable } from "../../lib/api/request-body";
import { processClaimTurn } from "../../lib/claim-workflow";
import type {
  ClaimState,
  RawFactPatch,
  RawFactPath,
  RawFactValue
} from "../../lib/domain/claim-contract";
import { ModelFailure } from "../../lib/model/model-error";
import type { SafeTelemetryEvent } from "../../lib/privacy/safe-telemetry";
import { knowledgeSnapshotFixture } from "../fixtures/knowledge";
import { claimState } from "../fixtures/raw-claims";

const fixedMessages: Record<ApiErrorCode, string> = {
  invalid_json: "Invalid JSON request.",
  gpt_access_denied: "GPT access is denied.",
  request_too_large: "Request body is too large.",
  unsupported_media_type: "Request content type must be application/json.",
  unprocessable_request: "Request could not be processed.",
  rate_limited: "Too many requests. Please try again later.",
  concurrency_limited: "Too many requests are in progress. Please try again later.",
  budget_restricted: "GPT analysis is temporarily restricted.",
  model_refusal: "The model could not process this request.",
  model_timeout: "The analysis service timed out.",
  upstream_rate_limited: "The analysis service is temporarily unavailable.",
  upstream_unavailable: "The analysis service is temporarily unavailable.",
  invalid_model_json: "The analysis service returned an invalid response.",
  invalid_model_schema: "The analysis service returned an invalid response.",
  upstream_failure: "The analysis service is temporarily unavailable."
};

function expectExactEnvelope(
  body: unknown,
  expected: { code: ApiErrorCode; requestId?: string; retryable: boolean }
): asserts body is ApiErrorEnvelope {
  expect(body).toEqual({
    error: {
      code: expected.code,
      message: fixedMessages[expected.code],
      requestId: expected.requestId ?? "req-fixed-001",
      retryable: expected.retryable
    }
  });
  expect(Object.keys(body as Record<string, unknown>)).toEqual(["error"]);
  expect(Object.keys((body as ApiErrorEnvelope).error)).toEqual([
    "code",
    "message",
    "requestId",
    "retryable"
  ]);
}

const oversizedConflictStringPaths = [
  "provider",
  "brandOrProperty",
  "operatingCarrier",
  "origin.city",
  "origin.airport",
  "origin.country",
  "destination.city",
  "destination.airport",
  "destination.country",
  "statedReason",
  "scheduledFinalArrival",
  "actualFinalArrival",
  "loyaltyStatus"
] as const satisfies readonly RawFactPath[];

const growthBooleanPaths = [
  "userInitiatedChange",
  "isOvernight",
  "assistance.refundOffered",
  "assistance.refundAccepted",
  "assistance.creditOffered",
  "assistance.creditAccepted",
  "assistance.reroutingOffered",
  "assistance.reroutingAccepted",
  "assistance.replacementTravelOffered",
  "assistance.replacementTravelAccepted",
  "assistance.lodgingOffered",
  "assistance.lodgingAccepted",
  "assistance.mealsOffered",
  "assistance.mealsAccepted",
  "assistance.groundTransportOffered",
  "assistance.groundTransportAccepted",
  "oversalesConfirmed",
  "confirmedReservation",
  "checkedInOnTime",
  "atGateOnTime",
  "documentsCompliant",
  "confirmedHotelReservation",
  "qualifyingHotelReservation",
  "membershipAttached",
  "wasWalked",
  "replacementLodgingProvided"
] as const satisfies readonly RawFactPath[];

function boundedText(marker: string, maximum: number): string {
  return `${marker}-${"x".repeat(maximum)}`.slice(0, maximum);
}

function boundedItems(marker: string): string[] {
  return Array.from({ length: 20 }, (_value, index) => boundedText(`${marker}-${index}`, 256));
}

function conflict(field: RawFactPath, deterministicValue: RawFactValue, openaiValue: RawFactValue) {
  return {
    field,
    candidates: [
      { value: deterministicValue, source: "deterministic_extraction" as const },
      { value: openaiValue, source: "openai_extraction" as const }
    ]
  };
}

function oversizedSuccessPatches(): {
  local: RawFactPatch;
  openai: RawFactPatch;
} {
  const localStrings = Object.fromEntries(
    oversizedConflictStringPaths.map((path) => [path, boundedText(`local-${path}`, 256)])
  );
  const openaiStrings = Object.fromEntries(
    oversizedConflictStringPaths.map((path) => [path, boundedText(`openai-${path}`, 256)])
  );
  const localBooleans = Object.fromEntries(growthBooleanPaths.map((path) => [path, true]));
  const openaiBooleans = Object.fromEntries(growthBooleanPaths.map((path) => [path, false]));
  return {
    local: {
      set: {
        ...localStrings,
        ...localBooleans,
        incidentType: "airline_cancellation",
        providerType: "airline",
        reasonCategory: "crew",
        finalArrivalDelayMinutes: 1,
        cancellationNoticeHours: 1,
        deniedBoardingKind: "voluntary",
        replacementArrivalDelayMinutes: 1,
        bookingChannel: "direct",
        expenses: boundedItems("local-expense"),
        evidence: boundedItems("local-evidence"),
        userGoal: boundedText("local-goal", 500)
      }
    },
    openai: {
      set: {
        ...openaiStrings,
        ...openaiBooleans,
        incidentType: "airline_delay",
        providerType: "hotel",
        reasonCategory: "weather",
        finalArrivalDelayMinutes: 2,
        cancellationNoticeHours: 2,
        deniedBoardingKind: "involuntary",
        replacementArrivalDelayMinutes: 2,
        bookingChannel: "ota",
        expenses: boundedItems("openai-expense"),
        evidence: boundedItems("openai-evidence"),
        userGoal: boundedText("openai-goal", 500)
      }
    }
  };
}

function nearLimitReplayablePrior(): ClaimState {
  const conflicts = [
    conflict("expenses", boundedItems("prior-a-expense"), boundedItems("prior-b-expense")),
    conflict("evidence", boundedItems("prior-a-evidence"), boundedItems("prior-b-evidence")),
    ...oversizedConflictStringPaths.map((path) =>
      conflict(path, boundedText(`prior-a-${path}`, 256), boundedText(`prior-b-${path}`, 256))
    ),
    conflict("userGoal", boundedText("prior-a-goal", 500), boundedText("prior-b-goal", 500))
  ];
  return claimState({}, 0, {
    conflicts,
    unresolvedFields: conflicts.map(({ field }) => field)
  });
}

function fallbackGrowthPatch(): RawFactPatch {
  return {
    set: {
      ...Object.fromEntries(growthBooleanPaths.map((path) => [path, true])),
      incidentType: "airline_cancellation",
      providerType: "airline",
      reasonCategory: "crew",
      finalArrivalDelayMinutes: 1,
      cancellationNoticeHours: 1,
      deniedBoardingKind: "voluntary",
      replacementArrivalDelayMinutes: 1,
      bookingChannel: "direct"
    }
  };
}

export function compileTimeRouteTelemetryFixtures() {
  const telemetry = {
    sink: { record: (event: SafeTelemetryEvent) => Boolean(event) },
    nowMs: () => 0
  };
  createAnalyzeRouteHandler({ telemetry });
  createIntakeRouteHandler({ telemetry });
  createAnalyzeRouteHandler({
    telemetry: {
      ...telemetry,
      // @ts-expect-error Route telemetry receives its server request ID from the handler.
      requestId: "caller-supplied-request-id"
    }
  });
  createIntakeRouteHandler({
    telemetry: {
      ...telemetry,
      // @ts-expect-error Route telemetry receives its server request ID from the handler.
      requestId: "caller-supplied-request-id"
    }
  });
}

describe("unified API error serializer", () => {
  it.each([
    ["invalid_json", 400, false],
    ["gpt_access_denied", 401, false],
    ["request_too_large", 413, false],
    ["unsupported_media_type", 415, false],
    ["unprocessable_request", 422, false],
    ["model_refusal", 422, false],
    ["rate_limited", 429, true],
    ["concurrency_limited", 429, true],
    ["budget_restricted", 429, false],
    ["upstream_rate_limited", 502, true],
    ["upstream_unavailable", 502, true],
    ["invalid_model_json", 502, true],
    ["invalid_model_schema", 502, true],
    ["upstream_failure", 502, true],
    ["model_timeout", 504, true]
  ] as const)("maps %s to a fixed %i response", async (code, status, retryable) => {
    const response = toApiErrorResponse(code, "req-fixed-001");
    const body = await response.json();

    expect(response.status).toBe(status);
    expectExactEnvelope(body, { code, retryable });
  });

  it("maps known fault objects and unknown exceptions without leaking private fields", async () => {
    const privateMarker = "private-upstream-body-marker";
    const unknown = new Error(privateMarker, { cause: { body: privateMarker } });
    Object.assign(unknown, {
      details: privateMarker,
      content: privateMarker,
      response: { body: privateMarker }
    });

    const knownResponse = toCaughtApiErrorResponse(
      new ApiFault("unsupported_media_type", 415),
      "req-known"
    );
    const unknownResponse = toCaughtApiErrorResponse(unknown, "req-unknown");
    const knownBody = await knownResponse.json();
    const unknownBody = await unknownResponse.json();

    expect(knownResponse.status).toBe(415);
    expectExactEnvelope(knownBody, {
      code: "unsupported_media_type",
      requestId: "req-known",
      retryable: false
    });
    expect(unknownResponse.status).toBe(502);
    expectExactEnvelope(unknownBody, {
      code: "upstream_failure",
      requestId: "req-unknown",
      retryable: true
    });
    expect(JSON.stringify(unknownBody)).not.toContain(privateMarker);
    expect(unknownBody).not.toHaveProperty("stack");
  });

  it("generates one request ID through the injected factory", () => {
    const factory = vi.fn(() => "req-injected-001");

    const requestId = withRequestId(factory);

    expect(requestId).toBe("req-injected-001");
    expect(factory).toHaveBeenCalledOnce();
  });
});

describe("route error contract", () => {
  it.each([
    ["model_refusal", "analyze", createAnalyzeRouteHandler],
    ["model_timeout", "analyze", createAnalyzeRouteHandler],
    ["model_refusal", "intake", createIntakeRouteHandler],
    ["model_timeout", "intake", createIntakeRouteHandler]
  ] as const)(
    "treats an untyped rejected %s string as an unknown upstream failure in %s",
    async (rejectedCode, route, createHandler) => {
      const requestId = `req-untyped-${route}-001`;
      const handler = createHandler({
        requestIdFactory: () => requestId,
        processRequest: vi.fn().mockRejectedValue(rejectedCode)
      } as never);
      const response = await handler(
        new Request(`http://localhost/api/${route}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "A bounded claim message.",
            prior: claimState(),
            baseRevision: 0
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expectExactEnvelope(body, {
        code: "upstream_failure",
        requestId,
        retryable: true
      });
    }
  );

  it.each(["model_refusal", "model_timeout"] as const)(
    "treats an untyped rejected %s string from legacy intake as an unknown upstream failure",
    async (rejectedCode) => {
      const handler = createIntakeRouteHandler({
        requestIdFactory: () => "req-untyped-legacy-001",
        localExtractor: {
          provider: "local",
          model: null,
          extract: vi.fn().mockRejectedValue(rejectedCode)
        }
      });
      const response = await handler(
        new Request("http://localhost/api/intake", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "A bounded legacy claim message.", facts: null })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expectExactEnvelope(body, {
        code: "upstream_failure",
        requestId: "req-untyped-legacy-001",
        retryable: true
      });
    }
  );

  it.each([
    ["analyze", createAnalyzeRouteHandler],
    ["intake", createIntakeRouteHandler]
  ] as const)(
    "generates one server request ID for %s and ignores a client request-id header",
    async (route, createHandler) => {
      const requestIdFactory = vi.fn(() => "req-route-001");
      const handler = createHandler({ requestIdFactory } as never);
      const response = await handler(
        new Request(`http://localhost/api/${route}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "attacker-controlled-request-id"
          },
          body: "{not-json"
        })
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(requestIdFactory).toHaveBeenCalledOnce();
      expectExactEnvelope(body, {
        code: "invalid_json",
        requestId: "req-route-001",
        retryable: false
      });
      expect(JSON.stringify(body)).not.toContain("attacker-controlled-request-id");
    }
  );

  it.each([
    ["analyze", createAnalyzeRouteHandler],
    ["intake", createIntakeRouteHandler]
  ] as const)(
    "injects the same server request ID into one terminal %s telemetry event",
    async (route, createHandler) => {
      const record = vi.fn<(event: SafeTelemetryEvent) => void>();
      const nowMs = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);
      const handler = createHandler({
        requestIdFactory: () => "req-route-telemetry-001",
        telemetry: { sink: { record }, nowMs },
        localExtractor: {
          provider: "local",
          model: null,
          extract: vi.fn().mockResolvedValue({ set: {} })
        },
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      } as never);
      const response = await handler(
        new Request(`http://localhost/api/${route}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "attacker-controlled-request-id"
          },
          body: JSON.stringify({
            message: "A bounded claim message.",
            prior: claimState(),
            baseRevision: 0,
            requestedMode: "local"
          })
        })
      );

      expect(response.status).toBe(200);
      expect(record).toHaveBeenCalledOnce();
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-route-telemetry-001",
          category: "success",
          requestedMode: "local",
          provider: "local"
        })
      );
      expect(JSON.stringify(record.mock.calls)).not.toContain("attacker-controlled-request-id");
    }
  );

  it.each([
    ["success", "analyze", createAnalyzeRouteHandler],
    ["success", "intake", createIntakeRouteHandler],
    ["fallback", "analyze", createAnalyzeRouteHandler],
    ["fallback", "intake", createIntakeRouteHandler]
  ] as const)(
    "records no terminal %s telemetry when the real %s route workflow produces an unreplayable state",
    async (terminalCategory, route, createHandler) => {
      const record = vi.fn<(event: SafeTelemetryEvent) => void>();
      const successPatches = oversizedSuccessPatches();
      const localPatch =
        terminalCategory === "success" ? successPatches.local : fallbackGrowthPatch();
      const prior = terminalCategory === "success" ? claimState() : nearLimitReplayablePrior();
      const workflowInput = {
        message: "A bounded claim message.",
        prior,
        baseRevision: 0,
        requestedMode: "gpt" as const,
        privacyAcknowledged: true
      };
      const directResponse = await processClaimTurn(workflowInput, {
        localExtractor: {
          provider: "local",
          model: null,
          extract: async () => localPatch
        },
        ...(terminalCategory === "success"
          ? {
              openaiExtractor: {
                provider: "openai" as const,
                model: "gpt-5.6-luna" as const,
                extract: async () => successPatches.openai
              }
            }
          : {}),
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20"
      });
      const serializedBody = JSON.stringify(workflowInput);

      expect(new TextEncoder().encode(serializedBody).byteLength).toBeLessThanOrEqual(
        INPUT_LIMITS.bodyBytes
      );
      expect(isClaimStateReplayable(directResponse.claimState)).toBe(false);

      const localExtract = vi.fn().mockResolvedValue(localPatch);
      const openaiExtract = vi.fn().mockResolvedValue(successPatches.openai);
      const handler = createHandler({
        requestIdFactory: () => `req-unreplayable-${route}-${terminalCategory}`,
        telemetry: { sink: { record }, nowMs: vi.fn(() => 100) },
        localExtractor: {
          provider: "local",
          model: null,
          extract: localExtract
        },
        ...(terminalCategory === "success"
          ? {
              openaiExtractor: {
                provider: "openai",
                model: "gpt-5.6-luna",
                extract: openaiExtract
              }
            }
          : {}),
        knowledgeRepository: { load: async () => knowledgeSnapshotFixture() },
        now: () => "2026-07-20",
        demoAccessCode: "test-access"
      } as never);
      const response = await handler(
        new Request(`http://localhost/api/${route}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-demo-access-code": "test-access" },
          body: serializedBody
        })
      );
      const body = await response.json();

      expect(response.status).toBe(502);
      expectExactEnvelope(body, {
        code: "upstream_failure",
        requestId: `req-unreplayable-${route}-${terminalCategory}`,
        retryable: true
      });
      expect(localExtract).toHaveBeenCalledOnce();
      if (terminalCategory === "success") {
        expect(openaiExtract).toHaveBeenCalledOnce();
      } else {
        expect(openaiExtract).not.toHaveBeenCalled();
      }
      expect(record).not.toHaveBeenCalled();
    }
  );

  it("preserves the outer intake request ID through the legacy adapter telemetry", async () => {
    const record = vi.fn<(event: SafeTelemetryEvent) => void>();
    const nowMs = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);
    const handler = createIntakeRouteHandler({
      requestIdFactory: () => "req-legacy-telemetry-001",
      telemetry: { sink: { record }, nowMs },
      localExtractor: {
        provider: "local",
        model: null,
        extract: vi.fn().mockResolvedValue({ set: {} })
      }
    });
    const response = await handler(
      new Request("http://localhost/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "A bounded legacy claim message.", facts: null })
      })
    );

    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-legacy-telemetry-001",
        category: "success",
        requestedMode: "local",
        provider: "local"
      })
    );
  });

  it.each([
    [new ModelFailure("model_refusal", false, false), 422, "model_refusal", false],
    [new ModelFailure("model_timeout", true, true), 504, "model_timeout", true],
    [new ModelFailure("invalid_model_schema", true, true), 502, "invalid_model_schema", true]
  ] as const)(
    "maps a terminal model failure without exposing its cause",
    async (failure, status, code, retryable) => {
      const privateMarker = "private-model-cause-marker";
      Object.assign(failure, { cause: new Error(privateMarker), content: privateMarker });
      const handler = createAnalyzeRouteHandler({
        requestIdFactory: () => "req-model-001",
        processRequest: vi.fn().mockRejectedValue(failure)
      });
      const response = await handler(
        new Request("http://localhost/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "A bounded claim message.",
            prior: claimState(),
            baseRevision: 0
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(status);
      expectExactEnvelope(body, {
        code,
        requestId: "req-model-001",
        retryable
      });
      expect(JSON.stringify(body)).not.toContain(privateMarker);
    }
  );
});
