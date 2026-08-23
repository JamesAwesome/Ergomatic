# Phase RC spec 1 — the held-open finish: instrument, wave-0 fixes, combined walk

**What and why, in plain words.** Phase RC's prize is Concept2's own
server as this project's first external oracle, and its two blockers are
measured: we store the wrong quantities, and we hang up 21–107 ms after
the last frame, before the machine can tell us which row we just rowed.
This spec opens the phase evidence-first (James, 2026-08-22). It builds
one dev-only instrument — hold the Bluetooth link open after a finish so
we can finally see whether the PM5's end-of-workout characteristics ever
fire — fixes the two wave-0 defects that need no evidence (a decode 10×
too large, and dirty samples in the stored series), and defines the
combined walk that answers RC's four wire questions and Phase LL's exit
clauses in one erg session. No storage redesign happens here: RC-1 and
RC-8 are specced AFTER the walk, with evidence in hand.

Ruled during brainstorming (James, 2026-08-22):

- **Evidence-first.** Spec 1 = instrument + walk + wave-0. The storage
  spine waits for the walk.
- **Laptop dev seam, not product code.** The hold-open is a dev/web-only
  instrument. No product close semantics change, no second TestFlight;
  the phone runs stock v0.17.0 for LL's exit clauses.

## 1. Research record

- **PRIMARY:** `docs/monitor/pm5-ble-ecosystem-review.md` (2026-08-21,
  fourteen-agent review) — this phase's evidence base. The measured
  facts this spec repeats (21.7/24.1/30.6/107.3 ms finish race; 0x0039
  and 0x003A subscribed in all six committed recordings with zero
  notifications ever; WORKOUTSTATE_WORKOUTLOGGED (12) never observed;
  Last Split decode 10× against nine capture pairs and the PM5's own
  memory screen) are its, reconciled into ROADMAP §Phase RC.
- **PRIMARY (C2 API):** the verification code (0x003F) is firmware-gated
  to nine disjoint bands; our PM5's firmware version has never been
  recorded (walk item W1 exists for exactly this).
- **Does the system have the concept?** Whether the PM5 HAS a
  "log entry committed" event reachable over BLE is **OPEN — it is the
  question, not a premise.** The one-hypothesis reading (we hang up
  microseconds too early, by construction, every time) fits all the
  evidence but has never been tested. W2 is the test. This spec asserts
  nothing on the machine's behalf: the instrument observes; no product
  code consumes 0x0039/0x003A/0x003F on the strength of this spec.
- **Nothing found:** no vendor documentation states when (or whether)
  the PM5 emits 0x0039/0x003A/0x003F relative to log commit. The fire
  timing is undocumented; only the walk can supply it.

## 2. The hold-open instrument (dev/web only)

**Mechanism, verified against the code this session:** the finish-race
disconnect is OURS — `useMonitorSession.ts`'s teardown calls
`driver.disconnect()` (caller-initiated; `driver.ts`'s own log line says
so), and `FINISH_GRACE_MS = 3000` (`driver.ts:796`) governs only the
summary-reconcile timer, never the link. Deferring one call defers the
hang-up.

**Design.** Following the `window.__pm5Recording__` precedent
(`recording.ts`, dev/web only, installed at the adapter layer):

- `window.__pm5HoldOpen__.arm()` — arms a one-shot deferral. On the next
  natural finish, teardown's `driver.disconnect()` is deferred 90 s.
  Everything else about teardown proceeds: the record closes exactly as
  today, `closeRecord` runs, the summary screen appears. Only the radio
  stays up, subscriptions live, ring + recording tap still capturing.
- `window.__pm5HoldOpen__.release()` — disconnects now (cancels the
  timer). The 90 s expiry calls the same path.
- `window.__pm5HoldOpen__.status()` — `"disarmed" | "armed" | "holding"`
  plus ms remaining, so the walk operator can read the state instead of
  trusting memory.
- **Armed state is visible on the connected screen** (dev builds only):
  a small "HOLD-OPEN ARMED" chip. A diagnostic that only exists in a
  console variable is disarmed by anyone who forgets it (recurring
  failure 13's corollary); the chip is the tell.
- **Scope guard:** installed only where the fake/tap seam already lives
  — the DEV/web arm of `adapters/monitorTransport.ts`. Native never sees
  it. Production bundles must not contain it: settled by `pnpm build` +
  string grep for `__pm5HoldOpen__` over `dist/`, both directions
  (recurring failure 12), as a committed test or documented probe.
- **Interaction with Phase LL's watchdog, stated:** after the record
  closes, the liveness decorator's silence callback has no surface to
  fire on (the session is over); the held-open link's frames route to
  ring + tap only. The instrument must not re-open the record, must not
  write to the store, and must not change `endedBy` — it observes.

**What the held-open window records:** every notification on every
already-subscribed characteristic (0x0031–0x003A) plus 0x003F (below),
timestamped in the ring, raw bytes in the recording. If state 12 or
0x0039 arrives at t+N seconds, the recording names N. If nothing arrives
in 90 s, that negative is committed as a finding too.

## 3. Subscribe 0x003F (verification code)

- Add `VERIFICATION_CODE_UUID = pm5Uuid(0x003f)` beside the existing
  0x0039/0x003A constants (`domain/monitor/pm5/uuids.ts:67-71`).
- Web arm subscribes it; failure to subscribe DEGRADES (Phase LL's
  non-critical class — some firmware bands will not expose it; a missing
  characteristic must not fail the connect). Native arm: not in this
  spec.
- Payload handling: raw hex to ring + recording, no decode. The byte
  order is disputed between C2's own documents (CSAFE says byte 0 = MSB;
  the BLE table says "Lo") — W4's same-frame photograph settles which,
  and decoding before that would enshrine a guess.

## 4. Wave-0 fix A (RC-4): Last Split Time is 0.01 s/lsb — our decode is 10× too large

TRIAD (a number's meaning). Settled without an erg: nine capture pairs
(0x0033's u24LE@14 is the exact hundredths value whose truncation to
tenths is 0x0037's split time), the PM5's own memory screen
(7476 → 1:14.7, `walk-2026-08-17/README.md:14`), and ORM agree against
both C2 documents' printed 0.1 (wrong four times).

- `domain/monitor/pm5/parse.ts:203`: `readU24LE(bytes, 14) / 10` → `/ 100`.
- `domain/monitor/pm5/statusFrames.ts:222` (the fake's encoder mirrors
  the same error): `* 10` → `* 100`.
- Retarget the two tests that pin the wrong scale (`parse.test.ts:198`,
  `:614` — line numbers as of the ecosystem review; locate by assertion,
  not line).
- **The pin is a REPLAY against committed capture bytes, never a round
  trip** — the fake's encoder mirroring the decoder is exactly why no
  round trip could ever catch this (both sides wrong together). Assert
  7476-hundredths decodes to 74.76 s from real bytes.
- Ship the semantic beside the fix: the field is dimension-conditional
  and transiently live mid-interval; it can never be a countdown
  checkpoint at any scale (ecosystem review; contradicts
  `pm5-interface-notes.md` §20 items 17 and 24 — reconcile those rows in
  the same PR, recurring failure 9's docs sibling).

## 5. Wave-0 fix B (RC-6): band `spm`, drop zero `p` in the stored series

TRIAD-adjacent (stored series content; shape unchanged). Verified this
session at `seriesRecorder.ts:229-230`:

- `spm: f.spm ?? 0` stores unbanded wire values; the sibling `hr` two
  lines below is banded 20..254. The PM5 demonstrably emits 64 and 101
  spm in coherent frames at boundaries; two stored samples in the
  committed step-2 capture would carry 64. Band `spm` the same way:
  out-of-band → drop the field for that sample (same "drop the field,
  never the save" treatment `hr` already gets). **Band: 10..60 spm** — INFERENCE, stated as a spec decision: elite
  sprint cadence tops out near the low 50s, so 60 clears every humanly
  rowable stroke rate while both measured boundary artifacts (64 and
  101) fall outside it. If a walk recording ever shows a genuine in-band
  artifact, that is RC-1-era coherence work, not a band retune.
- `p: Math.round((f.currentSplit ?? 0) * 10)` writes `p: 0` when the
  wire pace is absent/zero — 8 samples on session-2, 2 on pyramid. C2's
  `stroke_data.p` has no concept of a zero pace and our own live surface
  refuses one layer up (`surfaceModel.ts:586`). Treat pace like `hr`:
  no reading → omit `p` for that sample. `Sample.p` becomes optional in
  the STORED shape — additive-optional (old samples with `p: 0` remain
  readable; readers already handle absent fields on `hr`'s precedent).
- Pin both with replays from the committed captures showing the exact
  samples that today carry `64`/`0` and after the fix carry
  neither.

## 6. The combined walk (planned via /hardware-walk at the erg)

One session, two devices, two evidence streams. The walk PLAN (budget,
piece list, capture asks) is composed and approved at the erg per the
hardware-walk skill; this section fixes only WHAT the walk must answer
and WHICH device answers it.

**Phone (stock v0.17.0, build 717) — Phase LL's exit:** clauses (a)–(e)
(link killed pre-stroke and mid-piece says so within bound; Try Again
works without deleting the app; ring retrievable from the failure
screen; DEVIATIONS row if iOS residue is unfixable; trace-across-gap
criteria), W5 (BT power-cycle while armed), W6 (background 30 s
mid-piece), W8 (does the PM5 self-TERMINATE), W9 (getConnectedDevices
system-scope), 9a (native inter-frame gap distribution off the ring),
plus the §2b flash ring-copy ask and the false-banner warning — all as
written on ROADMAP's LL walk card.

**Laptop (Chrome, this branch, dev seam) — Phase RC's wire questions:**

- **W1** — photograph the PM5's firmware version screen (2 min, no
  rowing). Gates whether 0x003F can exist on this monitor at all.
- **W2** — the keystone piece (2×250 m, no rest token), then ARM the
  hold-open and touch nothing for 90 s. Settles whether the summary
  path is reachable, when state 12 fires, whether the ~1-min
  recovery-HR re-fire is real.
- **W3** — same piece: PM5's View Detail memory screen and the decoded
  `logEntryDate`/`logEntryTime` (RC-2's format, decoded from the
  recording afterward — not live code) in one frame. Settles bit-packing
  and the seconds question.
- **W4** — same piece: 0x003F raw hex from the recording beside a
  photograph of the PM5's own 16-digit code. Settles fire/no-fire on
  our firmware, timing, and byte order.
- **W7 (LL's)** — navigate the PM5's menu mid-session on the laptop leg:
  does the wire go quiet, and does the watchdog false-fire?
- **W7-distance (RC's)** — only if W2 shows 0x0039 arriving at all: a
  distance-shaped summary (3×300 m r30, held open 90 s).

**Sequencing note:** the phone leg needs nothing from this branch; the
laptop leg needs this spec's instrument merged (or the walk runs on the
branch's own stack — the hardware-walk skill's lab is per-worktree
either way).

## 7. Out of scope, said aloud

- **RC-1 / RC-8** (storage spine + fake corrections) — specced after the
  walk. RC-8's five fake contradictions gate RC-1, not this spec;
  nothing here consumes the fields the fake lies about. (RC-4's fix
  touches the fake's encoder for a field this spec's replay pins against
  REAL bytes, which is the treatment that defeats the mirror.)
- **Event-based product close** — W2 decides whether the event exists
  before any product code closes on it.
- **RC-2/RC-3 decodes as product code** — blocked on the held link;
  W3 does RC-2's decode offline against the recording.
- **Concept2 API calls** — the dev key stays in `.env`, its value never
  read by any agent, never in any committed file, fixture, or capture;
  allowed to live in real env only (the `DATABASE_URL` stance). RC-10
  is wave 5.
- **Native 0x003F** — after the walk proves it fires.

## 8. Exit criteria — written so they can go red

1. On a real PM5, the instrument holds the link open 90 s past a natural
   finish with the ring and recording capturing; the session's record
   closes normally in the same run (the two are independently visible in
   the walk's artifacts).
2. A replay test against committed capture bytes decodes Last Split Time
   7476-hundredths as 74.76 s; the fake's encoder round-trips the same
   scale; `pm5-interface-notes.md` §20 items 17/24 are reconciled.
3. A replayed stored series carries no `p: 0` sample and no out-of-band
   `spm`; the exact samples that today carry `64`/`0` are named in the
   test.
4. `pnpm build` + grep proves `__pm5HoldOpen__` absent from `dist/` in a
   probe that has been shown to go red (plant, detect, remove).
5. The combined walk's questions are answered on the record — including
   any negative (0x0039 silent through 90 s is a committed finding, and
   closes the verification branch's "reachable in principle" to
   "unreachable on our firmware" if W1+W4 say so).

## 9. Gates and sequencing

- **Antagonist anchor pass (phase open):** this spec + the phase
  decomposition (ROADMAP §Phase RC's waves). Its attacked-and-held
  claims become the phase's vetted ground.
- **PM open gate:** the spec slate (this spec now; RC-1/RC-8 spec
  post-walk; walk as the pivot between them).
- **TRIAD:** RC-4 changes what a stored/displayed number means and RC-6
  changes stored series content — the antagonist pass covers both here;
  the implementation PR gets the PM final-PR gate.
- **Grouping:** instrument + 0x003F + RC-4 + RC-6 are ONE PR — one
  reviewer risk model (wire observation + decode corrections), no
  stored-shape redesign to hold alongside.
