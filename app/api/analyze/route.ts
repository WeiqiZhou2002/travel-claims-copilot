import { parseAnalyzeClaimRequest } from "../../../lib/api/analyze-contract";
import { processClaimTurn } from "../../../lib/claim-workflow";
import { createKnowledgeRepository } from "../../../lib/knowledge/knowledge-repository";
import { LocalRawFactExtractor } from "../../../lib/model/raw-fact-extractor";

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = parseAnalyzeClaimRequest(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid canonical analyze request." }, { status: 400 });
  }
  const asOf = currentUtcDate();
  try {
    const response = await processClaimTurn(parsed.data, {
      localExtractor: new LocalRawFactExtractor(),
      knowledgeRepository: createKnowledgeRepository({ asOf }),
      now: () => asOf
    });
    return Response.json(response);
  } catch {
    return Response.json({ error: "Analyze processing failed." }, { status: 500 });
  }
}
