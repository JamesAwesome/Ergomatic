import { describe, it, expect } from "vitest";
import { parseAllowlist } from "../auth/allowlist.js";
import {
  c2Gate,
  computeAvailable,
  computeAvailableFor,
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

// F1 (fix round 1). The reviewer replaced `c2Allowlist` with `allowlist` in
// `server/index.ts` — the SIGN-IN list, same type, same scope, two
// characters away — and got a clean typecheck with every one of 6842 tests
// green: the Concept2 surface open to every signed-in user, with nothing
// red anywhere. That mutation was reachable because `index.ts` held two
// identically-typed `Set<string>`s and did the composing itself, and
// `index.ts` cannot be imported by a test (it opens a real Postgres at
// import time).
//
// `c2Gate` takes RAW env strings and returns the finished gate, so the
// composing happens HERE, under test, and the untestable residue in
// `index.ts` shrinks to the env var NAMES — the same residue
// `C2_LINK_ENABLED` and the two credentials already carry, and one no
// same-scope neighbour can be confused with.
describe("c2Gate: the whole gate, composed from raw env", () => {
  const LIVE = {
    linkEnabledFlag: "1",
    clientId: "id",
    clientSecret: "secret",
  };
  const warnings = (g: ReturnType<typeof c2Gate>) =>
    g.bootLines.filter((l) => l.level === "warn").map((l) => l.message);
  const infos = (g: ReturnType<typeof c2Gate>) =>
    g.bootLines.filter((l) => l.level === "info").map((l) => l.message);

  // THE F1 REGRESSION TEST, and the reason it names two lists: the mutation
  // that survived everything swapped one Set for another that was populated
  // with DIFFERENT addresses. A test whose two lists are equal cannot tell
  // the two apart, so this one gives the rower an Ergomatic account and
  // withholds the Concept2 surface — the exact state a one-account rollout
  // puts every other rower in.
  it("a rower on ALLOWED_EMAILS but NOT on C2_ALLOWED_EMAILS is refused", () => {
    const gate = c2Gate({ ...LIVE, allowedEmails: "james@x.com" });
    expect(gate.available()).toBe(true);
    expect(gate.availableFor("james@x.com")).toBe(true);
    // `signed-in@x.com` is the shape of a rower the SIGN-IN allowlist
    // admits; this gate has never heard of them.
    expect(gate.availableFor("signed-in@x.com")).toBe(false);
  });

  it("raw env of undefined denies everyone, with the flag and creds fully on", () => {
    const gate = c2Gate({ ...LIVE, allowedEmails: undefined });
    expect(gate.available()).toBe(true);
    expect(gate.availableFor("james@x.com")).toBe(false);
  });

  it("raw env of an empty string denies everyone", () => {
    expect(c2Gate({ ...LIVE, allowedEmails: "" }).availableFor("a@x.com")).toBe(
      false,
    );
  });

  it("parses the raw list the way the sign-in allowlist does: split, trim, lower-case, drop blanks", () => {
    const gate = c2Gate({
      ...LIVE,
      allowedEmails: "  James@X.com , ,other@x.com,",
    });
    expect(gate.availableFor("JAMES@X.COM")).toBe(true);
    expect(gate.availableFor(" other@x.com ")).toBe(true);
    expect(gate.availableFor("nobody@x.com")).toBe(false);
  });

  it("the global gate still governs: flag off denies a listed rower", () => {
    const gate = c2Gate({
      linkEnabledFlag: undefined,
      clientId: "id",
      clientSecret: "secret",
      allowedEmails: "james@x.com",
    });
    expect(gate.available()).toBe(false);
    expect(gate.availableFor("james@x.com")).toBe(false);
  });

  it("credentials still govern: a missing secret denies a listed rower", () => {
    const gate = c2Gate({
      linkEnabledFlag: "1",
      clientId: "id",
      clientSecret: "",
      allowedEmails: "james@x.com",
    });
    expect(gate.available()).toBe(false);
    expect(gate.availableFor("james@x.com")).toBe(false);
  });

  describe("boot lines: what the operator is told", () => {
    const EMPTY_LIST =
      "WARNING: C2_ALLOWED_EMAILS is empty — nobody can link a Concept2 account";
    const CREDS =
      "WARNING: C2_LINK_ENABLED=1 but C2_CLIENT_ID / C2_CLIENT_SECRET not fully set — Concept2 linking is DISABLED";
    const FLAG_OFF =
      "WARNING: C2_CLIENT_ID / C2_CLIENT_SECRET are set but C2_LINK_ENABLED is not '1' — Concept2 linking stays DISABLED";

    it("flag on, creds set, empty list -> the empty-list warning and no count", () => {
      const gate = c2Gate({ ...LIVE, allowedEmails: undefined });
      expect(warnings(gate)).toStrictEqual([EMPTY_LIST]);
      expect(infos(gate)).toStrictEqual([]);
    });

    // F5: the empty-list warning was the ONLY signal, so a TYPO'D address
    // booted silently and produced an absent card — indistinguishable from
    // correct configuration on the exact walk this gate exists for. The
    // count separates "the variable never reached the container" (0, and a
    // warning) from "it arrived and parsed to N" (the operator then knows
    // to suspect the address itself, not the plumbing).
    it("flag on with a populated list -> no warning, and a COUNT that never names an address", () => {
      const gate = c2Gate({
        ...LIVE,
        allowedEmails: "james@x.com,other@x.com",
      });
      expect(warnings(gate)).toStrictEqual([]);
      expect(infos(gate)).toStrictEqual([
        "Concept2 per-user gate: 2 allowed email(s) configured",
      ]);
      // The addresses themselves never reach a log line — the whole point
      // of printing a count. Asserted over EVERY boot line, so a future
      // line that helpfully echoed the list would redden here.
      for (const line of gate.bootLines) {
        expect(line.message).not.toContain("james@x.com");
        expect(line.message).not.toContain("other@x.com");
      }
    });

    it("the count is the PARSED size, not the raw comma count", () => {
      const gate = c2Gate({
        ...LIVE,
        // Six commas, one duplicate, blanks and padding: five separators
        // and three real addresses.
        allowedEmails: " a@x.com ,, b@x.com,A@X.COM , ,c@x.com,",
      });
      expect(infos(gate)).toStrictEqual([
        "Concept2 per-user gate: 3 allowed email(s) configured",
      ]);
    });

    it("flag on, creds missing -> the creds warning AND the empty-list one", () => {
      const gate = c2Gate({
        linkEnabledFlag: "1",
        clientId: "id",
        clientSecret: "",
        allowedEmails: undefined,
      });
      expect(warnings(gate)).toStrictEqual([CREDS, EMPTY_LIST]);
    });

    it("flag off with creds set -> the flag-off warning alone, no allowlist noise and no count", () => {
      const gate = c2Gate({
        linkEnabledFlag: undefined,
        clientId: "id",
        clientSecret: "secret",
        allowedEmails: "james@x.com",
      });
      expect(warnings(gate)).toStrictEqual([FLAG_OFF]);
      expect(infos(gate)).toStrictEqual([]);
    });

    it("nothing configured at all -> silence", () => {
      expect(
        c2Gate({
          linkEnabledFlag: undefined,
          clientId: "",
          clientSecret: "",
          allowedEmails: undefined,
        }).bootLines,
      ).toStrictEqual([]);
    });
  });
});
