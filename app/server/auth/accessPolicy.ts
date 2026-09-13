import { isAllowed, parseAllowlist } from "./allowlist.js";

export type AccessMode = "restricted" | "public";

export interface AccessPolicy {
  readonly mode: AccessMode;
  allows(email: string): boolean;
}

export function createAccessPolicy(
  rawMode: string | undefined,
  rawAllowlist: string | undefined,
): AccessPolicy {
  const value = rawMode?.trim() || "restricted";
  if (value !== "restricted" && value !== "public") {
    throw new Error("ACCESS_MODE must be restricted or public");
  }
  const allowlist = parseAllowlist(rawAllowlist);
  return Object.freeze({
    mode: value,
    allows: (email: string) =>
      value === "public" || isAllowed(allowlist, email),
  });
}
