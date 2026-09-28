import { createHash } from "node:crypto";

// Stable opaque IDs for earlier forum records. This does not anonymize the source post.
export function canonicalDpId(id: string): string {
  return id.startsWith("uscf-")
    ? `dp-${createHash("sha256").update(`travel-claims-dp:${id}`).digest("hex").slice(0, 20)}`
    : id;
}
export function migrateRecordIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(migrateRecordIds) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ["dp_id", "id", "case_id", "duplicate_of"].includes(key) &&
        typeof item === "string"
          ? canonicalDpId(item)
          : migrateRecordIds(item),
      ]),
    ) as T;
  return value;
}
