import { NextResponse } from "next/server";
import { readBoundedJson } from "../inputLimits";
import { ReviewError, type Principal } from "./types";

// Replace this boundary with server-verified session / service identity for remote use.
// No browser-supplied actor or role is ever trusted. This adapter is LOCAL ONLY.
export function localReviewer(request: Request): Principal {
  if (process.env.NODE_ENV !== "development")
    throw new ReviewError("审核工作台未在此环境开放", 403);
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  let headerHost: URL;
  try {
    headerHost = new URL(`${url.protocol}//${host}`);
  } catch {
    throw new ReviewError("审核仅允许本地访问", 403);
  }
  if (
    !localHosts.includes(url.hostname) ||
    !localHosts.includes(headerHost.hostname) ||
    headerHost.host !== host
  )
    throw new ReviewError("审核仅允许本地访问", 403);
  if (request.method !== "GET" && request.headers.get("origin") !== `${url.protocol}//${host}`)
    throw new ReviewError("审核写入必须来自同源页面", 403);
  return { id: "local-human", role: "reviewer" };
}
export async function reviewBody(request: Request) {
  const body = await readBoundedJson(request, 2_000_000);
  if (!body.ok) throw new ReviewError(body.error, body.status);
  return body.value;
}
export function apiError(error: unknown) {
  if (error instanceof ReviewError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  // Local-only reviewer tool: the operator reads storage failures in the dev server log.
  // eslint-disable-next-line no-console
  console.error("DP review storage failure", error);
  return NextResponse.json(
    { error: "存储操作失败，未确认保存成功。请保留编辑内容并重试。" },
    { status: 500 }
  );
}
