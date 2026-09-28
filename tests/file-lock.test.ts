import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,rm,symlink,readlink} from "node:fs/promises";
import {hostname,tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {acquireFileLock} from "../lib/dp-review/file-lock";
import {migrateRecordIds} from "../lib/dp-review/identity";
const dirs:string[]=[];
async function lockPath(){const dir=await mkdtemp(join(tmpdir(),"dp-lock-"));dirs.push(dir);return join(dir,"write.lock");}
function deadOwner(){const child=spawnSync(process.execPath,["-e",""]);return JSON.stringify({pid:child.pid,host:hostname(),token:"dead-test",createdAt:new Date().toISOString()});}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
describe("local process locks",()=>{
 it("rejects a live owner even if its timestamp is old",async()=>{
  const path=await lockPath();await symlink(JSON.stringify({pid:process.pid,host:hostname(),token:"live",createdAt:"2000-01-01"}),path);
  await expect(acquireFileLock(path)).rejects.toMatchObject({status:409});
 });
 it("recovers a killed owner and a killed recovery owner",async()=>{
  const path=await lockPath();await symlink(deadOwner(),path);await symlink(deadOwner(),`${path}.recovery`);
  const release=await acquireFileLock(path);expect(JSON.parse(await readlink(path)).pid).toBe(process.pid);await release();
 });
 it("only grants one lock during simultaneous stale-owner recovery",async()=>{
  const path=await lockPath();await symlink(deadOwner(),path);
  const results=await Promise.allSettled(Array.from({length:8},()=>acquireFileLock(path)));
  const winners=results.filter(r=>r.status==="fulfilled");expect(winners).toHaveLength(1);
  for(const winner of winners)if(winner.status==="fulfilled")await winner.value();
 });
 it("preserves review edits and audit versions while migrating ID references",()=>{
  const original={id:"uscf-123-name",version:3,current:{dp_id:"uscf-123-name",title:"人工修订",review:{duplicate_of:"uscf-456-other"}},history:[{version:2,snapshot:{dp_id:"uscf-123-name"},note:"核对"}]};
  const next=migrateRecordIds(original);expect(next.id).toMatch(/^dp-[a-f0-9]{20}$/);expect(next.current.dp_id).toBe(next.id);expect(next.history[0].snapshot.dp_id).toBe(next.id);expect(next.current.title).toBe(original.current.title);expect(next.version).toBe(3);expect(migrateRecordIds(next)).toEqual(next);
 });
});
