import { describe, expect, it, vi } from "vitest";

import type { EvalCase, EvalObservation } from "../../evals/eval-contract";
import { executeWithFixedRetry, scoreEvalRun, validateReleaseMetrics } from "../../evals/scorer";

function evalCase(
  id: string,
  tags: EvalCase["tags"],
  overrides: Partial<EvalCase["expected"]> = {}
): EvalCase {
  return {
    datasetVersion: "four-scenario-v1",
    id,
    synthetic: true,
    language: "en",
    tags,
    gptEligible: !tags.includes("high_risk") && !tags.includes("fallback_required"),
    input: "Anonymous synthetic travel disruption.",
    priorRawFacts: {},
    expected: {
      scenarioIds: ["us_airline_disruption"],
      status: "ready",
      acceptedCriticalValues: { incidentType: ["airline_cancellation"] },
      missingFields: [],
      safety: tags.includes("high_risk") ? "block" : "allow",
      fallback: tags.includes("fallback_required") ? "required" : "not_required",
      ...overrides
    }
  };
}

function observation(overrides: Partial<EvalObservation> = {}): EvalObservation {
  return {
    outcome: "structured",
    scenarioIds: ["us_airline_disruption"],
    status: "ready",
    criticalValues: { incidentType: "airline_cancellation" },
    missingFields: [],
    injectionResisted: null,
    safetyPassed: null,
    fallbackCategory: null,
    fallbackValid: false,
    transportRetryable: false,
    latencyMs: 10,
    tokenUsage: { inputTokens: 20, outputTokens: 10 },
    ...overrides
  };
}

describe("claim-scorer-v1", () => {
  it("uses exact scenario sets, macro per-case facts, and zero-scores refusal", () => {
    const cases = [
      evalCase("injection", ["injection"]),
      evalCase("safety", ["high_risk"], {
        scenarioIds: [],
        status: "unsupported_high_risk",
        acceptedCriticalValues: {}
      }),
      evalCase("fallback", ["ambiguity", "fallback_required"]),
      evalCase("refusal", ["journey:us_airline_disruption"])
    ];
    const observations: Record<string, EvalObservation> = {
      injection: observation({
        scenarioIds: ["us_airline_disruption"],
        injectionResisted: false
      }),
      safety: observation({
        outcome: "preflight",
        scenarioIds: [],
        status: "unsupported_high_risk",
        criticalValues: {},
        safetyPassed: true,
        tokenUsage: null
      }),
      fallback: observation({
        outcome: "fallback",
        fallbackCategory: "model_timeout",
        fallbackValid: true,
        tokenUsage: null
      }),
      refusal: observation({
        outcome: "refusal",
        scenarioIds: [],
        status: null,
        criticalValues: {},
        tokenUsage: null
      })
    };
    const results = cases.map((item) => ({
      caseId: item.id,
      firstAttempt: observations[item.id],
      final: observations[item.id]
    }));
    const metrics = scoreEvalRun(cases, results);

    expect(metrics.final.attempted).toBe(4);
    expect(metrics.final.structuredOutputSuccessRate).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5
    });
    expect(metrics.final.macroCriticalFactAccuracy).toEqual({
      numerator: 2,
      denominator: 3,
      rate: 2 / 3
    });
    expect(metrics.final.journeyStatusAccuracy).toEqual({
      numerator: 3,
      denominator: 4,
      rate: 0.75
    });
    expect(metrics.final.injectionFailureRate).toEqual({
      numerator: 1,
      denominator: 1,
      rate: 1
    });
    expect(metrics.final.safetyFailureRate).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(metrics.final.validFallbackRate).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(metrics.final.transportFailureRate).toEqual({
      numerator: 0,
      denominator: 4,
      rate: 0
    });
    expect(Object.keys(metrics.final)).toEqual(Object.keys(metrics.firstAttempt));
  });

  it("treats scenario order as irrelevant but rejects extras and missing status", () => {
    const item = evalCase("dual", ["journey:eu_uk_air_disruption"], {
      scenarioIds: ["eu_uk_air_disruption", "us_airline_disruption"]
    });
    const correct = observation({
      scenarioIds: ["us_airline_disruption", "eu_uk_air_disruption"]
    });
    const extra = observation({
      scenarioIds: ["us_airline_disruption", "eu_uk_air_disruption", "us_denied_boarding"]
    });
    const noStatus = observation({
      scenarioIds: ["us_airline_disruption", "eu_uk_air_disruption"],
      status: null
    });

    expect(
      scoreEvalRun([item], [{ caseId: item.id, firstAttempt: correct, final: correct }]).final
        .journeyStatusAccuracy.numerator
    ).toBe(1);
    expect(
      scoreEvalRun([item], [{ caseId: item.id, firstAttempt: extra, final: extra }]).final
        .journeyStatusAccuracy.numerator
    ).toBe(0);
    expect(
      scoreEvalRun([item], [{ caseId: item.id, firstAttempt: noStatus, final: noStatus }]).final
        .journeyStatusAccuracy.numerator
    ).toBe(0);
  });

  it("allows exactly one retry for retryable transport and preserves first attempt", async () => {
    const transport = observation({
      outcome: "transport_failure",
      scenarioIds: [],
      status: null,
      criticalValues: {},
      transportRetryable: true,
      tokenUsage: null
    });
    const final = observation();
    const runAttempt = vi.fn().mockResolvedValueOnce(transport).mockResolvedValueOnce(final);

    await expect(executeWithFixedRetry(runAttempt)).resolves.toEqual({
      firstAttempt: transport,
      final
    });
    expect(runAttempt).toHaveBeenCalledTimes(2);
    expect(runAttempt).toHaveBeenNthCalledWith(1, 1);
    expect(runAttempt).toHaveBeenNthCalledWith(2, 2);

    await Promise.all(
      (["refusal", "invalid_output", "fallback"] as const).map(async (outcome) => {
        const first = observation({ outcome, transportRetryable: true });
        const noRetry = vi.fn().mockResolvedValue(first);
        await expect(executeWithFixedRetry(noRetry)).resolves.toEqual({
          firstAttempt: first,
          final: first
        });
        expect(noRetry).toHaveBeenCalledTimes(1);
      })
    );
  });

  it("gates final metrics only and rejects zero-denominator release metrics", () => {
    const item = evalCase("passing", ["injection", "high_risk", "fallback_required"], {
      scenarioIds: [],
      status: "unsupported_high_risk",
      acceptedCriticalValues: {}
    });
    const preflight = observation({
      outcome: "preflight",
      scenarioIds: [],
      status: "unsupported_high_risk",
      criticalValues: {},
      injectionResisted: true,
      safetyPassed: true,
      fallbackCategory: "preflight_guard",
      fallbackValid: true,
      tokenUsage: null
    });
    const metrics = scoreEvalRun(
      [item],
      [{ caseId: item.id, firstAttempt: preflight, final: preflight }]
    );

    expect(() => validateReleaseMetrics(metrics)).toThrow("eval_metric_denominator_zero");
  });

  it("keeps first-attempt denominators and failures after a successful retry", () => {
    const cases = [
      evalCase("injection", ["injection"]),
      evalCase("safety", ["high_risk"], {
        scenarioIds: [],
        status: "unsupported_high_risk",
        acceptedCriticalValues: {}
      }),
      evalCase("fallback", ["ambiguity", "fallback_required"]),
      evalCase("journey", ["journey:us_airline_disruption"])
    ];
    const passing: Record<string, EvalObservation> = {
      injection: observation({ injectionResisted: true }),
      safety: observation({
        outcome: "preflight",
        scenarioIds: [],
        status: "unsupported_high_risk",
        criticalValues: {},
        safetyPassed: true,
        tokenUsage: null
      }),
      fallback: observation({
        outcome: "fallback",
        fallbackCategory: "openai_extractor_unavailable",
        fallbackValid: true,
        tokenUsage: null
      }),
      journey: observation()
    };
    const firstTransport = observation({
      outcome: "transport_failure",
      scenarioIds: [],
      status: null,
      criticalValues: {},
      injectionResisted: false,
      transportRetryable: true,
      tokenUsage: null
    });
    const results = cases.map((item) => ({
      caseId: item.id,
      firstAttempt: item.id === "injection" ? firstTransport : passing[item.id],
      final: passing[item.id]
    }));
    const metrics = scoreEvalRun(cases, results);

    expect(validateReleaseMetrics(metrics)).toBe(metrics);
    expect(metrics.firstAttempt.structuredOutputSuccessRate).toMatchObject({
      numerator: 1,
      denominator: 2
    });
    expect(metrics.final.structuredOutputSuccessRate).toMatchObject({
      numerator: 2,
      denominator: 2
    });
    expect(metrics.firstAttempt.injectionFailureRate).toEqual({
      numerator: 1,
      denominator: 1,
      rate: 1
    });
    expect(metrics.final.injectionFailureRate).toEqual({
      numerator: 0,
      denominator: 1,
      rate: 0
    });
    expect(metrics.firstAttempt.transportFailureRate.numerator).toBe(1);
    expect(metrics.final.transportFailureRate.numerator).toBe(0);
  });
});
