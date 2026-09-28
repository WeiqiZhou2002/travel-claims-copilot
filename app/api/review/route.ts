import { NextResponse } from "next/server";
import { localReviewer, apiError } from "../../../lib/dp-review/http";
import { getReviewRepository } from "../../../lib/dp-review/file-repository";
import { approvalIssues } from "../../../lib/dp-review/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    localReviewer(request);
    const state = await getReviewRepository().read();
    return NextResponse.json(
      {
        records: state.records.map((r) => ({
          id: r.id,
          batchId: r.batchId,
          version: r.version,
          status: r.status,
          title: r.current.title ?? r.current.event.description,
          carrier: r.current.event.carrier,
          provider: r.current.event.provider,
          issue: r.current.event.issue_type,
          route: r.current.event.route.text,
          blockers: approvalIssues(r.current).length,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
