import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishedSnapshot, publishFile } from "../scripts/publish-reviewed-cases.mjs";
import { importInto, reviewRecord } from "../lib/dp-review/service";
import { FileReviewRepository } from "../lib/dp-review/file-repository";
import batch from "../research/airline-dp/uscardforum-review-20260927/candidates.json";

describe("reviewed release snapshots", () => {
  it("exports only audited approvals and removes withdrawn records on the next export", async () => {
    const dir = await mkdtemp(join(tmpdir(), "release-dp-"));
    try {
      const repo = new FileReviewRepository(dir);
      await repo.transact((state) =>
        importInto(state, "batch", batch.slice(0, 2), {
          id: "collector",
          role: "collector"
        })
      );
      expect(publishedSnapshot(await repo.read()).cases).toEqual([]);
      await reviewRecord(
        repo,
        batch[0].dp_id,
        {
          action: "approve",
          expectedVersion: 1,
          note: "核对来源",
          sourceChecked: true
        },
        { id: "human", role: "reviewer" }
      );
      const target = join(dir, "release.json");
      await publishFile(join(dir, "store.json"), target);
      expect(JSON.parse(await readFile(target, "utf8")).cases).toMatchObject([
        {
          case_id: batch[0].dp_id,
          reviewed_version: 2,
          review_status: "approved"
        }
      ]);
      await reviewRecord(
        repo,
        batch[0].dp_id,
        { action: "revoke", expectedVersion: 2, note: "重审" },
        { id: "human", role: "reviewer" }
      );
      await publishFile(join(dir, "store.json"), target);
      expect(JSON.parse(await readFile(target, "utf8")).cases).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects a forged approval without an audit", () => {
    expect(() =>
      publishedSnapshot({
        schemaVersion: 1,
        records: [{ id: "test", status: "approved", version: 2 }]
      })
    ).toThrow("approval audit");
  });
  it("keeps the last release intact if review storage is corrupt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "release-failure-"));
    try {
      const input = join(dir, "store.json");
      const target = join(dir, "release.json");
      await writeFile(input, "{broken");
      await writeFile(target, "previous release");
      await expect(publishFile(input, target)).rejects.toThrow();
      expect(await readFile(target, "utf8")).toBe("previous release");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
