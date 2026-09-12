import { createHash } from "node:crypto";

/**
 * The namespace every seeded library id is derived under. Minted once
 * (2026-09-12) and NEVER changed: editing it re-keys every future fresh
 * database's library, which is the one way to break the invariant this
 * module exists for — "seeding an empty database produces the same
 * (title, id) set as seeding any other empty database from the same
 * library file". `seedId.test.ts` pins a derived value so an edit fails a
 * test that names that consequence.
 */
export const SEED_NAMESPACE = "c030fc9a-98a3-4de1-99b6-aeedcae43cd1";

/**
 * RFC 9562 §5.5 (UUIDv5): SHA-1 over `namespace-bytes ‖ name`, then the
 * version nibble set to 5 and the variant bits to `10`. Verified against
 * the RFC's Appendix A.4 vector in `seedId.test.ts`. Twelve lines rather
 * than a dependency — no `uuid` package is installed and one is not worth
 * adding for a single call site.
 */
export function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(name, "utf8")]))
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The id a seeded library workout gets at INSERT. Derived from the title
 * so a fresh database — CI, a screenshots run, a new deploy — seeds the
 * same row ids as every other. Applied ONLY on `seedGlobalLibrary`'s
 * insert path (`seed.ts`); personal workouts and existing rows are never
 * touched, and a renamed row keeps the id it was inserted under (design
 * spec `2026-09-12-deterministic-seed-ids`, §Invariant).
 */
export function seedWorkoutId(title: string): string {
  return uuidV5(SEED_NAMESPACE, title);
}
