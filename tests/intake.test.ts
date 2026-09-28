import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyClaimFacts, type ClaimFacts } from "../lib/claimFacts";
import { processIntake } from "../lib/intake";
import { POST as intakePost } from "../app/api/intake/route";
import { POST as analyzePost } from "../app/api/analyze/route";
import { canonicalizeProviderName } from "../lib/provider";

const hotel = (): ClaimFacts => ({...emptyClaimFacts(),issueType:"hotel_walk",providerType:"hotel",provider:"Marriott",confidence:"high"});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("LLM-only intake contract (mocked model output, not accuracy evaluation)",()=>{
 it("uses schema-validated model facts without regex overwrites",async()=>{
  const output={...emptyClaimFacts(),providerType:"airline" as const,issueType:"airline_delay" as const,provider:"Lufthansa",operatingCarrier:"Lufthansa",arrivalDelayMinutes:90};
  const result=await processIntake("Ana arrived in the United Kingdom 4 hours early. United marketed the flight, operated by Lufthansa.",emptyClaimFacts(),{llmClient:{generate:vi.fn().mockResolvedValue(output)}});
  expect(result.facts.operatingCarrier).toBe("Lufthansa");expect(result.facts.provider).toBe("Lufthansa");expect(result.facts.arrivalDelayMinutes).toBe(90);expect(result.extractionMode).toBe("llm");
 });
 it("does not fill an unknown model output from keyword guesses",async()=>{
  const result=await processIntake("My name is Ana. I am in the United Kingdom.",emptyClaimFacts(),{llmClient:{generate:vi.fn().mockResolvedValue(emptyClaimFacts())}});
  expect(result.facts.provider).toBeNull();expect(result.facts.operatingCarrier).toBeNull();expect(result.status).toBe("needs_info");
 });
 it("passes prior facts and the latest correction to the model without mutating prior facts",async()=>{
  const prior=hotel();const before=structuredClone(prior);const generate=vi.fn().mockResolvedValue({...hotel(),provider:"Hyatt"});
  const result=await processIntake("Correction: Hyatt",prior,{llmClient:{generate}});
  expect(JSON.parse(generate.mock.calls[0][0].input)).toEqual({priorFacts:prior,latestUserMessage:"Correction: Hyatt"});expect(prior).toEqual(before);expect(result.facts.provider).toBe("Hyatt");
 });
 it("preserves model unknowns and explicit acceptance decisions",async()=>{
  const output={...hotel(),acceptedAlternative:false,arrivalDelayMinutes:null};
  const result=await processIntake("Automatically rebooked",emptyClaimFacts(),{llmClient:{generate:vi.fn().mockResolvedValue(output)}});
  expect(result.facts.acceptedAlternative).toBe(false);expect(result.facts.arrivalDelayMinutes).toBeNull();
 });
 it("fails clearly when unconfigured instead of classifying with rules",async()=>{
  await expect(processIntake("Marriott oversold",hotel(),{llmClient:null})).rejects.toMatchObject({category:"not_configured",status:503});
 });
 it.each([
  [new DOMException("timeout","AbortError"),"timeout"],
  [new Error("HTTP 401"),"authentication"],
  [new Error("HTTP 429"),"rate_limit"],
  [new SyntaxError("invalid JSON"),"invalid_output"],
  [new Error("network failed"),"upstream"]
 ])("propagates model failure without changing facts (%s)",async(error,category)=>{
  const prior=hotel();await expect(processIntake("United cancelled",prior,{llmClient:{generate:vi.fn().mockRejectedValue(error)}})).rejects.toMatchObject({category});expect(prior).toEqual(hotel());
 });
 it("rejects malformed structured output instead of invoking fallback",async()=>{
  await expect(processIntake("Marriott oversold",emptyClaimFacts(),{llmClient:{generate:vi.fn().mockResolvedValue({provider:"Marriott"})}})).rejects.toMatchObject({category:"invalid_output"});
 });
 it("normalizes only exact aliases in structured fields",()=>{
  expect(canonicalizeProviderName("United Kingdom")).toBe("United Kingdom");expect(canonicalizeProviderName("Avianca Airlines")).toBe("Avianca Airlines");expect(canonicalizeProviderName("AA","airline")).toBe("American Airlines");
 });
 it("both public free-text endpoints return a retryable failure without configuration",async()=>{
  vi.stubEnv("LLM_PROVIDER","disabled");
  const req=(body:unknown)=>new Request("http://localhost/api",{method:"POST",body:JSON.stringify(body)});
  for(const response of [await intakePost(req({message:"Marriott oversold"})),await analyzePost(req({description:"Marriott oversold"}))]) {
   expect(response.status).toBe(503);expect((await response.json()).failureCategory).toBe("not_configured");
  }
 });
});
