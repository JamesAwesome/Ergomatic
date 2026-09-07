# Phase NF — Scan NFC to connect and program a PM5 (archived at close, 2026-09-06)

A RECORD, not a backlog. The six live items this phase left behind were lifted
into ROADMAP's open-item register before archiving; the ROADMAP ledger row is
the live record.

## Close summary (PM phase-close gate, 2026-09-06)

**Status:** CLOSED 2026-09-06 — #316, #324 and #325 merged, released as
v0.40.0. Trigger fired and hardened design approved 2026-09-03; Gate -1
complete 2026-09-06; scheduled by James the same day AHEAD of Wave A ("Do it
now"). Spec `docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md`;
follow-on spec `docs/superpowers/specs/2026-09-06-phase-nf-followon-design.md`.
Not TRIAD (no number's meaning, no stored shape, no auth) but walked on
hardware because it is a device interaction. **L.**

**Goal:** hold the iPhone to the PM5's own NFC tag and the app connects to
exactly that erg and programs the workout — no Bluetooth picker, no device
list, no second confirmation.

**What shipped.** A 56 px filled muted-fern **Scan NFC** above the existing
blue **Connect**, on every workout detail and on Just Row, present only when
native iOS reports NFC support. A valid PM5 record is parsed strictly, its
ASCII name matched against the live `ScanResult.localName` — CoreBluetooth's
opaque peripheral id makes the tag's MAC unusable, so exact advertised-name
equality is the only bridge — and the existing connect → program → `armed`
path is reused unchanged. During the scan the screen reads
`Looking for <exact name>` with a **Cancel**. Unsupported records say
`Unsupported NFC tag`; a target the scan cannot find says
`Couldn't reach <name>.` / `Check nothing else is connected to it, then try
again.`; a tag lost mid-read says `Couldn't scan the monitor tag. Try again.`
in both the iOS sheet and inline. NFC is a lookup shortcut, never pairing, and
never falls back to a general picker.

**Gate -1, and why it took eight runsheets.** The design assumed the tag is
always there. It is not a sticker: the PM5 emulates a Type 2 tag on its own
controller (`docs/monitor/nfc/README.md`), and on 2026-09-05 two consecutive
60 s NDEF windows found nothing minutes after a good read on the same erg.
Cause never identified, five alternatives live
(`docs/superpowers/research/2026-09-05-pm5-nfc-availability.md`); the v4
control-tag bracket ran clean and did not reproduce it. The product answer was
to make "no tag found" an ordinary outcome rather than an error class, to
attribute no cause in copy or logs, and to condition no rule on the PM5's
power cycle. Recovery cases 2-4 were dropped as ship gates (antagonist
verdict, James's call): probe-only constructs whose harm ceiling is a
recoverable return to workout detail.

**The reader-ending seam (James, option A, 2026-09-06).** Writing the injected
test showed the plugin computed its ending reason from the Core NFC code
alone, so the controller's own multi-tag rejection reached JS as
`userCancelled` — indistinguishable from a Cancel tap. The patched controller
now publishes `cause: multipleTags | tagFailure` on endings it forced, and JS
never infers a rejection from a code that also means Cancel. No copy changed,
so no Gate 0.

**Three PRs, by James's own ruling.** #316 — the atomic product PR the spec
specified (dependencies and the checked-in patch, the iOS capability and
entitlement, the NFC adapter and strict parser, the fail-closed
`TargetedScanTransport.scanTarget`, the native attempt-identity/single-tag/
drain controller, picker-free exact-`localName` scan, fake/replay/web parity,
the shared connection-entry guard, Scan NFC on workout detail, the hardware
walk). #324 — the follow-on the walk generated, on James's ruling "merge this
then do a new pr": Scan NFC on Just Row via a shared `useNfcEntry` hook, the
cancellable named-target scan screen, the rewritten not-advertising line and
the tag-read-failure line. #325 — fast path, James reviewing: Just Row's own
connecting card names the PM5 on the NFC route.

**The walk (2026-09-06, James's iPhone 17 Pro + his PM5,
`docs/monitor/sessions/phase-nf-product-walk/RESULT.md`).** Five legs, seven
reader sessions, ~16-17 min against a 15 min cap. **Legs 1, 3, 4, 5 PASS; leg
2 INCONCLUSIVE with its premise falsified.** Leg 1 is the phase in one line:
one tap, the exact name, no picker, READY, one pull, saved. Leg 4 read code
202 on the console — iOS ends a backgrounded reader, exactly as
`NFCNDEFReaderSession.h` documents — and the app's own `pause` abort still won
the race to a quiet return, so both halves of the design behaved.

**The fact the walk overturned.** James, at the erg: **the PM5 advertises
whenever it is awake and not already connected, on ANY screen — Connect Device
is not a precondition — and an NFC tap wakes a sleeping PM5.** Leg 2's premise
was therefore never stageable, and the approved copy `Open Connect Device on
this PM5, then try again.` asked the rower to do something they do not need to
do. Replaced in #324 after a fresh Gate 0. Nothing in the targeting mechanism
depended on the premise.

**Gates.** Gate -1 complete (v8 normal trace, 1 m 46 s). `/harden` lens 1 and
lens 2 on the product plan (7 + 18 findings). Whole-branch review returned NOT
READY with six blocking items, all fixed in the same round — including a RED
`domain/**` 100 % coverage gate and seven mutation rows reading "not run"
behind an "all bite" header. Seven PM walk-readiness gates: v1-v4 and v7 NOT
READY, v5 and v8 READY — the fourth found leg 2's unstated "stops advertising"
premise, which is the premise the walk then falsified. Antagonist: anchor at
open, delta on the follow-on (8 findings), and a timed-protocol lens James
asked for by name that built the sixteen-row timer table five PM gates had
passed over. Gate 0 approved three times (the original, the follow-on, the
Just Row card). Self-mutation: 42 rows round 2 all BIT, 15 follow-on rows all
BIT, 10 Swift mutations, 31 native tests green.

**Exit (PM close 2026-09-06):** eight of eleven countable exits met, one
met-with-substitutes, **exit 5's not-advertising half NOT met** (premise
falsified; both the old and the replacement copy are desk-proven only), and
**exit 9's entitlement-inspection clause open** until the distribution build's
Scan NFC is exercised once — our capability probe reads NFC hardware
(`readingAvailable`), never code signing, so no gate we own can distinguish a
correctly signed build from an unsigned one. Exit 7 is proven on hardware for
NFC (seven Core NFC endings, an oracle we do not own) and at the desk only for
BLE. Exit 10's "one atomic product PR" shipped as three merges by James's
ruling. **v0.40.0 recommended and released.**

**Recorded, not fixed (harm ceiling nil).** Just Row's handoff has no mount
lease: after `onTarget` hands the request to the screen's own session, the
staged-retire receipt's only owners are the `armed` keyed take and `cancel()`'s
discard, so a Just Row unmount mid-attempt leaves it staged. It is an in-memory
receipt keyed to an attempt ID no later attempt can present, dead at document
teardown; the keyed take is what makes it harmless.

## The ROADMAP block as it stood at close (verbatim)

- **Phase NF — Scan NFC to connect and program a PM5. TRIGGER FIRED; HARDENED
  DESIGN APPROVED 2026-09-03; GATE -1 COMPLETE 2026-09-06; PRODUCT
  IMPLEMENTATION IN FLIGHT (scheduled by James 2026-09-06, ahead of Wave
  A); PR awaiting James's word to push.** Gate -1 history: two targeted
  NFC/BLE connections succeeded (v8 normal trace, 2026-09-04); recovery
  cases 2-4 dropped as ship gates. Further walks require PM
  approval of the exact prepared runsheet before asking James to participate.
  Evidence and desk-only close-out:
  [`SESSION-PAUSED.md`](docs/monitor/sessions/phase-nf-gate-minus-one/SESSION-PAUSED.md).
  Approved desk-only trace/capture follow-up and verification limits:
  [`DIAGNOSTIC-CAPTURE.md`](docs/monitor/sessions/phase-nf-gate-minus-one/DIAGNOSTIC-CAPTURE.md).
  The retired v3 approval does not authorize its hardened replacement.
  `NF-NORMAL-TRACE-v5`
  received PM PASS but aborted before installation when its controller timer
  expired across the operator turn boundary; it authorizes no retry. See
  [`NORMAL-TRACE-V5-ABORT.md`](docs/monitor/sessions/phase-nf-gate-minus-one/NORMAL-TRACE-V5-ABORT.md).
  The resumed preparation installed and verified the diagnostic build;
  [`NF-NORMAL-TRACE-v7`](docs/monitor/sessions/phase-nf-gate-minus-one/NORMAL-TRACE-V7-RUNSHEET.md)
  separates setup from scan consent and removes timed chat acknowledgements.
  James confirmed the enabled probe; one separately authorized v7 sample
  activated the reader and reached BLE scanning, but captured no matching PM5
  name or final receipt. Cleanup verified; no retry authorized. See
  [`NORMAL-TRACE-V7-RESULT.md`](docs/monitor/sessions/phase-nf-gate-minus-one/NORMAL-TRACE-V7-RESULT.md) and
  [`OPERATOR-WORKFLOW-V6.md`](docs/monitor/sessions/phase-nf-gate-minus-one/OPERATOR-WORKFLOW-V6.md).
  [`NF-NORMAL-TRACE-v8`](docs/monitor/sessions/phase-nf-gate-minus-one/NORMAL-TRACE-V8-RUNSHEET.md)
  passed its one separately authorized normal sample: NFC RF-active trace,
  exact-name targeted BLE connect/disconnect, both automatic exports and verified
  cleanup, in 1 minute 46 seconds. See
  [`NORMAL-TRACE-V8-RESULT.md`](docs/monitor/sessions/phase-nf-gate-minus-one/NORMAL-TRACE-V8-RESULT.md).
  Its final-export finish rule corrects v7's premature host cleanup. **Since
  v8 (2026-09-05):** recovery v1 aborted on a Wi-Fi CoreDevice tunnel drop;
  recovery v2 ran wired and stopped on a host-helper display guard that was a
  FALSE NEGATIVE (fixed:
  [`RECOVERY-GUARD-FIX.md`](docs/monitor/sessions/phase-nf-gate-minus-one/RECOVERY-GUARD-FIX.md));
  recovery v3 **closed case 1 (stop-during-connect)** and stopped at case 2
  when two 60 s NDEF windows found no PM5 tag
  ([`RECOVERY-WALK-V3-RESULT.md`](docs/monitor/sessions/phase-nf-gate-minus-one/RECOVERY-WALK-V3-RESULT.md)).
  A Flipper-emulated replica of the tag now reads on the phone byte-for-byte
  (desk, no erg), so the NFC read path is desk-testable up to the BLE
  boundary. **Open finding, PM5 NFC availability:** cause of the no-tag windows
  not identified, five alternatives live
  ([research note](docs/superpowers/research/2026-09-05-pm5-nfc-availability.md));
  `NF-RECOVERY-v4`'s control-tag bracket ran CLEAN on 2026-09-06 (phone stack
  live, PM5 read + full connect, Flipper raw read 42/42 pages after the
  connect); the v3 no-tag condition did not reproduce. **Cases 2-4 and the
  query-scenario diagnosis are DROPPED as ship gates (antagonist verdict,
  James's call, 2026-09-06):** probe-only constructs the spec's NO-GO list and
  countable exit never required. No further erg time for Gate -1. The
  design spec's "PM5 NFC availability" section LANDED 2026-09-06
  (no-tag is an expected outcome; do not attribute a cause; no rule may be
  conditioned on the PM5's power cycle) — Gate 0 only if copy changes.
  **Injected multi-tag / invalidation tests LANDED 2026-09-06** in the
  checked-in NFC patch (`NdefSessionEndingTests.swift`: zero/two tags and
  several NDEF messages rejected before any connect, every Core NFC ending
  code mapped with attempt identity, drained A cannot touch B; six
  deciding-source mutations, record in `REMAINING-PROOF.md`). **Reader-ending
  seam RULED and LANDED 2026-09-06 (James: option A):** the plugin's ending
  reason came from the Core NFC code alone, so the controller's own multi-tag
  rejection reached JS as `userCancelled`; the patched controller now publishes
  `cause: multipleTags | tagFailure` on endings it forced (spec section
  "Reader-ending seam" has the evidence, rule and lifetime; four more
  mutations bite). No copy changed. **Gate -1 is complete; James scheduled
  product implementation 2026-09-06, AHEAD of Wave A ("Do it now").**
  **PRODUCT IMPLEMENTATION IN FLIGHT** on `codex/phase-nf-nfc-design`: plan
  `docs/superpowers/plans/2026-09-06-phase-nf-scan-nfc-product.md`; `/harden`
  lens 1 ran (seven code findings applied, ledger entry landed); Tasks 1-8
  committed (probe retired, parser, `scanTarget` + operation tail,
  decorators, NFC reader port + native arm + scripted reader + trace,
  keyed staged retire + mount lease, `connect(request)`, Scan NFC on detail
  with the routed click-to-`armed` proof); `/harden` lens 2 (18 findings)
  applied; the self-mutation sweep record is
  `docs/monitor/sessions/phase-nf-product-walk/MUTATIONS.md`;
  main merged (2a6ba780). **Whole-branch review (2026-09-06) returned NOT
  READY with six blocking items, all fixed in the same round:** the pinned
  `domain/**` 100% coverage gate was RED (an untested overlong-name branch);
  the attempt trace was published only on a successful connect (now every
  terminal publishes and the failure screen's export window carries it); a
  `cause` beside a non-`invalidated` reason failed OPEN to silence (now
  cause-first); Gate 0's fold claim was filed under a one-row capture (now
  the Gate 0 workout itself, and the claim says what the capture shows); a comment cited a dist-grep needle that
  never existed; and seven mutation rows read "not run" behind an "all
  bite" header (re-run, see MUTATIONS.md). PM readiness on runsheet v1:
  NOT READY (ten legs → five, three blocks, ≤ 15 min, ≤ 6 reader starts;
  ledger entry "Phase NF product walk readiness"); v2 NOT READY too
  (inert build-identity rule and a build with no `VITE_API_BASE`, both
  found by building; two steps unperformable from the screen the previous
  step leaves; second ledger entry); v3 NOT READY (a Save on a screen that
  does not exist, a console field the emitter never writes, a recount off
  by one, a photo at a mid-leg state; third entry); v4 NOT READY (a
  plan-dependent save label, a timing discriminator with no shared clock,
  leg 2's unstated "stops advertising" premise; fourth entry); v5 READY
  (fifth entry). **James then asked for the walk hardened as a TIMED
  PROTOCOL; `/harden` ran both lenses (v6 timer table + holds + block
  re-cut + leg 4 decided by ending code; v7 operator blocks in screen
  text); v7's gate found one record clause (200 attributes nothing, only
  202 ⇒ iOS); v8 READY at the delta gate (seventh entry). James closed the
  review loop: "No more after this round."** **WALKED 2026-09-06
  (`docs/monitor/sessions/phase-nf-product-walk/RESULT.md`): legs 1, 3, 4, 5
  PASS; leg 2 INCONCLUSIVE — a PM5 keeps advertising after a phone-side END,
  so the not-advertising copy is desk-proven only; leg 4 decided: iOS ends a
  backgrounded reader with code 202 and the app's own pause abort still wins
  the race to a quiet return.** Next: James's merge approval of #316.
  **Follow-on PR BUILT 2026-09-06** on `codex/phase-nf2-followon`: spec
  `docs/superpowers/specs/2026-09-06-phase-nf-followon-design.md`, Gate 0
  `docs/design/handoffs/2026-09-06-phase-nf-followon/gate0.html` (APPROVED
  by James 2026-09-06 with two copy rulings), antagonist delta pass folded
  (eight findings). Rows (1) Just Row Scan NFC, (2) the targeted-scan
  screen with Cancel, (3) the tag-failure copy, (5) the not-advertising
  copy are IMPLEMENTED; row (4) is RETIRED (the existing held-device path,
  RC-18). **Owed after it, DONE (fast path, Gate 0 approved 2026-09-06):** Just
  Row's own connecting card names the target on the NFC route. **The five rows as filed
  (James's ruling 2026-09-06 "merge this then a new PR"):** (1) **Scan NFC on Just Row** — absent today
  by implementation choice (`JustRow.tsx` passes `nfcCapability="unsupported"`);
  James noticed at the erg; Gate 0 for the Just Row screen with the second
  primary; (2) the buttonless `Choosing your monitor` screen on the NFC path
  (filed below) gets a targeted-scan variant with Cancel, Gate 0; (3) the
  NDEF read-error path (Core NFC code 102, tag lost mid-read) showed the
  system's error text, not our `NFC scan stopped. Try again.` — trace and
  fix; (4) Connect once began connecting with no list sheet (walk leg 3; not
  reproduced in leg 5) — reproduce or retire; (5) **the not-advertising copy is wrong about the
  PM5** (James, 2026-09-06: it advertises whenever awake and not already
  connected, on any screen, and an NFC tap wakes it) — `Open Connect Device
  on this PM5, then try again.` becomes copy about a sleeping or
  already-connected PM5, Gate 0. Spec fact landed in the walk section. **Walk-verified countable exits** (spec): 2, 4,
  5, 6, 7 and 9 close only at the walk; the walk precedes merge. The
  branch is NOT pushed; James's word gates push, PR, walk and merge. Open
  number for James: the 1_000 ms collision window is paid on every NFC
  connect. **Owed observation (spec residual, review SF3):** backgrounding
  during the targeted BLE scan may arm the never-cleared cleanup poison on
  resume; no leg backgrounds during the BLE half; candidate fix "do not arm
  the cleanup deadline on a background-caused abort" if ever seen.
  **Product defect found by the walk hardening (RF14), FIXED in the
  follow-on PR:** on the NFC route the interstitial passed through
  `picking` rendering `CONNECT / Choosing your monitor` with NO buttons for
  the whole targeted scan; it now reads `Looking for <name>` with Cancel
  (follow-on Gate 0 §2).
  **Dead-code rows (RF29):** `PaintBarrierAbortedError`,
  `stagedRetireAttemptId()` and the transport's `targetDeadlineMs` /
  `collisionWindowMs` options have test consumers only (seams, kept on
  purpose); the NFC patch carries two unused symbols
  (`NfcSessionCoordinator.async(_:)`, `tagAttemptId`) — remove them at the
  next patch edit, which re-runs the Swift suite anyway.
  James chose a
  56 px filled muted-fern **Scan NFC** action directly above the equal-weight
  existing blue **Connect**, present only when native iOS reports NFC support.
  A valid PM5
  record confirms `PM5 found`, then silently discovers that exact advertised
  name and reuses the existing connect → program → `armed` path; no second app
  tap and no Bluetooth picker. Unsupported records say `Unsupported NFC tag`.
  A target the scan cannot find says `Couldn't reach <name>.` /
  `Check nothing else is connected to it, then try again.` (follow-on, after
  James's erg fact: the PM5 advertises whenever awake and unconnected, on any
  screen) and never falls back to a general picker. NFC is a lookup
  shortcut, not pairing. CoreBluetooth's opaque id makes the tag's MAC unusable;
  exact live `ScanResult.localName` matching is the bridge. **Gate -1 comes
  before product implementation:** a complete read on James's real PM5 must
  prove the pinned, checked-in-patched `@capgo/capacitor-nfc@8.2.5` receives the
  external NDEF record, establish its payload padding/termination, and show the
  ASCII-decoded name exactly equals that unit's live `ScanResult.localName`
  across repeated fresh scans. The patch is required because the released
  plugin's retained events lack session identity, its NDEF delegate chooses the
  first physical tag, and its stop promise does not drain old native closures.
  Native attempt identity/single-tag/drain tests, fail-closed end-to-end
  targeted-operation propagation, and raw BLE-operation serialization are
  merge gates. The
  existing Flipper file is header-only and proves none of those literal bytes.
  Full architecture, atomic product-PR shape, Gate 0, cleanup/concurrency
  contract, replay seam, and exits:
  [`docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md`](docs/superpowers/specs/2026-09-03-phase-nf-scan-nfc-design.md).
  The executable, disposable hardware-proof plan is
  [`docs/superpowers/plans/2026-09-03-phase-nf-gate-minus-one.md`](docs/superpowers/plans/2026-09-03-phase-nf-gate-minus-one.md).
  Implementation requires a separate explicit scheduling ruling; the default
  remains behind Wave A. **M**
