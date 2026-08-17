# Walk runsheet — Phase CR2 exit (spec 3, the connected redesign)

**Authority on conflicts:** `docs/superpowers/specs/2026-08-16-connected-redesign-design.md`
§6 exit criterion 6 ("the phase-exit walk … is the release gate — v0.10.0 tags
only after it passes, notes PR first"). This is the walk criterion 6 names —
it did not exist before this PR (§3: "This PR creates the phase-exit walk
sheet"). Nothing here is optional against a green CI run: CI proves the app
is internally consistent, never that the redesigned surface reads true
against the erg (`.claude/agent-briefing.md`'s "verifying the app only
against itself" recurring failure).

**REVISED at the antagonist phase-exit pass (2026-08-16)** — the first
draft carried four blocking defects, all recorded here so the walk record
shows what was wrong: (1) it asked for `TOTAL LEFT`-vs-PM5-distance
agreement, but `TOTAL LEFT` is a `m:ss` CLOCK (`fmtDuration`,
`surfaceModel.ts`), not a distance — a clock and a metre count cannot
agree; (2) the SESSION-line comparison sat on the keystone session, whose
committed capture contains ZERO resting frames and cannot exercise #104's
clamp; (3) the F6 gate demanded a recording the reload itself destroys
(the recorder is an in-memory `window` global — download BEFORE reloading);
(4) the binding laptop medium cannot execute five of the handoff's eight
on-erg items. All four are corrected below.

## TWO PASSES, two mediums — label everything with its pass

**PASS A — WIRE (laptop, BINDING for every number):** Chrome + Web
Bluetooth from the worktree dev server, recording tab foregrounded, display
awake — the phone's native adapter routes past the tap and records nothing.
Sessions 0-4 below are Pass A.

**PASS B — SCREENS (phone, NATIVE dev build, really paired, UNRECORDED):**
the on-erg items that need a mounted phone in a hand — geometry under REAL
safe-area insets, which desktop Chrome reports as identically 0 and no
committed capture or e2e assertion can observe (spec §1's own concession).
Photographs only; the native adapter records nothing, which is fine — Pass
A owns the wire. See the corrected medium note under the 8-item list:
there is NO fake-monitor route on a phone. Items marked [B] below.

**Two evidence streams, label which is which everywhere:** the WIRE
(recording: every 0x0031 tick, 0x0033 counts in true arrival order,
0x0037/38 splits, CSAFE writes/acks, 0x0039 if it beats teardown) versus the
SCREENS (photographs: what the rower-facing displays showed, and when).

**What changed since the last walk (2026-08-16):** the connected surface's
whole visual vocabulary — header segmented control, cut labels, two judged
heroes, the up-next + TOTAL LEFT band, the GRID table. `TOTAL M` does not
exist on the live surface any more, and **the register accumulator's
DISTANCE has no rower-visible home at all now** — its walk oracle is the
diagnostics `final-totals` line (Session 2). Session elapsed (the SAME
register map, elapsed axis) is rower-visible as the log sheet's `SESSION`
line, `TOTAL LEFT`, and the progress bar's fill — a mis-keyed register
write poisons BOTH axes of the pair it holds, so an elapsed comparison
bites on the same defect class (measured: the walk-2 poison that added
+220 m also added +52 s — `7:51` where the erg reads `6:59`).

---

## Session 0 — the download dry run (Chrome only, NO erg, ~2 min)

Carried from `walk-2026-08-16`'s own Session 0, whose reasoning is
unchanged and medium-independent: the gzip arm of `downloadRecording` is
untestable under jsdom, every session below depends on the download, and
the opener that reaches it changed IN THIS PR (`PagerRail` deleted, the
segmented control is new — exit criterion 3's own subject).

1. Open the connected screen → triple-tap the control → **Download
   recording**.
2. `gunzip` the file; confirm it parses (`pm5-recording/v1` header).
3. A failure here costs two minutes; found later it costs a re-walk. STOP
   and fix before any rowing.

## Session 1 — the keystone re-run (SCREENS half; the wire half is already CI)

**Program: 2×250 m, r0, NO warm-up.** A-priori truth 500 m — the same
program `walk-2026-08-16` session 1 rowed. The WIRE side is not repeated
(PR #104's clamp has two permanent CI replay tests against those exact
recordings), and this program's committed capture contains ZERO resting
frames (workout states {0, 5, 10}) — **it cannot exercise the clamp; that
is Session 2's job.** This session is the SCREENS half on the redesigned
surface: does the new layout read true through a real piece.

- Connect, arm the program, confirm the FIRST FRAME (2D: `1 OF 2 · READY`,
  ghost split in ink-4, rate `0` plain ink, no dash-bars) before pulling.
- During piece 2: glance the band's `TOTAL LEFT` clock and the progress
  bar — the bar must not be further along than the piece actually is.
- **At the finish: LINGER before touching anything** — give the handoff-hold
  time to collect the final split and, ideally, 0x0039.
- Photograph the PM5's own memory/summary per-interval detail screens (the
  backstop for per-interval actuals — read them against the GRID's own
  TIME/METERS columns, which is where per-interval actuals live on the
  phone now).
- **Download the recording and save the file BEFORE navigating or
  reconnecting** — latest-session-wins.
- `final-totals` from diagnostics after: **check
  `|accumulator − machineTotal| ≤ 1.5 m`** (the same tolerance
  `registerReplay.test.ts` uses) — this line is the phase's ONLY remaining
  distance oracle; "read it" without a criterion is not a check.

## Session 2 — the REST-BEARING row (PR #104's clamp, first hardware look — THE PRIMARY SESSION)

**Program: ≥3 work→rest boundaries required** — the 4-unequal-interval
shape `walk-2026-08-16` session 2 used (wu + 1:00/2:00/500m/1:00 r30).
NOT the keystone-with-r30 substitute: a single-boundary program gives the
clamp one chance to fire, and on the only measured evidence (3 boundaries,
2 clamps in the committed capture) roughly a third of single-boundary runs
would exercise nothing and read "agree" for reasons unrelated to the fix.

- **The primary row: both screens, one frame, during an actual REST.**
  Triple-tap → the log sheet's live `SESSION m:ss` caption beside the PM5's
  own session ELAPSED display — they must agree within a second or two.
  (Time against time; `SESSION` is `elapsedDisplay`, the register map's own
  elapsed sum — the same accumulator #104 fixed, on the axis that is still
  rower-visible. The poison this checks for measured +52 s on the recorded
  walk-2 session.) **First confirm the PM5's rest screen actually shows a
  session-elapsed field** — the previous walk confirmed a live session
  DISTANCE there (184=184) but no record exists for elapsed; if the PM5
  offers no elapsed field, fall back to the `final-totals` criterion below
  as the sole accumulator oracle and say so in the record.
- Second check in the same frame, no head-math: the progress bar's fill
  position against where the session actually is.
- Repeat at the SECOND rest — a second chance to see the clamp fire (or
  not).
- Natural finish: linger, PM5 memory screens, download + save.
- `final-totals`: **`|accumulator − machineTotal| ≤ 1.5 m`**, plus: did the
  clamp log any divergence entries at all? **Record the answer either
  way** — a run where it never fired did not exercise the fix, and the
  session only counts if at least one boundary engaged it (read entries
  against `driver.ts`'s clamp comment before calling anything wrong).

## Session 3 — END finals (cheap, from the 2026-08-16 runsheet)

Connect, row ~20 strokes, END twice mid-interval: diagnostics must carry
`final-totals` (the END path writes it at terminate-dispatch). Download this
recording too if convenient.

## Session 4 — the F6 reload-mid-piece check (PR #105, first hardware look)

PR #105 gave an interrupted connected session a way home; it shipped against
the fake transport and jsdom, never against a real reload while genuinely
paired.

- Connect to the erg for real, row past at least one interval boundary.
- **BEFORE the reload: triple-tap → Download recording → save the file.**
  The recorder is an in-memory window global — the reload destroys it, and
  After-the-walk item 4 needs these bytes. The actuals the log screen will
  show are all recorded pre-reload, so this capture carries exactly the
  evidence needed.
- **Write down which interval is IN FLIGHT, then reload the browser tab
  mid-piece** (not End, not disconnect — a real reload, the
  crash-equivalent F6 exists for).
- Open Today: confirm the quiet interrupted-session row appears
  (`"{title}: interrupted connected session."`, **Log it** + a two-tap ✕).
- Press **Log it**: the duration shown = the COMPLETED intervals' measured
  work + their programmed rests. **The in-flight interval contributes
  NOTHING by design** (`buildMonitorLogSteps` keys off completed actuals) —
  rowing 2:00 + 1:30-in-flight then reloading shows ~2:00 and that is
  correct, not a dropped interval; and it must never read as wall-clock
  time since the reload.
- Optional: repeat once choosing **Discard**, and confirm the next Connect
  attempt no longer claims "a session is in progress" about the discarded
  run.
- **Observation row (parked finding, stale-while-armed): arm a program,
  kill the link BEFORE stroke one** (walk out of BLE range or power the
  PM5's display off), **switch to GRID.** Record what the header, the
  up-next line, and the progress bar show. Stale beats armed in the axes'
  precedence, so the armed protections drop: the header may read a gold
  session-left instead of `READY`, up-next may name the wrong phase, and
  the bar may show fill — all before a single pull. This row OBSERVES (it
  is a filed close-out finding, not a pass/fail gate); what it shows
  decides the close-out ruling.

## The handoff's on-erg test list — each item tagged with its PASS

> 1. Rate hero at 92px readable mid-pull? 2. Any cut label missed?
> 3. Status at 22px readable at full pull? 4. Zone/cal legible through screen
> glare? 5. Try to mis-hit the switcher toward END — any near-miss is a stop.
> 6. Mount the phone both rotations; nothing moves or is occluded.
> 7. First frame looks deliberate. 8. Triple-tap still opens diagnostics.

Reproduced verbatim per the brief, then TAGGED — the first draft printed
this against a laptop-only medium and five of the eight cannot execute
there:

- Items **1, 3, 7** — [B, at the erg if the phone can be mounted beside the
  laptop; otherwise Pass B at home + deferred to the cohort in the notes]:
  readability judgments at rowing distance need the device, not a laptop
  screen.
- Item **2** — [A]: a label audit works on any screen.
- Item **4** — MOOT (Ruling 2 cut ZONE and CAL outright); kept unedited so
  the record shows what was asked.
- Items **5, 6** — [B, REQUIRED]: a touch mis-hit test needs a finger (a
  trackpad cannot near-miss), and the both-rotations occlusion check tests
  REAL safe-area insets — identically 0 in desktop Chrome, unobservable by
  any committed gate (spec §1), and the phase's largest new risk class (the
  control moved under the notch band; `--edge-inset` relocated;
  `env(safe-area-inset-top)` added). Pass B also checks the `100dvh`
  construction on the real device (the carried-debt iOS 26 bullet — the
  surface's height model was rebuilt by this PR).
- Item **8** — [A and B]: the gesture must work on both mediums.

**Pass B's medium, corrected against what is actually possible** (the
first draft said "the FAKE monitor from Xcode or Safari-on-device" —
checked and FALSE on both routes: the fake transport only exists when a
test harness injects `window.__pm5FakeScript__` before connect
(`transports/index.ts` — a human cannot open it by hand), iOS Safari has
no Web Bluetooth so the web arm resolves to no transport at all on a
phone, and the native arm goes straight to real Capacitor BLE):

- Pass B runs on the NATIVE dev build at the erg, genuinely paired — the
  shipping path (`pnpm ios:build` needs `GOOGLE_IOS_CLIENT_ID`; then
  `pnpm ios:open`, run to the device from Xcode). Build AFTER the merge so
  the phone runs exactly what ships.
- The PM5 is single-central: the phone and the laptop cannot both be
  connected at once, so Pass B is its own few minutes at the erg, not
  concurrent with Pass A's sessions.
- Most items need NO rowing: arm a program and the 2D frame is up — do the
  rotations/occlusion check (item 6), the mis-hit attempt (item 5), the
  triple-tap (item 8), and "first frame looks deliberate" (item 7) against
  the armed screen. Items 1 and 3 (readability mid-pull) need one short
  unrecorded piece on the phone connection — a few strokes is enough.
- Roughly ten minutes total, appended to either erg visit.

## Session-meters — where each number lives now (corrected)

**`TOTAL M` no longer exists on the live surface, and no rower-visible
surface shows the accumulator's DISTANCE at all** (design spec §3's fate
table; the saved log carries per-interval meters, not the session sum).
The first draft of this sheet claimed "distance verification now happens
through TOTAL LEFT" — **false; `TOTAL LEFT` is a clock** (`fmtDuration`).
The corrected inventory:

| Number (all from the same register map) | Rower-visible home | Walk oracle |
| --- | --- | --- |
| Session elapsed (register sum) | log sheet `SESSION` line, `TOTAL LEFT` (as remaining), progress-bar fill | Session 2's same-frame photo |
| Session distance (register sum) | **none** | `final-totals`: `\|accumulator − machineTotal\| ≤ 1.5 m` (Sessions 1 + 2) |
| Per-interval actuals | GRID's TIME/METERS columns | PM5 memory screens vs GRID (Session 1) |
| Interval countdown (2a's clock fix) | GRID active-row cell only | Session 2: glance the active-row countdown against the PM5's own mid-piece |

The release notes must tell testers the same thing: totals read lower and
correct, and the place to CHECK is the post-session summary and the log
sheet — not the live pane, which no longer carries a distance.

## After the walk (Claude)

1. Before trusting any app-vs-erg number: the inter-arrival check
   (`walk-2026-08-16`'s own protocol — the recording's 0x0031 inter-arrival
   distribution against the committed baseline).
2. Commit the gunzipped recordings to `docs/monitor/sessions/` with a README
   row each: date, program, photo transcriptions labelled by evidence stream
   (screen vs wire), and each session's PASS (A/B).
3. Compare Session 2's same-frame photo against the recording's own
   clamp-log entries — the first LIVE evidence for PR #104's fix. Record
   whether the clamp fired at all (Session 2's own counting rule).
4. Confirm the F6 session's logged minutes against the PRE-RELOAD
   recording's own elapsed-seconds for the completed intervals (the
   download step Session 4 now front-loads — the number the log screen
   showed must agree with what the wire actually carries).
5. Only once 1-4 pass AND Pass B's required items (5, 6, 8) are clean:
   v0.10.0 tags (notes PR first, per the spec's own header line).
