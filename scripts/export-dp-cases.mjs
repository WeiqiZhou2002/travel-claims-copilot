import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Preview export only. Evidence about a forum post is not evidence submitted
// by the passenger, and a complete DP is not automatically an approved Case.
export function exportCandidate(dp, sourcePath) {
  if (dp.schema_version !== "0.3")
    throw new Error("Expected DP schema 0.3 with separate provider/carrier.");
  if (
    dp.review?.workflow_status !== "ready_for_review" ||
    dp.review?.record_status !== "complete"
  ) {
    throw new Error(`${dp.dp_id}: candidate is not ready for review.`);
  }
  const event = dp.event;
  for (const key of ["provider", "carrier"]) {
    if (
      !(key in event) ||
      (event[key] !== null &&
        (typeof event[key] !== "string" || !event[key].trim()))
    ) {
      throw new Error(
        `${dp.dp_id}: ${key} must be a non-empty string or null.`,
      );
    }
  }
  if (!event.provider && !event.carrier)
    throw new Error(`${dp.dp_id}: airline roles are both unknown.`);
  if (!event.description || !event.occurred_at?.text || !event.route?.text)
    throw new Error("Required event details missing.");
  if (
    !["airline_delay", "airline_cancellation", "denied_boarding"].includes(
      event.issue_type,
    )
  )
    throw new Error("Unsupported incident.");
  if (!dp.airline_handling?.responses?.length)
    throw new Error("Airline response required.");
  const sourceIds = new Set(dp.sources.map((s) => s.source_id));
  const evidenceIds = new Set(dp.evidence.map((e) => e.evidence_id));
  if (dp.evidence.some((e) => !sourceIds.has(e.source_id)))
    throw new Error("Unresolved source reference.");
  function checkEvidence(node) {
    if (Array.isArray(node)) node.forEach(checkEvidence);
    else if (node && typeof node === "object") {
      if (
        "evidence_ids" in node &&
        (!Array.isArray(node.evidence_ids) ||
          !node.evidence_ids.length ||
          node.evidence_ids.some((id) => !evidenceIds.has(id)))
      )
        throw new Error("Unresolved or missing evidence reference.");
      Object.values(node).forEach(checkEvidence);
    }
  }
  if (
    !event.evidence_ids?.length ||
    dp.airline_handling.responses.some((r) => !r.evidence_ids?.length)
  )
    throw new Error("Event and responses need evidence.");
  checkEvidence(dp);
  const source = dp.sources.find(
    (s) => typeof s.url === "string" && s.url.startsWith("https://"),
  );
  if (!source) throw new Error("A traceable HTTPS source is required.");
  return {
    case_id: dp.dp_id,
    source_type: "community_dp",
    source_name: source.forum,
    source_url: source.url,
    provider_type: "airline",
    provider: event.provider,
    carrier: event.carrier,
    brand_or_airline: event.carrier ?? event.provider,
    issue_type: event.issue_type,
    location_country: "unknown",
    booking_channel: "unknown",
    loyalty_status: "unknown",
    reservation_type: "unknown",
    facts: [
      event.description,
      event.occurred_at.text,
      event.route.text,
      dp.cause?.description,
    ]
      .filter(Boolean)
      .join("；"),
    requested_compensation: [],
    actual_outcome: dp.airline_handling.responses
      .map(
        (r) =>
          `[${r.phase}] ${r.description}${r.measures?.length ? ` (${r.measures.map((m) => `${m.kind}: ${m.fulfillment}`).join("; ")})` : ""}`,
      )
      .join("；"),
    evidence_used: [],
    escalation_path: (dp.passenger_actions ?? []).map((a) => a.description),
    reusable_lesson: "仅供对照已报告的处理过程，不代表通用政策或赔付保证。",
    confidence: "low",
    notes: `最终处置状态：${dp.airline_handling.final_status}。来源与完整记录：${sourcePath}#${dp.dp_id}`,
    review_status: "needs_review",
    review_notes: [
      "自动生成的格式预览，未经入库审核。未报告的渠道、会员、票种和地域保持未知。",
      "requested_compensation 与 evidence_used 未自动推断；证据索引保留在原始 DP，不能当作旅客提交材料。",
      ...dp.review.missing_optional,
      ...dp.review.conflicts.map((c) => c.detail),
    ],
    role_notes: [
      "provider 为原出票/办理方；carrier 为受影响航段承运人。改签后的承运人不覆盖原 carrier。",
    ],
    provenance: {
      dp_id: dp.dp_id,
      source_path: sourcePath,
      schema_version: dp.schema_version,
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: node scripts/export-dp-cases.mjs candidates.json cases.preview.json",
    );
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = resolve(output);
  if (target === resolve(input) || target === resolve(root, "data/cases.json"))
    throw new Error(
      "Export must not overwrite the candidate or production library.",
    );
  const candidates = JSON.parse(await readFile(input, "utf8"));
  if (!Array.isArray(candidates)) throw new Error("Candidate array required.");
  const exported = candidates.map((dp) =>
    exportCandidate(dp, relative(root, resolve(input))),
  );
  if (new Set(exported.map((c) => c.case_id)).size !== exported.length)
    throw new Error("Duplicate DP IDs.");
  await writeFile(target, JSON.stringify(exported, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(`Exported ${exported.length} needs_review cases to ${target}`);
}
