import { createIntakePostHandler } from "../../../lib/intake";
import { LocalRawFactExtractor } from "../../../lib/model/raw-fact-extractor";

export const POST = createIntakePostHandler({
  localExtractor: new LocalRawFactExtractor()
});
