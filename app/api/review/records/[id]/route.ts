import { NextResponse } from "next/server";
import { localReviewer, apiError, reviewBody } from "../../../../../lib/dp-review/http";
import { getReviewRepository } from "../../../../../lib/dp-review/file-repository";
import { projectCase, reviewRecord } from "../../../../../lib/dp-review/service";
import { ReviewError, type ReviewCommand } from "../../../../../lib/dp-review/types";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
  try {
    localReviewer(request); const {id}=await context.params;
    const record=(await getReviewRepository().read()).records.find(r=>r.id===id);
    if(!record) throw new ReviewError("案例不存在",404);
    return NextResponse.json({record,preview:projectCase(record.current)},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return apiError(e);}
}
export async function POST(request:Request,context:Context) {
  try {
    const actor=localReviewer(request), {id}=await context.params;
    const body=await reviewBody(request);
    const record=await reviewRecord(getReviewRepository(),id,body as unknown as ReviewCommand,actor);
    return NextResponse.json({record,preview:projectCase(record.current)});
  }catch(e){return apiError(e);}
}
