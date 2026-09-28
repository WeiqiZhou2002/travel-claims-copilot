import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";

// This exports approved, audited snapshots, never candidate previews.
export function publishedSnapshot(state, seedIds = []) {
  if (state?.schemaVersion !== 1 || !Array.isArray(state.records))
    throw new Error("Invalid review store");
  const managedIds = [],
    cases = [];
  for (const record of state.records) {
    const id = record.id?.startsWith("uscf-")
      ? `dp-${createHash("sha256").update(`travel-claims-dp:${record.id}`).digest("hex").slice(0, 20)}`
      : record.id;
    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,140}$/.test(id) ||
      managedIds.includes(id) ||
      seedIds.includes(id)
    )
      throw new Error("Duplicate or reserved DP ID");
    if (
      !["pending", "approved", "needs_evidence", "excluded"].includes(
        record.status,
      )
    )
      throw new Error("Invalid review status");
    managedIds.push(id);
    if (record.status !== "approved") {
      if (record.publication !== null)
        throw new Error("Unapproved record contains a publication");
      continue;
    }
    const event = record.history?.at(-1);
    if (
      event?.version !== record.version ||
      event?.action !== "approve" ||
      event?.sourceChecked !== true ||
      !event?.note?.trim() ||
      !event?.actor ||
      JSON.stringify(event.snapshot) !== JSON.stringify(record.current)
    )
      throw new Error(`Missing approval audit: ${record.id}`);
    const item = record.publication;
    if (
      record.current?.review?.review_status !== "approved" ||
      record.current?.dp_id !== record.id ||
      item?.case_id !== record.id ||
      item?.review_status !== "approved" ||
      item?.source_type !== "community_dp"
    )
      throw new Error(`Invalid publication: ${record.id}`);
    const source = new URL(item.source_url);
    if (source.protocol !== "https:" || source.username || source.password)
      throw new Error("Invalid published source URL");
    cases.push({
      ...item,
      case_id: id,
      notes:
        typeof item.notes === "string"
          ? item.notes.replaceAll(record.id, id)
          : item.notes,
      reviewed_version: record.version,
    });
  }
  return {
    schemaVersion: 1,
    managedIds: managedIds.sort(),
    cases: cases.sort((a, b) => a.case_id.localeCompare(b.case_id)),
  };
}

export async function publishFile(input, target, seedIds = []) {
  if (resolve(input) === resolve(target))
    throw new Error("Cannot overwrite review store");
  const state = JSON.parse(await readFile(input, "utf8"));
  const snapshot = publishedSnapshot(state, seedIds);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return snapshot;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const input =
    process.argv[2] ??
    resolve(
      process.env.DP_REVIEW_DATA_DIR ?? resolve(root, ".local/dp-review"),
      "store.json",
    );
  const seeds = JSON.parse(
    await readFile(resolve(root, "data/cases.json"), "utf8"),
  );
  const result = await publishFile(
    resolve(input),
    resolve(root, "data/reviewed-cases.json"),
    seeds.map((item) => item.case_id),
  );
  console.log(
    `Exported ${result.cases.length} reviewed cases. Review the diff, commit and deploy to publish; withdrawals require the same steps.`,
  );
}
