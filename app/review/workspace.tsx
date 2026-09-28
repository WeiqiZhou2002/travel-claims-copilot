"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewRecord, ReviewStatus } from "../../lib/dp-review/types";
import Editor from "./editor";

type Summary={id:string;batchId:string;version:number;status:ReviewStatus;title:string;carrier:string|null;provider:string|null;issue:string;route:string;blockers:number};
import { api, issueLabels, statusLabels } from "./client";
export default function ReviewWorkspace(){
 const [rows,setRows]=useState<Summary[]>([]),[selected,setSelected]=useState(""),[record,setRecord]=useState<ReviewRecord|null>(null);
 const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[batch,setBatch]=useState("all");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[notice,setNotice]=useState("");
 const [batchId,setBatchId]=useState(""),[importing,setImporting]=useState(false);
 const dirty=useRef(false), file=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{const data=await api<{records:Summary[]}>("/api/review");setRows(data.records);return data.records;},[]);
 useEffect(()=>{let live=true;load().then(data=>{if(live)setSelected([...data].sort((a,b)=>b.batchId.localeCompare(a.batchId))[0]?.id??data[0]?.id??"");}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[load]);
 useEffect(()=>{if(!selected)return;const controller=new AbortController();setDetailLoading(true);setError("");setRecord(null);api<{record:ReviewRecord}>(`/api/review/records/${encodeURIComponent(selected)}`,{signal:controller.signal}).then(d=>setRecord(d.record)).catch(e=>{if(e.name!=="AbortError")setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});return()=>controller.abort();},[selected]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[]);
 function select(id:string){if(id===selected)return;if(dirty.current&&!window.confirm("当前修改尚未保存。放弃修改并切换案例？"))return;dirty.current=false;setSelected(id);setNotice("");}
 async function imported(){
  const f=file.current?.files?.[0];if(!f||!batchId.trim()){setError("填写批次 ID 并选择候选 JSON 文件。");return;}
  if(f.size>1_900_000){setError("批次文件请小于 1.9 MB，最多 100 条。");return;}
  setImporting(true);setError("");try{const candidates=JSON.parse(await f.text());const result=await api<{imported:number}>("/api/review/batches",{method:"POST",body:JSON.stringify({batchId:batchId.trim(),candidates})});await load();setNotice(`已导入 ${result.imported} 条候选，均待审核。`);}catch(e){setError(e instanceof Error?e.message:"导入失败");}finally{setImporting(false);}
 }
 const filtered=rows.filter(r=>(status==="all"||r.status===status)&&(batch==="all"||r.batchId===batch)&&[r.title,r.route,r.carrier,r.provider,r.id].join(" ").toLowerCase().includes(query.toLowerCase()));
 return <main className="review-shell" lang="zh-CN">
  <header className="review-top"><Link href="/" onClick={e=>{if(dirty.current&&!window.confirm("放弃未保存修改并离开？"))e.preventDefault();}} className="review-brand"><span className="brand-mark">T/C</span> TRAVEL CLAIMS <span className="brand-divider">/</span> 资料工作台</Link><span className="local-tag"><i/> 本地审核</span></header>
  <section className="review-heading"><div><p className="eyebrow">COMMUNITY INTELLIGENCE · HUMAN REVIEW</p><h1>把经历，整理成可靠的参考。</h1><p className="review-muted">核对来源，保留不确定性。审核通过后，导出并部署发布快照才会进入案例检索。</p></div><div className="review-metrics">{([['pending','待审核'],['approved','已通过'],['needs_evidence','待补证']] as const).map(([s,label])=><button key={s} onClick={()=>setStatus(s)} className={status===s?"active":""}><strong>{rows.filter(r=>r.status===s).length.toString().padStart(2,"0")}</strong><span>{label}</span></button>)}</div></section>
  <div className="review-toolbar"><label className="review-search"><span>⌕</span><input aria-label="搜索案例" placeholder="搜索航司、航线、案例…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="筛选审核状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select aria-label="筛选批次" value={batch} onChange={e=>setBatch(e.target.value)}><option value="all">全部采集批次</option>{[...new Set(rows.map(r=>r.batchId))].map(b=><option key={b}>{b}</option>)}</select><details className="review-import"><summary>＋ 导入批次</summary><div><label>批次 ID<input value={batchId} onChange={e=>setBatchId(e.target.value)} placeholder="uscardforum-20260928"/></label><input ref={file} aria-label="候选 JSON 文件" type="file" accept=".json,application/json"/><button disabled={importing} onClick={imported}>{importing?"导入中…":"导入候选"}</button></div></details></div>
  {error?<div role="alert" className="review-alert">{error} <button onClick={()=>{setError("");load().then(data=>{if(!selected)setSelected(data[0]?.id??"");}).catch(e=>setError(e.message));}}>重试列表</button></div>:null}
  {notice?<div role="status" className="review-notice">{notice}</div>:null}
  <div className="review-workbench"><aside className="review-queue"><div className="queue-heading"><h2>审核队列</h2><span>{filtered.length} 条</span></div><div className="queue-list">{loading?<p className="empty-note">正在载入候选…</p>:filtered.length?filtered.map((r,i)=><button key={r.id} onClick={()=>select(r.id)} className={`queue-card ${selected===r.id?"selected":""}`} aria-pressed={selected===r.id}><div className="queue-card-top"><span className="queue-index">{String(i+1).padStart(2,"0")}</span><span className={`status-chip ${r.status}`}>{statusLabels[r.status]}</span></div><h3>{r.title}</h3><p>{r.route}</p><div className="queue-card-bottom"><span>{issueLabels[r.issue]??r.issue}</span>{r.blockers?<span className="has-blockers">需核对 {r.blockers} 项</span>:<span>R 项齐全</span>}</div></button>):<p className="empty-note">没有符合筛选条件的案例。</p>}</div></aside>
   {detailLoading?<section className="review-loading">正在打开案例与来源…</section>:record?<Editor key={`${record.id}-${record.version}`} record={record} onDirty={v=>{dirty.current=v;}} onSaved={async next=>{dirty.current=false;setRecord(next);await load();setNotice(next.status==="approved"?"已审核通过。导出发布快照并部署后，此版本才会进入正式检索。":"已保存审核操作。若此案例曾发布，需重新导出并部署才能在线上同步撤回。");}}/>:<section className="review-loading">{loading?"载入中…":"从左侧选择一个案例开始审核。"}</section>}
  </div><footer className="review-foot">社区 DP 是个体经历，不是官方规则。审核通过不代表独立事实核验。</footer>
 </main>;
}
