import { NextResponse } from "next/server";
import { localReviewer, apiError, reviewBody } from "../../../../lib/dp-review/http";
import { getReviewRepository } from "../../../../lib/dp-review/file-repository";
import { importBatch } from "../../../../lib/dp-review/service";
import { ReviewError } from "../../../../lib/dp-review/types";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    localReviewer(request);const body=await reviewBody(request);
    if(typeof body.batchId!=="string" || !Array.isArray(body.candidates)) throw new ReviewError("需要 batchId 和 candidates 数组",400);
    const imported=await importBatch(getReviewRepository(),body.batchId,body.candidates,{id:"local-import",role:"collector"});
    return NextResponse.json({imported});
  }catch(e){return apiError(e);}
}
