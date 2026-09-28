import type { Case } from "../types";
import {
  ReviewError,
  type DP,
  type Principal,
  type ReviewCommand,
  type ReviewRecord,
  type ReviewRepository,
  type ReviewState,
} from "./types";
import { approvalIssues, parseDP } from "./validation";

export function projectCase(dp: DP): Case {
  const label: Record<string, string> = {
    initial: "初始",
    intermediate: "后续",
    final: "最终",
    unknown: "阶段未披露",
    offered: "提出方案",
    promised: "承诺",
    accepted: "已接受",
    received: "作者报告已收到",
    rejected: "拒绝",
    withdrawn: "撤回",
  };
  return {
    case_id: dp.dp_id,
    source_type: "community_dp",
    source_name: dp.sources[0]?.forum ?? "Community",
    source_url: dp.sources.find((s) => s.url)?.url ?? "",
    provider_type: "airline",
    provider: dp.event.provider,
    carrier: dp.event.carrier,
    brand_or_airline:
      dp.event.carrier ?? dp.event.provider ?? dp.event.airline_reported,
    issue_type: dp.event.issue_type,
    location_country: "unknown",
    booking_channel: "unknown",
    loyalty_status: "unknown",
    reservation_type: "unknown",
    facts: [
      dp.event.description,
      dp.event.occurred_at.text,
      dp.event.route.text,
      dp.cause?.description,
      dp.event.boarding_context
        ? `让座类型：${dp.event.boarding_context}`
        : null,
    ]
      .filter(Boolean)
      .join("；"),
    requested_compensation: [],
    actual_outcome: dp.airline_handling.responses
      .map(
        (r) =>
          `[${label[r.phase]}] ${r.description}${r.measures.length ? "（" + r.measures.map((m) => `${m.description}：${m.amount ?? "金额未披露"} ${m.currency_or_program ?? ""} ${m.unit ?? ""} / ${label[m.fulfillment] ?? "履行未知"}`).join("；") + "）" : ""}`,
      )
      .join("；"),
    evidence_used: [],
    escalation_path: (dp.passenger_actions ?? []).map((a) => a.description),
    reusable_lesson: "仅供对照已报告的处置，不代表官方政策或赔付保证。",
    confidence: "low",
    notes: `DP ${dp.dp_id}；最终阶段：${dp.airline_handling.final_status}。人工审核不代表独立事实核验。`,
    review_status: "needs_review",
    review_notes: [
      ...dp.review.missing_optional,
      ...dp.review.conflicts.map((c) => c.detail),
      ...(dp.review.notes ?? []),
    ],
    role_notes: [
      "provider 为原办理方，carrier 为原受影响航段承运方；未知值未互相回填。",
    ],
  };
}
export function importInto(
  state: ReviewState,
  batchId: string,
  inputs: unknown[],
  actor: Principal,
): number {
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(batchId) ||
    inputs.length > 100 ||
    !inputs.length
  )
    throw new ReviewError("批次 ID 或批次数量不合法", 400);
  const parsed = inputs.map(parseDP);
  if (new Set(parsed.map((d) => d.dp_id)).size !== parsed.length)
    throw new ReviewError("批次内 DP ID 重复", 409);
  let count = 0;
  for (const dp of parsed) {
    const existing = state.records.find((r) => r.id === dp.dp_id);
    if (existing) {
      if (
        existing.batchId === batchId &&
        JSON.stringify(existing.original) === JSON.stringify(dp)
      )
        continue;
      throw new ReviewError(
        `DP ID 已存在：${dp.dp_id}；更新须经版本审核接口`,
        409,
      );
    }
    const draft = structuredClone(dp);
    draft.review.review_status = "needs_review";
    state.records.push({
      id: dp.dp_id,
      batchId,
      version: 1,
      status: "pending",
      original: dp,
      current: draft,
      publication: null,
      history: [
        {
          version: 1,
          action: "import",
          actor: actor.id,
          at: new Date().toISOString(),
          note: "采集导入，尚未审核",
          sourceChecked: false,
          snapshot: structuredClone(draft),
        },
      ],
    });
    count++;
  }
  return count;
}
export async function importBatch(
  repo: ReviewRepository,
  batchId: string,
  inputs: unknown[],
  actor: Principal,
) {
  return repo.transact((state) => importInto(state, batchId, inputs, actor));
}
export async function reviewRecord(
  repo: ReviewRepository,
  id: string,
  command: ReviewCommand,
  actor: Principal,
): Promise<ReviewRecord> {
  if (actor.role !== "reviewer")
    throw new ReviewError("采集身份不能审核或发布", 403);
  if (
    !["save", "approve", "request_evidence", "exclude", "revoke"].includes(
      command.action,
    ) ||
    !Number.isInteger(command.expectedVersion) ||
    typeof command.note !== "string" ||
    command.note.length > 4000
  )
    throw new ReviewError("审核请求格式不正确", 400);
  return repo.transact((state) => {
    const record = state.records.find((r) => r.id === id);
    if (!record) throw new ReviewError("案例不存在", 404);
    if (record.version !== command.expectedVersion)
      throw new ReviewError(
        "案例已被更新，请重新加载后核对再提交；你的编辑未被覆盖。",
        409,
      );
    if (command.action !== "save" && !command.note.trim())
      throw new ReviewError("请填写审核说明");
    const dp = command.dp
      ? parseDP(command.dp)
      : structuredClone(record.current);
    if (dp.dp_id !== id) throw new ReviewError("不能修改稳定 DP ID", 400);
    // Sources and evidence remain versioned; a new edit always withdraws the old publication.
    if (command.action === "approve") {
      const issues = approvalIssues(dp);
      if (issues.length) throw new ReviewError(issues.join("；"));
      if (command.sourceChecked !== true)
        throw new ReviewError("通过前请确认已核对来源与处置阶段");
      const duplicate = state.records.find(
        (r) =>
          r.id !== id &&
          r.status === "approved" &&
          dp.reporter &&
          r.current.reporter === dp.reporter &&
          r.current.event.occurred_at.text === dp.event.occurred_at.text &&
          r.current.event.route.text === dp.event.route.text &&
          r.current.sources.some((s) =>
            dp.sources.some((t) => s.url === t.url),
          ),
      );
      if (duplicate)
        throw new ReviewError(
          `疑似重复已发布案例 ${duplicate.id}，请先核对`,
          409,
        );
      record.publication = { ...projectCase(dp), review_status: "approved" };
      record.status = "approved";
    } else {
      record.publication = null;
      record.status =
        command.action === "exclude"
          ? "excluded"
          : command.action === "request_evidence"
            ? "needs_evidence"
            : "pending";
    }
    dp.review.review_status =
      record.status === "approved"
        ? "approved"
        : record.status === "excluded"
          ? "excluded"
          : "needs_review";
    record.current = dp;
    record.version++;
    record.history.push({
      version: record.version,
      action: command.action,
      actor: actor.id,
      at: new Date().toISOString(),
      note: command.note.trim(),
      sourceChecked: command.action === "approve",
      snapshot: structuredClone(dp),
    });
    return structuredClone(record);
  });
}
