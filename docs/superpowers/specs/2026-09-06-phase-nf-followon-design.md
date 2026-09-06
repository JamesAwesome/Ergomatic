# Phase NF follow-on — what the erg walk handed back (design spec, 2026-09-06)

## What and why

The Scan NFC walk on 2026-09-06 (`docs/monitor/sessions/phase-nf-product-walk/RESULT.md`)
passed, and handed back four things a rower would meet on the next row: Scan
NFC is missing from Just Row (James noticed at the erg); after an NFC read the
app can sit up to 20 s on a screen that says "Choosing your monitor" with no
button and no way out; the not-advertising card tells the rower to open
Connect Device, which the PM5 does not need (James: it advertises whenever
awake and not already connected, on any screen, and an NFC tap wakes it);
and a tag lost mid-read shows a developer string on the iOS sheet. This spec
fixes all four in ONE PR (James's ruling 2026-09-06: "merge this then do a
new pr"). A fifth walk observation — Connect once started with no list — is
explained by existing behaviour and retired below.

- **Rower impact:** Just Row gains the same fern **Scan NFC** above **Connect**;
  the wait after an NFC read names what it is doing and can be cancelled; the
  two error lines say what the rower can actually do.
- **Not in scope:** no change to the targeted-scan mechanism, the collision
  window, the parser, the patch's session identity, or stored shapes.
- **Gate 0:** `docs/design/handoffs/2026-09-06-phase-nf-followon/gate0.html`
  — Just Row in both orientations, the targeted-scan screen in both, the card
  copy (A recommended, B offered, both costs marked untested), the sheet text.
  Every pairing computed (the table in the artifact); every token existing.

## Does the underlying system have the concept? (asked per item)

1. **Just Row + NFC.** The app has the concept already: `ConnectAction` is the
   shared connection-entry owner and takes `nfcCapability`; Just Row passes
   `"unsupported"` by implementation choice (`JustRow.tsx`), and the Phase NF
   spec never ruled on Just Row. Just Row's connect is
   `session.connect({kind:"picker", attemptId})` on its own hook (no
   interstitial); it already renders a connecting card WITH Cancel and a
   failure card with Try again.
2. **A cancellable targeted scan.** The session has it: `cancel()` reaches
   `teardown()`, which aborts a live targeted scan synchronously (Phase NF
   vetted ground; the walk's leg 3 exercised Cancel from READY). Only the
   SCREEN lacks the button — `ConnectedInterstitial`'s `picking` branch was
   drawn as a backdrop for the picker sheet.
3. **PM5 advertising.** SECONDARY (James, 2026-09-06, his own observation
   across many sessions; the walk confirmed the first half): advertises
   whenever awake and not connected, on any screen; NFC wakes it. The Phase NF
   spec's "advertises while on Connect Device" is superseded (its walk section
   records this). The remaining not-advertising states are "asleep longer than
   the 10 s scan" and "held by another central".
4. **A sheet error message.** PRIMARY, `NFCReaderSession.h`
   (`invalidateSessionWithErrorMessage:`): "The specified error message and an
   error symbol will be displayed momentarily on the action sheet before it is
   automatically dismissed." So the text IS rower-facing copy, rendered by
   iOS. The patch passes
   `"Failed to read NDEF message: \(readError.localizedDescription)"` and a
   `cause: tagFailure`; the walk's gen-3 session shows code 102 on the read (a transceive-domain
   code in `NFCError.h`, where 100 is `TagConnectionLost`; the exact constant
   is not load-bearing here), then the JS received
   `{reason:"invalidated", cause:"tagFailure"}` and rendered
   `NFC scan stopped. Try again.`.

## Research pass (nothing else is owned by the OS here)

- `docs/superpowers/research/` carries the PM5 BLE and NFC research already;
  nothing new is owned by the platform in this spec beyond item 4's header
  line. Nothing found that contradicts the four items.

## Design (what changes, rower-visible first)

1. **Just Row: Scan NFC above Connect** (Gate 0 §1). The NFC attempt
   coordination that `WorkoutDetail.handleNfcProceed` owns (lifecycle abort,
   `runNfcAttempt`, the accepted paint, the staged-receipt discard) becomes a
   shared hook `useNfcEntry` in `src/monitor/nfc/`, consumed by both screens
   with one difference: detail hands the request to the interstitial; Just Row
   calls `session.connect(request, trace)` itself, exactly as its manual path
   does. Just Row's `retryConnect` reuses the LAST request (targeted or
   picker) rather than minting a picker request, so Try again after a targeted
   failure repeats the target (the same rule the interstitial follows).
2. **The targeted-scan screen** (Gate 0 §2): when `request.kind ===
   "advertised-name"`, the interstitial's `picking` branch renders
   `CONNECT` / `Looking for <exact name>` / `Keep the PM5 on and close by.` and
   a `Cancel` (`.button-l2`, the house card action) wired to the existing
   `handleCancel`. The picker-kind branch is unchanged.
3. **Not-advertising copy** (Gate 0 §3): `TARGETED_FAILURE_COPY`'s
   `TargetMonitorNotAdvertisingError` detail becomes the approved line
   (James, 2026-09-06, option A with a LINE BREAK between the sentences:
   `Couldn't reach <name>.` / `Check nothing else is connected to it, then try
   again.` — rendered as two lines on the card, so `detail` carries a newline
   and the card renders it as a break; the name is the request's exact name,
   so the copy is built, not a literal — the tests pin the shape with an
   independent name). Try again
   stays the targeted retry.
4. **Tag-read failure copy** (Gate 0 §4): the patch's rejection message
   becomes `Couldn't scan the monitor tag. Try again.` (James's wording,
   2026-09-06; Swift; the patch's own
   XCTest pins the string; re-run the 31 native tests); `runNfcAttempt`'s
   `endingCopy` maps `NfcInvalidatedError` with cause `tagFailure` to the same
   line, and every other invalidation keeps `NFC scan stopped. Try again.`.
5. **Retired:** "Connect began connecting with no list" — `capacitorBle.ts`'s
   already-held-device path (RC-18 REACHABLE, "offered the already-held
   device; no picker") fires when the plugin still reports the PM5 as
   connected after the previous Cancel; the walk console shows the PM5 in a
   `getConnectedDevices` reply after a cancel. Existing, documented
   behaviour; leg 5 showed the list. No change.

## State and lifetime

No new session-scoped state. Two rows the antagonist's delta pass added
(2026-09-06, F6 and F5):

- **Just Row's handoff has NO mount lease.** On detail the staged-retire
  receipt has two owners after a handoff: the interstitial's mount lease
  (discard on a true unmount) and the session's `armed` keyed take. On Just
  Row `onTarget` hands the request to the screen's own session, so after
  the handoff the receipt's owners are the `armed` keyed take and
  `cancel()`'s discard only; `teardown()` (a Just Row unmount mid-attempt)
  leaves it staged. Harm ceiling: an in-memory receipt keyed to an attempt
  ID no later attempt can present, dead at document teardown — the keyed
  take (Phase NF F7) is what makes it harmless. Recorded, not fixed.
- **Cancel during the targeted scan and the cleanup poison.** A foreground
  Cancel aborts the scan; `settle()` then awaits `stopLEScan()` under the
  same 10 s bound that, on expiry, arms the never-cleared poison. The
  argument that a foreground Cancel cannot reach it: at abort time the app
  is not suspended and `stopLEScan` is the next operation on the plugin's
  serial queue, so it resolves well inside the bound; a Cancel during the
  PREAMBLE (before `requestLEScan`) has `scanning === false` and schedules
  no stop at all. Pinned by one transport assertion: after an abort with
  the stop resolving, the next targeted scan reaches the radio (no
  `ScanCleanupFailedError`). The background-abort residual in the ROADMAP
  stands unchanged.
- **Just Row's connecting card is unchanged on the NFC route** (antagonist
  F7, decided deliberately): it reads `Connecting to monitor` / `Wake the
  monitor if its screen is dark.` with Cancel, so the targeted scan is
  cancellable there already but is not NAMED as it is on detail. Naming it
  is a copy change on a screen Gate 0 did not draw — a ROADMAP row, not
  this PR.
- **Just Row's inline error line** (antagonist F4): the same `.baseline-error`
  line workout detail renders, in the same position (between the hardware
  pair and the next action); accent on page is recorded in-repo at 5.35:1
  (`index.css`). A named Gate 0 delta: the element exists on detail's
  approved screen and is reused, not invented. `useNfcEntry` owns per-attempt refs (abort
controller, trace, busy/accepted flags) with the lifetimes WorkoutDetail's
inline block has today — minted at the press, cleared in the attempt's
`finally`, discarded on unmount; the staged-retire receipt is keyed by attempt
ID as before. Just Row's `lastAttemptRef` becomes `lastRequestRef`
(`MonitorDiscoveryRequest | null`): minted at the press, replaced by the next
press, read by Try again, never persisted.

## Gates

- **Gate 0** (this artifact) — James approves the rendered thing before any
  task starts.
- **Antagonist: DELTA pass**, said aloud: two new mechanisms against NF's
  vetted ground — the shared `useNfcEntry` hook (a second caller of the NFC
  attempt path; RF18's "before adding a caller to a shared hook" applies) and
  Cancel during a targeted scan on the interstitial (the abort path exists;
  the SCREEN path to it is new). Copy changes need no pass.
- **PM:** none at this spec (mid-phase; James set the scope at the erg). The
  phase-close PM gate runs at Phase NF's close, after this PR.
- **Triad:** none (no number meaning, no stored shape, no auth). Not fast
  path: two product files plus the Swift patch.
- **Walk:** none owed. Every change is desk-provable: the Just Row route gets
  a routed proof like `WorkoutDetail.nfc.test.tsx` (click → scripted reader →
  fake radio → READY); the targeted-scan screen and copy are e2e- and
  capture-gated; the sheet string is pinned by the patch's XCTest and cannot
  be seen at the desk (iOS renders it), which the PR body says.

## Countable exits

1. Just Row shows Scan NFC above Connect when native reports support, and
   nothing when it does not; a scan reaches READY with no picker (routed
   proof) and Try again after a targeted failure repeats the target.
2. After an NFC read on workout detail the screen names the target and offers
   Cancel; Cancel returns to detail with both buttons, and the scan is aborted
   (hook-level assertion).
3. The not-advertising card renders the approved line with the request's
   exact name; the old line appears nowhere (grep both directions).
4. A `tagFailure` invalidation renders the approved line inline; the patch's
   sheet message is the approved line (XCTest); all 31 native tests green.
5. Gate 0 matches the shipped UI (captures in both orientations for Just Row
   and the targeted-scan screen); DEVIATIONS reconciled; the ROADMAP NF block
   ticks its five follow-on rows.
