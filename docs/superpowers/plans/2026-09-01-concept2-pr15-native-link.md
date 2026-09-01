# Wave E PR1.5 — Native Link Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The native half of the Concept2 link hop: open the authorize URL in the system browser, and give PR2 a foreground re-fetch seam so the app learns the link outcome when the rower returns. Branch A only — no URL scheme, no `appUrlOpen` handler. Plus the evidence package for the account-injection ruling James owes at this PR's design gate.

**Architecture:** Two small adapter-layer additions following the house native-first idiom (`isNative()` picks the arm; the native arm reaches its Capacitor plugin only through a dynamic `import()`). **Narrowed, fix round 2 (P2ii — the original wording overclaimed):** while nothing in `src/` consumes these modules today, `@capacitor/browser` is absent from `dist/client` because the modules are UNCONSUMED, not because the dynamic import folds it out on its own; once a consumer exists, that `import()` emits its own lazy chunk that IS present in `dist/client`, simply never LOADED on web since `isNative()` is `false` there (`adapters/appLifecycle.ts` / `keepAwake.ts` are the precedents for the dispatch shape, not for a bundle-absence claim). Everything ships dark: nothing renders until PR2 (plus fix round 2's own dev-only, flag-gated probe card — see below), and the server refuses while `C2_LINK_ENABLED` is off.

**Tech Stack:** `@capacitor/browser@8.0.4` (VERIFIED against the registry 2026-09-01: current version 8.0.4, peer `@capacitor/core >=8.0.0`, ours is `^8.5.0`). React 19, Vitest, existing adapter test shapes.

**Spec:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md` §Architecture 2-3 + §PR decomposition (PR1.5). **Antagonist pass: full pass 2026-09-01 at `303987ab`, verdict REVISE, all findings folded this round (fix round 3).** This PR touches AUTH (the account-injection question the design-gate package is about), which triggers CLAUDE.md's standing TRIAD override regardless of phase position — no skip was ever available once fix round 2 existed. Findings: the subscription-lifetime break in `useReturnToApp` (renamed from `useForegroundRefetch`), an over-promoted "satisfied for free" comment on the probe card, four gaps/errors in the design-gate package (§1's uncited bounds, the missing blast-radius statement, a backwards cost line on option (b), a missing cross-document collision on option (c), and three missing option classes), and three inaccuracies in the walk card (a wrong expected counter value, a mislabeled dist-grep step, and a wrong claim about `log-dev.concept2.com`'s response). Full detail:
`docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` §5 and the fix round 3 commits' own messages.

## Plan corrections to the spec, stated

1. **Foreground signal is `pause`/`resume` via `adapters/appLifecycle.ts`, NOT `appStateChange`.** The spec's Branch A text says "native `appStateChange` via `@capacitor/app`" — superseded by the repo's own Phase LM finding (`adapters/appLifecycle.ts:27-31`): `appStateChange` is iOS's ACTIVE/INACTIVE signal and fires on a Control Centre swipe; it made the lost-link banner fire nine times over a live link. The existing adapter already translates `pause`/`resume` (native) and Page Visibility (web) into one `"background"|"foreground"` vocabulary; PR1.5 composes it rather than binding a second, known-wrong event. Task 3 folds this correction into the spec text.
2. **The web foreground arm uses `registerWebAppLifecycleListener` (the exported raw mapping), not `registerAppLifecycleListener`** — the latter's web arm is a DELIBERATE no-op scoped to the monitor consumer (Minor 9, the file's own header). A link-status re-fetch on tab-return is exactly the Page Visibility use case and harmless; the composition lives in the new hook, keeping Minor 9's monitor scoping untouched.

## Global Constraints

- Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr15` (branch `wave-e-pr15-native-link`, base 27fe6b4a = post-PR1 main). `git rev-parse --show-toplevel` before every commit; absolute paths for shell writes (RF20).
- Platform conditionals ONLY in `src/platform.ts` / `src/api.ts` / `src/native/` / `src/adapters/` (lint-enforced via no-restricted-imports).
- TDD failing-first; mutation probe per new assertion (committed first, RF21/RF22, failure text recorded).
- `src/native/**` is coverage-exempt (`vitest.config.ts`) and our instruments are blind there (RF19) — the native arms get the device check, not unit theater.
- **RF1: this PR touches `app/src/` → `pnpm e2e` before done.** No layout change → no screenshots.
- pnpm/ESM; no new lint suppressions; comment style matches the adapter files' constraint-citing idiom.
- `npx cap sync ios` after adding the dependency; commit the Podfile/project changes it makes, but NEVER version stamps (ios-activation-facts memory).

---

### Task 1: `@capacitor/browser` + the external-browser adapter

**Files:**
- Modify: `app/package.json` (+`@capacitor/browser`: `^8.0.4`), lockfile, `app/ios/App/Podfile` + whatever `npx cap sync ios` regenerates (inspect the diff; no version stamps)
- Create: `app/src/adapters/externalBrowser.ts`, `app/src/native/externalBrowser.ts`
- Test: `app/src/adapters/externalBrowser.test.ts`

**Interfaces:**
- Produces: `openExternalUrl(url: string): void | Promise<void>` — web: `window.location.assign(url)` (spec: "plain navigation on web" — the callback page's "return to the app" is the browser Back/close on web); native: dynamic `import("../native/externalBrowser")` → `Browser.open({ url })` (SFSafariViewController per the vendor doc, PRIMARY: "On iOS, this uses SFSafariViewController.").

- [ ] **Step 1: Failing tests** (web arm, jsdom): `openExternalUrl` assigns the URL (spy on `window.location.assign` via the repo's established location-mock shape — check how existing tests mock navigation; if none do, use `vi.spyOn` on a wrapped indirection the adapter owns); on a fake-native platform (`vi.mock("../platform")` → `isNative: true`), the call reaches the native module's export (mock the dynamic import target — `adapters/monitorTransport.test.ts` and `appLifecycle`'s tests are the precedent for testing the branch without a native runtime).
- [ ] **Step 2:** Run → fail. **Step 3:** Implement both arms + `src/native/externalBrowser.ts` (`import { Browser } from "@capacitor/browser"; export async function openNativeExternalUrl(url: string) { await Browser.open({ url }); }` with the house doc comment citing the vendor line and the dynamic-import idiom).
- [ ] **Step 4:** `pnpm add @capacitor/browser@^8.0.4` (in `app/`), `npx cap sync ios`, inspect + stage the ios diff. Run tests → pass. `pnpm lint && pnpm typecheck`.
- [ ] **Step 5:** Mutation probe: swap `assign` for a no-op → web test red (record text). **Step 6: Commit.**

### Task 2: the foreground re-fetch seam

**Files:**
- Create: `app/src/api/useForegroundRefetch.ts` (or beside the api hooks — match where `useRecentLogs` lives)
- Test: `app/src/api/useForegroundRefetch.test.tsx` (client project, jsdom)

**Interfaces:**
- Consumes: `registerAppLifecycleListener` (native arm) and `registerWebAppLifecycleListener` (web arm) from `adapters/appLifecycle.ts`.
- Produces: `useForegroundRefetch(cb: () => void): void` — invokes `cb` on every `"foreground"` transition; on native rides the adapter's native arm; on web rides the raw web mapping (plan correction 2); unsubscribes on unmount; never fires on `"background"`. PR2's Concept2 card calls this with its `GET /api/concept2/link` re-fetch.

- [ ] **Step 1: Failing tests:** dispatching `visibilitychange` with `visibilityState: "visible"` fires `cb` once; `"hidden"` never fires it; unmount unsubscribes (a later event fires nothing); a fake-native platform reaches the adapter's native path (mock `registerAppLifecycleListener`, assert subscription + foreground filtering + the returned-Promise unsubscribe is awaited and called on unmount — the async-unsubscribe shape is the adapter's own documented contract).
- [ ] **Step 2-4:** run/fail, implement, pass. Mutation probes: drop the event filter (fire on background too) → filter test red; drop the unsubscribe → unmount test red. Record texts.
- [ ] **Step 5: Commit.**

### Task 3: spec correction + the design-gate evidence package

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md` (§Architecture 3 Branch A: `appStateChange` → the corrected lifecycle wording, replace in place, cite Phase LM)
- Create: `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` — the account-injection ruling package for James (this PR's design gate; ROADMAP's register row binds the ruling here)

**The gate package contents (decision doc, assembled from evidence — no invention):**
1. The residual, restated: the nonce binds the exchange to the MINTING user; an attacker who mints and delivers the URL links the victim's C2 account under the attacker's Ergomatic user. Bounded today by `ALLOWED_EMAILS` and the dark flag.
2. **The credential fact, code-derived (cite the files):** the consent browser can never carry an Ergomatic session on native — auth is a Keychain bearer attached by `api.ts` fetches (`src/native/session.ts`); no cookie exists in the app; SFSafariViewController has no access to either. So a cookie-binding fix has NOTHING to bind on native — the classic web mitigation is structurally unavailable. (Tag: PRIMARY, our own code. The Apple isolation page was not fetchable; nothing rests on it.)
3. **The options, with costs:** (a) ACCEPT the residual while `ALLOWED_EMAILS` bounds the population (household), revisit at any public opening — zero code; (b) DETECTION: the callback's "Linked" page and PR2's linked card both display the C2 account identity (c2UserId is already in `GET /link` since PR1), so a victim SEES a foreign link and unlinks — copy-level cost; (c) PREVENTION: a post-consent in-app confirm (link lands `pending`, the app's authenticated session confirms it on foreground) — a stored-shape change (pending state on `concept2_links`) and a second tap for every legitimate link.
4. **The device-check card** for the first PR2-era build (the plumbing has no surface until then): verify Browser.open presents, the callback page renders, the foreground re-fetch fires on return, and record what the consent browser's cookie state offered (fresh login vs Safari-shared session) — UX evidence, not security-load-bearing.
5. STOP after presenting. The gate is James's ruling, not the presentation.

- [ ] **Step 1:** Write both docs. **Step 2:** `pnpm format:check` untouched-by-prettier rule for root docs does not apply (these live under docs/superpowers — still never Prettier root markdown). **Step 3: Commit.**

### Task 4: Gates + PR

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (all projects; Docker for integration), per-file coverage on the touched src files (RF2), `pnpm build && pnpm dist:grep` (**superseded, fix round 2: now EIGHT needles** — `dist-grep.sh`'s own eighth, `"C2 link probe (dev harness)"`, already carries its own build-with/without-the-flag red proof, RF12, run and recorded in fix round 2's own report section rather than a temporary static-import plant).
- [ ] **`pnpm e2e`** (RF1 — src touched). Stack teardown afterwards is the phase teardown's job (`docker compose -p <name> down -v`).
- [ ] PR body: house shape, ~120 words, Record block carries the mutation ledger, the antagonist verdict (fix round 2, P2i: full TRIAD pass, not a skip — AUTH is in scope), the plan corrections, and the gate package pointer. James reviews; the design-gate ruling is requested IN the PR presentation. No merge without his word.
