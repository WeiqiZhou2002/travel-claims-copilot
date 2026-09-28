import { ReviewError, type DP } from "./types";

const enums = {
  precision: ["day", "month", "year", "relative", "unknown"],
  issue: ["airline_delay", "airline_cancellation", "denied_boarding", "unknown"],
  fulfillment: ["offered", "promised", "accepted", "received", "rejected", "withdrawn", "unknown"],
  phase: ["initial", "intermediate", "final", "unknown"],
  kind: ["rebooking", "refund", "expense_reimbursement", "cash_compensation", "voucher", "miles", "points", "care", "other"]
};
export function safeSourceUrl(value: string | null): string | null {
  try { const u = new URL(value ?? ""); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
// Validate untrusted agent submissions and browser edits before touching storage.
// Completeness is separate: incomplete drafts must still be saveable.
export function parseDP(value: unknown): DP {
  const fail = (p: string): never => { throw new ReviewError(`DP 字段格式不正确：${p}`, 400); };
  const obj = (v: unknown, p: string): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail(p);
  const str = (v: unknown, p: string, nullable = false) => { if (!(nullable && v === null) && (typeof v !== "string" || v.length > 20000)) fail(p); };
  const arr = (v: unknown, p: string): unknown[] => Array.isArray(v) && v.length <= 300 ? v : fail(p);
  const strings = (v: unknown, p: string) => arr(v,p).forEach(x => str(x,p));
  const one = (v: unknown, values: string[], p: string) => { if (typeof v !== "string" || !values.includes(v)) fail(p); };
  const refs = (v: Record<string, unknown>, p: string) => strings(v.evidence_ids,p+".evidence_ids");
  const d = obj(value,"root");
  if (d.schema_version !== "0.3") fail("schema_version");
  if (typeof d.dp_id !== "string" || !/^[a-zA-Z0-9_-]{1,140}$/.test(d.dp_id)) fail("dp_id");
  for (const k of ["title", "reporter"]) if (d[k] !== undefined) str(d[k],k);
  const e=obj(d.event,"event"); refs(e,"event");
  for (const k of ["description","airline_reported"]) str(e[k],`event.${k}`);
  for (const k of ["provider","carrier"]) str(e[k],`event.${k}`,true);
  one(e.issue_type,enums.issue,"issue_type"); if(e.boarding_context!==undefined) str(e.boarding_context,"boarding_context");
  const time=obj(e.occurred_at,"occurred_at"); str(time.text,"time.text"); str(time.normalized,"time.normalized",true); one(time.precision,enums.precision,"time.precision");
  const route=obj(e.route,"route"); str(route.text,"route.text"); str(route.origin,"route.origin",true); str(route.destination,"route.destination",true);
  if(d.cause !== null) { const c=obj(d.cause,"cause"); str(c.description,"cause.description"); one(c.attributed_to,["airline","passenger","other","unknown"],"cause.attributed_to"); refs(c,"cause"); }
  if(d.passenger_actions !== null) arr(d.passenger_actions,"passenger_actions").forEach(v => { const a=obj(v,"action"); for(const k of ["action_id","description"]) str(a[k],k); for(const k of ["time_text","channel"]) str(a[k],k,true); if(!Number.isInteger(a.order)) fail("action.order"); refs(a,"action"); });
  const h=obj(d.airline_handling,"airline_handling");
  one(h.initial_status,["reported","not_reported","unknown"],"initial_status"); one(h.final_status,["reported","pending","not_reported","unknown"],"final_status");
  arr(h.responses,"responses").forEach(v=> { const r=obj(v,"response"); for(const k of ["response_id","description"]) str(r[k],k); for(const k of ["time_text","after_action_id"]) str(r[k],k,true); if(!Number.isInteger(r.order)) fail("response.order"); one(r.phase,enums.phase,"phase"); refs(r,"response");
    arr(r.measures,"measures").forEach(v=> { const m=obj(v,"measure"); str(m.description,"measure.description"); for(const k of ["currency_or_program","unit"]) str(m[k],k,true); if(m.amount!==null && (typeof m.amount!=="number" || !Number.isFinite(m.amount) || m.amount<0)) fail("amount"); one(m.kind,enums.kind,"kind"); one(m.fulfillment,enums.fulfillment,"fulfillment"); refs(m,"measure"); });
  });
  arr(d.sources,"sources").forEach(v=>{ const s=obj(v,"source"); for(const k of ["source_id","forum","post_locator","observed_at","reading_scope"]) str(s[k],`source.${k}`); for(const k of ["limitation","access_method"]) if(s[k]!==undefined) str(s[k],k); str(s.posted_at,"posted_at",true); str(s.url,"url",true); if(s.url!==null && !safeSourceUrl(s.url as string)) fail("source.url (仅 HTTPS)"); });
  arr(d.evidence,"evidence").forEach(v=> { const e=obj(v,"evidence"); for(const k of ["evidence_id","source_id","locator"]) str(e[k],k); str(e.excerpt,"excerpt",true); strings(e.supports,"supports"); if(e.note!==undefined) str(e.note,"evidence.note"); });
  const rv=obj(d.review,"review"); for(const k of ["record_status","workflow_status","review_status","rationale"]) str(rv[k],k); for(const k of ["missing_required","missing_optional"]) strings(rv[k],k); if(rv.notes!==undefined) strings(rv.notes,"notes"); if(rv.verification!==undefined) str(rv.verification,"verification"); str(rv.duplicate_of,"duplicate_of",true);
  one(rv.record_status,["complete","incomplete"],"record_status"); one(rv.workflow_status,["ready_for_review","needs_more_evidence","hold","excluded"],"workflow_status");
  arr(rv.conflicts,"conflicts").forEach(v=> {const c=obj(v,"conflict");str(c.detail,"conflict.detail");for(const k of ["field","severity"]) if(c[k]!==undefined) str(c[k],k);});
  return structuredClone(value) as DP;
}
export function approvalIssues(d: DP): string[] {
  const issues: string[]=[];
  const has=(s: string | null | undefined)=>Boolean(s?.trim());
  if(!has(d.event.description)) issues.push("缺少异常事件描述");
  if(!has(d.event.occurred_at.text) || d.event.occurred_at.precision==="unknown") issues.push("缺少有依据的事件时间");
  if(!has(d.event.provider) && !has(d.event.carrier)) issues.push("出票方与承运方至少需识别一方");
  if(!has(d.event.route.text) || !has(d.event.route.origin) || !has(d.event.route.destination)) issues.push("缺少可识别航线");
  if(d.event.issue_type==="unknown") issues.push("事件类型待确认");
  if(!d.airline_handling.responses.length || d.airline_handling.responses.some(r=>!has(r.description))) issues.push("缺少航司实际回应");
  if(d.review.record_status!=="complete" || d.review.workflow_status!=="ready_for_review" || d.review.missing_required.length) issues.push("请先补齐必填项并设为待审核");
  if(d.review.duplicate_of) issues.push("已标记为重复案例");
  if(d.review.conflicts.some(c=>c.severity!=="noncritical")) issues.push("存在未解决的关键冲突");
  const sourceIds=new Set(d.sources.map(s=>s.source_id)), evidenceIds=new Set(d.evidence.map(e=>e.evidence_id));
  if(sourceIds.size!==d.sources.length || evidenceIds.size!==d.evidence.length) issues.push("来源或证据 ID 重复");
  const validSources=new Set(d.sources.filter(s=>safeSourceUrl(s.url) && has(s.reading_scope) && !/^(blocked|supplied_text|未访问|访问失败)$/i.test(s.reading_scope)).map(s=>s.source_id));
  if(!validSources.size) issues.push("没有可追溯的已读来源");
  if(d.evidence.some(e=>!sourceIds.has(e.source_id) || !has(e.locator) || !e.supports.length)) issues.push("证据定位不完整");
  const validEvidence=new Set(d.evidence.filter(e=>validSources.has(e.source_id)).map(e=>e.evidence_id));
  const check=(refs:string[])=> refs.length>0 && refs.every(id=>evidenceIds.has(id) && validEvidence.has(id));
  if(!check(d.event.evidence_ids) || d.airline_handling.responses.some(r=>!check(r.evidence_ids) || r.measures.some(m=>!check(m.evidence_ids))) || (d.cause && !check(d.cause.evidence_ids)) || d.passenger_actions?.some(a=>!check(a.evidence_ids))) issues.push("事实或处置有缺失、未解析的证据引用");
  for(const field of ["description","occurred_at","route","issue_type"]) {
    if(!d.evidence.some(e=>d.event.evidence_ids.includes(e.evidence_id) && e.supports.some(p=>p==="event" || p===`event.${field}` || p.startsWith(`event.${field}.`)))) issues.push(`事件 ${field} 未绑定支持证据`);
  }
  const actions=new Set((d.passenger_actions??[]).map(a=>a.action_id));
  if(actions.size!==(d.passenger_actions??[]).length || new Set(d.airline_handling.responses.map(r=>r.response_id)).size!==d.airline_handling.responses.length) issues.push("行动或回应 ID 重复");
  if(d.airline_handling.responses.some(r=>r.after_action_id!==null && !actions.has(r.after_action_id))) issues.push("回应引用了不存在的行动");
  return [...new Set(issues)];
}
