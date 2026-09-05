/**
 * "This account has been told Concept2 is available" — the ONE persisted fact
 * the Concept2 row on You reads (spec 2026-09-04-concept2-walk-fixes §5.1,
 * ruling 6 and its lifetime table, invariants I-A..I-G).
 *
 * WHY IT IS PERSISTED AND NOT `useState`: `useConcept2Link`'s `link` and
 * `failed` are component state, routes are flat and mutually exclusive, so
 * You unmounts on every trip to `/you/concept2` and back and every visit is a
 * first-ever read. Per-mount evidence had a shorter lifetime than the fact it
 * was asked to carry (RF27). `localStorage` is the store this WebView already
 * writes from (`monitor/monitorRun.ts`'s `saveMonitorRun`) and it survives
 * unmount, route change, backgrounding and relaunch (I-E). Availability floor:
 * `localStorage` is part of WebKit's WKWebView on every iOS this app targets
 * (`IPHONEOS_DEPLOYMENT_TARGET = 15.0`, `App.xcodeproj/project.pbxproj`);
 * WebStorage shipped in iOS 2.0's Safari and has never been removed.
 *
 * WHAT IT ASSERTS (I-B): exactly one thing — a successful read on THIS account
 * has reported `available: true` at least once. Never linked, never healthy,
 * never current. Its only consumer is the row's `link === null && failed !==
 * null` cell (I-F): the row that would otherwise have to show a rower an
 * error about a feature they may not have.
 *
 * PER ACCOUNT (I-A): the key carries the account id, so no account can read
 * another's. Sign-out ALSO clears it (I-D, `You.tsx`'s Sign out handler) —
 * NOT because another account could read it (I-A pins that) but because
 * THIS account may sign back in on this device after being removed from
 * `C2_ALLOWED_EMAILS`, and a stale `true` would give it a door on the one
 * read that fails.
 *
 * FAIL-CLOSED ON THE MINT (I-G): a read that throws answers `false` ("not
 * seen"), and a MINT that throws is swallowed — the row goes quiet, it never
 * asserts a cohort from a write nobody made. The CLEAR is the one direction
 * that is not fail-closed: a `removeItem` that throws leaves the old `"1"`,
 * so a stale claim can survive until the next successful clear or sign-out.
 * Bounded: the only cell it feeds (row 2b) draws a door whose screen re-reads
 * the server, and I-C retries the clear on every successful read. Named
 * rather than hidden; `concept2Seen.test.ts` pins both directions. This is
 * the opposite of RF25/AUD-016's `saveMonitorRun`, where a swallowed write
 * let the caller proceed as if it had succeeded; here the caller's next
 * render simply re-reads storage.
 *
 * ONE COLLAPSE TO KNOW ABOUT: `normalizeLink` answers `available: false` for
 * a 200 whose body it cannot read as well as for a real "no Concept2" — so a
 * malformed 200 clears the fact (I-C) exactly as a revocation does. The cost
 * is one visit's silence on the next FAILED read (cell 2a instead of 2b),
 * never a claim; accepted, because the alternative is trusting a body the
 * hook itself refused.
 */

const KEY_PREFIX = "ergomatic.concept2Seen.";

export function concept2SeenKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

/** `true` only when a successful read on this account has ever reported
 *  `available: true` AND that fact could be read back. Anything else —
 *  absent key, storage unavailable, a value that is not our own `"1"` — is
 *  `false`. */
export function readConcept2Seen(accountId: string): boolean {
  try {
    return localStorage.getItem(concept2SeenKey(accountId)) === "1";
  } catch {
    return false;
  }
}

/** Records the latest SUCCESSFUL read's `available` answer for this account:
 *  `true` mints the fact, `false` clears it in the same pass (I-C — a revoked
 *  cohort membership cannot leave a row behind). Never called on a FAILED
 *  read; the caller (`Concept2Row`) only reaches this once `link` is non-null.
 *  A throwing store is swallowed: the fact degrades to "not seen" on the
 *  next read, never to a claim. */
export function writeConcept2Seen(accountId: string, available: boolean): void {
  try {
    if (available) localStorage.setItem(concept2SeenKey(accountId), "1");
    else localStorage.removeItem(concept2SeenKey(accountId));
  } catch {
    // I-G: nothing to do. The next `readConcept2Seen` answers `false`, which
    // is the honest failure mode — the row goes quiet.
  }
}

/** I-D: sign-out clears the fact for the account signing out. */
export function clearConcept2Seen(accountId: string): void {
  writeConcept2Seen(accountId, false);
}
