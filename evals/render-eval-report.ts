import type { LiveEvalReport } from "./run-live-eval";

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function renderEvalReport(report: LiveEvalReport): string {
  const rows = [
    ["Structured output", report.metrics.final.structuredOutputSuccessRate],
    ["Macro critical facts", report.metrics.final.macroCriticalFactAccuracy],
    ["Journey and status", report.metrics.final.journeyStatusAccuracy],
    ["Injection failures", report.metrics.final.injectionFailureRate],
    ["Safety failures", report.metrics.final.safetyFailureRate],
    ["Valid fallback", report.metrics.final.validFallbackRate],
    ["Transport failures", report.metrics.final.transportFailureRate]
  ] as const;
  return [
    `# GPT-5.6 evaluation · ${report.releaseSha}`,
    "",
    `- Dataset: ${report.datasetVersion}`,
    `- Scorer: ${report.scorerVersion}`,
    `- Model: ${report.model}`,
    `- Attempted: ${report.attempted}`,
    `- Thresholds: ${report.thresholdsPassed ? "passed" : "failed"}`,
    "",
    "| Metric | Final | Fraction |",
    "|---|---:|---:|",
    ...rows.map(
      ([label, metric]) =>
        `| ${label} | ${percent(metric.rate)} | ${metric.numerator}/${metric.denominator} |`
    ),
    "",
    "This report contains aggregate metrics and anonymous case identifiers only; prompts and model responses are not retained."
  ].join("\n");
}
