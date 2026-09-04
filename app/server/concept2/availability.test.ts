import { describe, it, expect } from "vitest";
import { parseAllowlist } from "../auth/allowlist.js";
import {
  computeAvailable,
  computeAvailableFor,
  c2Warnings,
} from "./availability.js";

// Wave E PR1 Task 7 (task-7-brief.md, owed M3 from Task 6's review): Task
// 6's own unit-level availability tests only ever exercised the ROUTER's
// `available()` closure directly (a hand-set boolean) — the distinction
// between "flag off" and "creds missing" collapses into that one boolean
// before it ever reaches the router, so nothing tested the COMPOSITION
// itself. `index.ts` runs at import time and requires `DATABASE_URL` (a
// real Postgres connection), so the composition is extracted here into its
// own pure function and tested directly, never through `index.ts`.
describe("computeAvailable: C2_LINK_ENABLED flag AND both credentials", () => {
  it("flag '1' with both creds present -> true", () => {
    expect(computeAvailable("1", "client-id", "client-secret")).toBe(true);
  });

  it("flag '1' but clientSecret missing (empty string) -> false", () => {
    expect(computeAvailable("1", "client-id", "")).toBe(false);
  });

  it("flag '1' but clientId missing (empty string) -> false", () => {
    expect(computeAvailable("1", "", "client-secret")).toBe(false);
  });

  it("flag unset (undefined) with both creds present -> false", () => {
    expect(computeAvailable(undefined, "client-id", "client-secret")).toBe(
      false,
    );
  });

  it("flag '0' with both creds present -> false", () => {
    expect(computeAvailable("0", "client-id", "client-secret")).toBe(false);
  });

  it("any other flag value (e.g. 'true') -> false — only the literal '1' enables", () => {
    expect(computeAvailable("true", "client-id", "client-secret")).toBe(false);
  });
});

// Wave E per-user gate (.superpowers/c2-user-gate-brief.md): the surface is
// live for one account before it is live for the sign-in allowlist. The
// composition is `available()` AND the email is on `C2_ALLOWED_EMAILS`,
// parsed with the SAME `parseAllowlist`/`isAllowed` pair `ALLOWED_EMAILS`
// uses. These tests run the RAW env string through `parseAllowlist` rather
// than hand-building a Set, because the fail-closed direction is a property
// of that parse (unset -> `""` -> no entries) and a hand-built `new Set()`
// would assert it about the test's own literal instead.
describe("computeAvailableFor: the per-user C2 gate", () => {
  const on = (raw: string | undefined) => parseAllowlist(raw);

  it("on the list, flag and both creds set -> true", () => {
    expect(
      computeAvailableFor(true, on("james@x.com,other@x.com"), "james@x.com"),
    ).toBe(true);
  });

  it("off the list, flag and both creds set -> false", () => {
    expect(computeAvailableFor(true, on("james@x.com"), "stranger@x.com")).toBe(
      false,
    );
  });

  // The direction a wrong default gets backwards: an absent variable must
  // mean NOBODY, never everybody. Both spellings of "not configured" are
  // pinned, because `process.env.X` is `undefined` when unset and `""` when
  // set to nothing, and only the first reaches a `??` default.
  it("C2_ALLOWED_EMAILS unset (undefined) -> nobody, not everybody", () => {
    expect(computeAvailableFor(true, on(undefined), "james@x.com")).toBe(false);
  });

  it("C2_ALLOWED_EMAILS empty string -> nobody, not everybody", () => {
    expect(computeAvailableFor(true, on(""), "james@x.com")).toBe(false);
  });

  it("a list of only separators and blanks -> nobody", () => {
    expect(computeAvailableFor(true, on(" , , "), "james@x.com")).toBe(false);
  });

  // The global gate is a CONJUNCT, not a fallback: being on the C2 list
  // never opens a surface whose flag is off or whose credentials are absent.
  it("on the list but the global gate is closed -> false", () => {
    expect(computeAvailableFor(false, on("james@x.com"), "james@x.com")).toBe(
      false,
    );
  });

  // `parseAllowlist` lower-cases and trims each entry; `isAllowed` does the
  // same to the probe. Google hands us whatever case the account carries, so
  // both halves matter.
  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const list = on("  James@X.com , other@x.com  ");
    expect(computeAvailableFor(true, list, "JAMES@X.COM")).toBe(true);
    expect(computeAvailableFor(true, list, " james@x.com ")).toBe(true);
    expect(computeAvailableFor(true, list, "OTHER@X.com")).toBe(true);
  });

  it("a near-miss email is not a match", () => {
    expect(
      computeAvailableFor(true, on("james@x.com"), "james@x.com.evil.test"),
    ).toBe(false);
  });
});

describe("c2Warnings: what the operator is told at boot", () => {
  const EMPTY_LIST =
    "WARNING: C2_ALLOWED_EMAILS is empty — nobody can link a Concept2 account";
  const CREDS =
    "WARNING: C2_LINK_ENABLED=1 but C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED";
  const FLAG_OFF =
    "WARNING: C2_CLIENT_ID / C2_CLIENT_SECRET are set but C2_LINK_ENABLED is not '1' — Concept2 linking stays DISABLED";

  it("flag on, creds set, but the C2 allowlist is empty -> the empty-list warning", () => {
    expect(
      c2Warnings("1", "id", "secret", parseAllowlist(undefined)),
    ).toStrictEqual([EMPTY_LIST]);
  });

  it("flag on with a populated C2 allowlist -> silence", () => {
    expect(
      c2Warnings("1", "id", "secret", parseAllowlist("james@x.com")),
    ).toStrictEqual([]);
  });

  it("flag on, creds missing -> both the creds warning and the empty-list one", () => {
    expect(c2Warnings("1", "id", "", parseAllowlist(undefined))).toStrictEqual([
      CREDS,
      EMPTY_LIST,
    ]);
  });

  // The pre-existing pair, pinned here because this function now owns them:
  // the flag-off warning is mutually exclusive with the creds one, and
  // neither fires on a wholly unconfigured deployment.
  it("flag off with creds set -> the flag-off warning alone, no allowlist noise", () => {
    expect(
      c2Warnings(undefined, "id", "secret", parseAllowlist(undefined)),
    ).toStrictEqual([FLAG_OFF]);
  });

  it("nothing configured at all -> silence", () => {
    expect(
      c2Warnings(undefined, "", "", parseAllowlist(undefined)),
    ).toStrictEqual([]);
  });
});
