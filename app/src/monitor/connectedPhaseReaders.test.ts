// THE ENUM-READER PIN (connected-axes 2a spec, exit criterion 8; task 5
// step 4b). `ConnectedPhase` (`useMonitorSession.ts`) is the raw machine
// state — nine members after task 5 retired `"paused"` — and
// `connectedAxes.ts` exists precisely so nothing ELSE has to switch on it:
// every question a screen actually needs ("is the link up", "is a program
// armed", "has the freeze fired") is one of the four axes `deriveAxes`
// computes, never a `phase` comparison of a screen's own invention. Two
// files still read `phase` directly today — `ConnectedSurface.tsx` and
// `ConnectedInterstitial.tsx`, both named in this task's own brief — and
// are allowlisted below as KNOWN, MIGRATING debt, not as a precedent. This
// sweep is what stops a THIRD one from joining them unnoticed: a source
// grep, not a lint rule (no ESLint restriction shares this repo's shape for
// a single named export the way the Capacitor/`domain/judge` precedent the
// brief cited does — a source-sweep test is the same enforcement, cheaper
// to read).
//
// TWO SIGNALS, ORed, because there are two ways to "read" this union: the
// TYPE itself (`connectedAxes.ts`'s own `import type { ConnectedPhase }`)
// and the STRUCTURAL shape it types (`session.phase === "..."`, which
// `ConnectedSurface.tsx`/`ConnectedInterstitial.tsx` both do without ever
// importing the type by name). Checked against `commentStrippedSource`
// (`src/test/cssView.ts`'s own house utility), not the raw text — this
// file's own two PROSE mentions of `ConnectedPhase` (both inside `/** */`
// doc comments) would otherwise flag `surfaceModel.ts` as an offender for
// describing the very laundering this module exists to prevent.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { commentStrippedSource } from "../test/cssView";

/** `src/`, resolved off this file's own path the same plain-string-surgery
 *  way `ConnectedSurface.test.tsx`'s `indexCssPath()` resolves `index.css`
 *  — `new URL(..., import.meta.url)` resolves against `http://localhost:3000/`
 *  in this project's jsdom environment, not the `file://` base, so a real
 *  path needs building by hand. */
function srcRoot(): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/\/monitor\/connectedPhaseReaders\.test\.ts$/, "");
}

const ROOT = srcRoot();

/** Every non-test `.ts`/`.tsx` file under `src/`, as paths relative to
 *  `src/` itself (posix separators) — the same shape the allowlist below
 *  is keyed by. */
function productionSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(ROOT);
  return out.map((f) => relative(ROOT, f).split("\\").join("/"));
}

/** The two OWNERS (define/consume the union to compute the axes) plus the
 *  two EXISTING readers task 5's own brief names as migrating debt. Nothing
 *  else may join this set — that is the whole pin. */
const ALLOWED_READERS = new Set([
  "monitor/useMonitorSession.ts",
  "monitor/connectedAxes.ts",
  "workout/ConnectedSurface.tsx",
  "workout/ConnectedInterstitial.tsx",
]);

const TYPE_TOKEN = /\bConnectedPhase\b/;
// `session.phase`, not bare `phase` (measured false positive: `transports/
// fake.ts` compares its OWN local `phase` variable — an internal simulator
// state with values like `"clearing"` that are not even `ConnectedPhase`
// members — against string literals with this exact shape). Requiring the
// `session.` receiver is what actually distinguishes "reads a
// `MonitorSession`'s phase" from "has a local variable that happens to be
// named `phase`", and it is what `ConnectedSurface.tsx`/
// `ConnectedInterstitial.tsx`'s own real reads look like, verified by grep
// this session.
const STRUCTURAL_READ = /session\.phase\s*===\s*"/;

function readsConnectedPhase(strippedSource: string): boolean {
  return (
    TYPE_TOKEN.test(strippedSource) || STRUCTURAL_READ.test(strippedSource)
  );
}

/** THE SECOND SCAN (Phase MD PR 2). `useMonitorSession` publishes
 *  `session.axes`/`session.linkLoss` now, so there is exactly ONE derivation
 *  site; before this PR five screens each rebuilt the input and called
 *  `deriveAxes`/`deriveLinkLoss` themselves. These two files are the only
 *  ones allowed to match: the hook, which CALLS them, and the module, which
 *  matches on its own `export function derive…(` DEFINITIONS — the detector
 *  cannot tell a definition from a call, and does not need to. */
const AXES_DERIVERS = new Set([
  "monitor/useMonitorSession.ts",
  "monitor/connectedAxes.ts",
]);

/** ALL SIX derivers `connectedAxes.ts` exports over `AxesInput` —
 *  `deriveLink`, `deriveProgram`, `deriveSession`, `deriveActivity`,
 *  `deriveAxes`, `deriveLinkLoss` — not just the composed pair. The four
 *  sub-derivations are exported so each `never` guard is independently
 *  reachable from a test (that module's own comment says why), which also
 *  means a screen could call one directly and walk straight past a narrower
 *  pattern. Measured at `3fc49767`: outside the two owners and the five call
 *  sites this PR removes, the widened pattern's only hits are two PROSE
 *  mentions, both stripped by `commentStrippedSource`. */
const DERIVE_CALL = /\bderive(?:Axes|Link(?:Loss)?|Program|Session|Activity)\(/;

/** ONE NAMED FILE, never a directory prefix. `productionSourceFiles()`
 *  returns everything under `src/test/` because those files do not end in
 *  `.test.ts`, and that directory holds REAL harnesses a screen could import
 *  (`statusSubscriptions.ts`, `renderedCopy.ts`, `cssView.ts`) — exempting
 *  the whole prefix would let a second deriver appear there unseen.
 *  `test/sessionAxes.ts` derives on purpose: it is how every hand-built
 *  `MonitorSession` fixture gets axes that agree with its own phase. Scoped
 *  here rather than inside `productionSourceFiles()` so the ConnectedPhase
 *  sweep above keeps the exact reach it had before this PR. */
const AXES_SCAFFOLD = new Set(["test/sessionAxes.ts"]);

describe("the ConnectedPhase enum-reader pin (connected-axes 2a, spec exit criterion 8)", () => {
  it("no file outside the allowlist reads ConnectedPhase — ask connectedAxes.ts's axes instead", () => {
    const offenders: string[] = [];
    for (const rel of productionSourceFiles()) {
      if (ALLOWED_READERS.has(rel)) continue;
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      if (readsConnectedPhase(stripped)) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  // Proof the sweep isn't vacuously green: every allowlisted file really
  // does trip the pattern today (the self-mutation discipline — "a test
  // that can't fail proves nothing" — applied to a grep instead of a code
  // path) — if one stopped, its entry above would be silent dead weight
  // nobody would notice going stale.
  it("every allowlisted file actually reads phase — the allowlist has no dead entries", () => {
    for (const rel of ALLOWED_READERS) {
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      expect([rel, readsConnectedPhase(stripped)]).toStrictEqual([rel, true]);
    }
  });

  // The pattern itself, pinned directly against the exact defect it exists
  // to stop: a THIRD file that adds `if (session.phase === "live")` without
  // going through `connectedAxes.ts` must fail the sweep above. Exercised
  // here against a synthetic source string rather than a real file, so this
  // test needs no throwaway fixture on disk.
  it("the detector actually fires on a new structural reader, not just on the two known ones", () => {
    const newOffender = `
      function draw(session) {
        if (session.phase === "live") return "B";
        return "A";
      }
    `;
    expect(readsConnectedPhase(commentStrippedSource(newOffender))).toBe(true);
  });

  it("nothing outside the hook, connectedAxes.ts and the fixture helper derives the axes", () => {
    const offenders: string[] = [];
    for (const rel of productionSourceFiles()) {
      if (AXES_DERIVERS.has(rel) || AXES_SCAFFOLD.has(rel)) continue;
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      if (DERIVE_CALL.test(stripped)) offenders.push(rel);
    }
    expect(offenders).toStrictEqual([]);
  });

  it("every deriver and the one scaffold entry actually derive — no dead entries", () => {
    // The scaffold entry is iterated TOO: a skip that stops being needed
    // must fail red, or it is exactly the silent dead weight the sweep above
    // exists to prevent.
    for (const rel of [...AXES_DERIVERS, ...AXES_SCAFFOLD]) {
      const stripped = commentStrippedSource(
        readFileSync(join(ROOT, rel), "utf-8"),
      );
      expect([rel, DERIVE_CALL.test(stripped)]).toStrictEqual([rel, true]);
    }
  });

  it("the derive detector fires on a new caller, not just on the owners", () => {
    const newOffender = `
      function draw(session) {
        const axes = deriveAxes({ phase: session.phase });
        return axes.link;
      }
    `;
    expect(DERIVE_CALL.test(commentStrippedSource(newOffender))).toBe(true);
  });

  it("the derive detector does not fire on prose naming deriveAxes in a leading-line comment", () => {
    // `commentStrippedSource` strips whole-line `//` and `/* */` ONLY — a
    // TRAILING `// ...` on a code line survives. Every replacement pointer
    // comment this PR writes is therefore a LEADING-line comment, and this
    // case is the shape that proves the stripper handles it.
    const prose = `
      // The axes come from the hook now — see deriveAxes(input) there.
      /** deriveLinkLoss(input) lives beside it. */
      export const x = 1;
    `;
    expect(DERIVE_CALL.test(commentStrippedSource(prose))).toBe(false);
  });

  it("the detector does not fire on ordinary prose mentioning the name in a comment", () => {
    const prose = `
      /** This module no longer narrows a ConnectedPhase itself; the
       *  caller now computes status from connectedAxes.ts's four axes. */
      export const x = 1;
    `;
    expect(readsConnectedPhase(commentStrippedSource(prose))).toBe(false);
  });
});
