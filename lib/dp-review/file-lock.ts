import { symlink, readlink, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { ReviewError } from "./types";

type Owner = { pid: number; host: string; token: string; createdAt: string };
const busy = () =>
  new ReviewError("另一个审核操作正在保存，请稍后重试。旧格式锁请按运维说明恢复。", 409);
function code(error: unknown) {
  return (error as NodeJS.ErrnoException).code;
}
function dead(value: string): boolean {
  try {
    const owner = JSON.parse(value) as Owner;
    if (
      owner.host !== hostname() ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      !owner.token
    )
      return false;
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      return code(error) === "ESRCH";
    }
  } catch {
    return false;
  }
}

// A symlink installs complete owner metadata atomically: no mkdir -> owner-write gap.
// Recovery itself is serialized, and checks the old token again under its own lock.
// Live PIDs, PID reuse, foreign hosts and unreadable metadata always fail closed.
export async function acquireFileLock(path: string, depth = 0): Promise<() => Promise<void>> {
  const owner = JSON.stringify({
    pid: process.pid,
    host: hostname(),
    token: randomUUID(),
    createdAt: new Date().toISOString()
  } satisfies Owner);
  const install = () => symlink(owner, path);
  try {
    await install();
  } catch (error) {
    if (code(error) !== "EEXIST") throw error;
    let previous: string;
    try {
      previous = await readlink(path);
    } catch {
      throw busy();
    }
    if (!dead(previous) || depth >= 4) throw busy();
    const releaseRecovery = await acquireFileLock(`${path}.recovery`, depth + 1);
    try {
      let current: string | undefined;
      try {
        current = await readlink(path);
      } catch (readError) {
        if (code(readError) !== "ENOENT") throw busy();
      }
      if (current !== undefined) {
        if (current !== previous || !dead(current)) throw busy();
        await unlink(path);
      }
      try {
        await install();
      } catch (installError) {
        if (code(installError) === "EEXIST") throw busy();
        throw installError;
      }
    } finally {
      await releaseRecovery();
    }
  }
  return async () => {
    if ((await readlink(path)) !== owner) throw new Error("Review lock ownership changed");
    await unlink(path);
  };
}
