import type { ReviewStatus } from "../../lib/dp-review/types";

export const statusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  needs_evidence: "待补证",
  excluded: "已排除"
};
export const issueLabels: Record<string, string> = {
  airline_cancellation: "航班取消",
  airline_delay: "航班延误",
  denied_boarding: "拒载 / 让座",
  unknown: "待分类"
};
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? "请求失败");
  return body;
}
