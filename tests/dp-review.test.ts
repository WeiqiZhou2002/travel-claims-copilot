import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import batch from "../research/airline-dp/uscardforum-review-20260927/candidates.json";
import { FileReviewRepository } from "../lib/dp-review/file-repository";
import { importBatch, reviewRecord } from "../lib/dp-review/service";
import { approvalIssues, parseDP } from "../lib/dp-review/validation";
import { mergeCaseLibrary } from "../lib/case-library";
import { localReviewer } from "../lib/dp-review/http";
import type { ReviewCommand, Principal } from "../lib/dp-review/types";
import { searchCases, buildRetrievalQuery } from "../lib/retrieval";
import { POST as importRoute } from "../app/api/review/batches/route";
import { POST as reviewRoute, GET as detailRoute } from "../app/api/review/records/[id]/route";
import { loadCaseLibrary } from "../lib/case-library";
import { readBoundedJson } from "../lib/inputLimits";

const reviewer:Principal={id:"reviewer-test",role:"reviewer"},collector:Principal={id:"agent-test",role:"collector"};
const dirs:string[]=[];
async function setup(){const dir=await mkdtemp(path.join(tmpdir(),"dp-review-"));dirs.push(dir);const repo=new FileReviewRepository(dir);await importBatch(repo,"batch",[batch[0]],collector);return {repo,dir,id:batch[0].dp_id};}
const approve:ReviewCommand={action:"approve",expectedVersion:1,note:"已对照原帖核对",sourceChecked:true};
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
describe("DP review publication lifecycle",()=>{
 it("imports all real drafts without trusting their approval flag, preserving original evidence",async()=>{
  const {repo}=await setup();const forged=structuredClone(batch[1]);forged.review.review_status="approved";await importBatch(repo,"another",[forged],collector);
  const state=await repo.read();expect(state.records[1].status).toBe("pending");expect(state.records[1].publication).toBeNull();expect(state.records[1].original.review.review_status).toBe("approved");expect(state.records[1].current.review.review_status).toBe("needs_review");expect(mergeCaseLibrary([],state)).toEqual([]);
 });
 it("publishes once, becomes retrievable immediately, and draft edits withdraw the old version",async()=>{
  const {repo,id,dir}=await setup();await reviewRecord(repo,id,approve,reviewer);
  const fresh=new FileReviewRepository(dir);const approved=await fresh.read();const library=mergeCaseLibrary([],approved);
  expect(library).toHaveLength(1);expect(library[0].provider).toBeNull();expect(library[0].carrier).toBe("American Airlines");expect(library[0].actual_outcome).toContain("7500");expect(library[0].evidence_used).toEqual([]);
  const results=searchCases(buildRetrievalQuery({description:"AA PVG DFW cancellation",issueType:"airline_cancellation",providerType:"airline",operatingCarrier:"American Airlines",confidence:"high",source:"keyword",signals:[]}),library);
  expect(results.map(r=>r.case_id)).toContain(id);
  const draft=structuredClone(approved.records[0].current);draft.event.description+=" 待复核";
  await reviewRecord(repo,id,{action:"save",expectedVersion:2,dp:draft,note:"修改"},reviewer);
  const changed=await fresh.read();expect(mergeCaseLibrary(library,changed)).toEqual([]);expect(changed.records[0].original).toEqual(batch[0]);expect(changed.records[0].history).toHaveLength(3);expect(changed.records[0].history[1].snapshot.event.description).toBe(batch[0].event.description);
 });
 it("rejects stale and concurrent approvals without losing history or duplicating publication",async()=>{
  const {repo,id}=await setup();const results=await Promise.allSettled([reviewRecord(repo,id,approve,reviewer),reviewRecord(repo,id,approve,reviewer)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((await repo.read()).records[0].history).toHaveLength(2);
  await expect(reviewRecord(repo,id,approve,reviewer)).rejects.toMatchObject({status:409});
 });
 it("revoke and exclusion remove published versions from retrieval",async()=>{
  const {repo,id}=await setup();await reviewRecord(repo,id,approve,reviewer);await reviewRecord(repo,id,{action:"revoke",expectedVersion:2,note:"来源需重审"},reviewer);expect(mergeCaseLibrary([],await repo.read())).toEqual([]);
  await reviewRecord(repo,id,{...approve,expectedVersion:3},reviewer);await reviewRecord(repo,id,{action:"exclude",expectedVersion:4,note:"不收录"},reviewer);expect(mergeCaseLibrary([],await repo.read())).toEqual([]);
 });
 it("import is idempotent, collision is atomic and cannot overwrite reviewer edits",async()=>{
  const {repo,id,dir}=await setup();expect(await importBatch(repo,"batch",[batch[0]],collector)).toBe(0);
  await reviewRecord(repo,id,approve,reviewer);const before=await readFile(path.join(dir,"store.json"),"utf8");
  await expect(importBatch(repo,"new-batch",[batch[1],batch[0]],collector)).rejects.toMatchObject({status:409});expect(await readFile(path.join(dir,"store.json"),"utf8")).toBe(before);
 });
 it("rejects imports that would shadow an existing library case",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"dp-review-reserved-"));dirs.push(dir);
  const repo=new FileReviewRepository(dir,undefined,[batch[0].dp_id]);
  await expect(importBatch(repo,"batch",[batch[0]],collector)).rejects.toMatchObject({status:409});
  expect((await repo.read()).records).toEqual([]);
 });
 it("does not mistake a partially unavailable thread for an entirely unread source",()=>{
  const dp=parseDP(batch[0]);dp.sources[0].reading_scope="已读取主帖；第 4 页访问失败";
  expect(approvalIssues(dp)).toEqual([]);
 });
 it("forbids agent approval, unverified sources, broken evidence and unresolved conflicts",async()=>{
  const {repo,id}=await setup();await expect(reviewRecord(repo,id,approve,collector)).rejects.toMatchObject({status:403});await expect(reviewRecord(repo,id,{...approve,sourceChecked:false},reviewer)).rejects.toThrow("核对");
  const dp=parseDP(batch[0]);dp.event.evidence_ids=["missing"];await expect(reviewRecord(repo,id,{...approve,dp},reviewer)).rejects.toThrow("证据");
  const conflict=parseDP(batch[0]);conflict.review.conflicts.push({detail:"日期矛盾",severity:"critical"});await expect(reviewRecord(repo,id,{...approve,dp:conflict},reviewer)).rejects.toThrow("关键冲突");
  expect((await repo.read()).records[0].version).toBe(1);
 });
 it("allows optional fields and final outcome to remain unknown; saves incomplete drafts",async()=>{
  const {repo,id}=await setup();const dp=parseDP(batch[0]);dp.cause=null;dp.passenger_actions=null;dp.airline_handling.responses.forEach(r=>r.after_action_id=null);dp.airline_handling.final_status="not_reported";expect(approvalIssues(dp)).toEqual([]);
  dp.event.description="";await reviewRecord(repo,id,{action:"save",expectedVersion:1,dp,note:"待补事件"},reviewer);await expect(reviewRecord(repo,id,{...approve,expectedVersion:2},reviewer)).rejects.toThrow("事件描述");
 });
 it("validates all supplied batches and rejects malicious source URLs / malformed arrays",()=>{
  for(const dp of batch)expect(()=>parseDP(dp)).not.toThrow();
  const dp=structuredClone(batch[0]);dp.sources[0].url="javascript:alert(1)";expect(()=>parseDP(dp)).toThrow("HTTPS");
  expect(()=>parseDP({...batch[0],passenger_actions:{}})).toThrow("passenger_actions");
 });
});
describe("local administrative boundary",()=>{
 it("fails closed in production and on foreign origins/hosts",()=>{
  vi.stubEnv("NODE_ENV","production");vi.stubEnv("DP_REVIEW_LOCAL","");expect(()=>localReviewer(new Request("http://localhost/api/review"))).toThrow("未在此环境开放");
  vi.stubEnv("NODE_ENV","development");expect(()=>localReviewer(new Request("http://example.com/api/review"))).toThrow("本地");expect(()=>localReviewer(new Request("http://localhost/api/review",{method:"POST",headers:{origin:"https://evil.test"}}))).toThrow("同源");
  expect(localReviewer(new Request("http://localhost:3000/api/review",{method:"POST",headers:{origin:"http://localhost:3000"}}))).toEqual({id:"local-human",role:"reviewer"});
 });
 it("accepts Next.js normalized localhost URLs with matching loopback Host and Origin",()=>{
  vi.stubEnv("NODE_ENV","development");
  expect(localReviewer(new Request("http://localhost:3000/api/review",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000"}})).role).toBe("reviewer");
 });
 it("bounds batch bodies without relaxing the public intake default",async()=>{
  const make=()=>new Request("http://localhost",{method:"POST",body:JSON.stringify({padding:"a".repeat(65000)})});
  expect((await readBoundedJson(make())).ok).toBe(false);expect((await readBoundedJson(make(),100000)).ok).toBe(true);
 });
});

describe("review HTTP workflow",()=>{
 it("imports, reads, publishes and withdraws through route handlers using isolated storage",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"dp-review-http-"));dirs.push(dir);
  vi.stubEnv("DP_REVIEW_DATA_DIR",dir);vi.stubEnv("NODE_ENV","development");
  const dp=structuredClone(batch[0]);dp.dp_id="isolated-http-test";
  const request=(pathname:string,body:unknown)=>new Request(`http://localhost:3000${pathname}`,{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},body:JSON.stringify(body)});
  expect((await importRoute(request("/api/review/batches",{batchId:"http-test",candidates:[dp]}))).status).toBe(200);
  const context={params:Promise.resolve({id:dp.dp_id})};
  const detail=await detailRoute(new Request("http://localhost:3000/api/review/records/isolated-http-test"),context);
  expect((await detail.json()).record.status).toBe("pending");
  expect((await reviewRoute(request("/api/review/records/isolated-http-test",approve),context)).status).toBe(200);
  expect((await loadCaseLibrary()).some(c=>c.case_id===dp.dp_id)).toBe(true);
  expect((await reviewRoute(request("/api/review/records/isolated-http-test",{action:"revoke",expectedVersion:2,note:"测试撤回"}),context)).status).toBe(200);
  expect((await loadCaseLibrary()).some(c=>c.case_id===dp.dp_id)).toBe(false);
 });
});
