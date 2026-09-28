import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import legacyCases from "../../data/cases.json";
import { migrateRecordIds } from "./identity";
import { acquireFileLock } from "./file-lock";
import { importInto } from "./service";
import { ReviewError, type ReviewRepository, type ReviewState } from "./types";

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
export class FileReviewRepository implements ReviewRepository {
  constructor(
    private directory: string,
    private seedRoot?: string,
    private reservedIds: readonly string[] = []
  ) {}

  private async seed(): Promise<ReviewState> {
    const state: ReviewState = { schemaVersion: 1, records: [] };
    if (!this.seedRoot) return state;
    let dirs;
    try {
      dirs = await readdir(this.seedRoot, { withFileTypes: true });
    } catch (e) {
      if (missing(e)) return state;
      throw e;
    }
    const batches = await Promise.all(
      dirs
        .filter((d) => d.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (d) => {
          try {
            return {
              id: d.name,
              rows: JSON.parse(
                await readFile(path.join(this.seedRoot!, d.name, "candidates.json"), "utf8")
              )
            };
          } catch (e) {
            if (missing(e)) return null;
            throw e;
          }
        })
    );
    batches.forEach((batch) => {
      if (batch) importInto(state, batch.id, batch.rows, { id: "local-seed", role: "collector" });
    });
    return state;
  }

  async read(): Promise<ReviewState> {
    try {
      const state = JSON.parse(
        await readFile(path.join(this.directory, "store.json"), "utf8")
      ) as ReviewState;
      if (state.schemaVersion !== 1 || !Array.isArray(state.records))
        throw new Error("Unsupported review store");
      return migrateRecordIds(state);
    } catch (e) {
      if (missing(e)) return this.seed();
      throw e;
    }
  }

  async transact<T>(work: (state: ReviewState) => T): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const lock = path.join(this.directory, "write.lock");
    const release = await acquireFileLock(lock);
    const temp = path.join(this.directory, `.store-${randomUUID()}.tmp`);
    try {
      const state = await this.read();
      const existingIds = new Set(state.records.map((record) => record.id));
      const result = work(state);
      if (
        state.records.some(
          (record) => !existingIds.has(record.id) && this.reservedIds.includes(record.id)
        )
      ) {
        throw new ReviewError("DP ID 与现有案例库冲突，请使用新的稳定 ID", 409);
      }
      const file = await open(temp, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(state, null, 2)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temp, path.join(this.directory, "store.json"));
      return result;
    } finally {
      await rm(temp, { force: true });
      await release();
    }
  }
}
export function getReviewRepository(): ReviewRepository {
  return new FileReviewRepository(
    process.env.DP_REVIEW_DATA_DIR ?? path.join(process.cwd(), ".local", "dp-review"),
    path.join(process.cwd(), "research", "airline-dp"),
    legacyCases.map((record) => record.case_id)
  );
}
