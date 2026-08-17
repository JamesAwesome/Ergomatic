# Walk runsheet — Phase CR2 exit (spec 3, the connected redesign)

**Authority on conflicts:** `docs/superpowers/specs/2026-08-16-connected-redesign-design.md`
§6 exit criterion 6 ("the phase-exit walk … is the release gate — v0.10.0 tags
only after it passes, notes PR first"). This is the walk criterion 6 names —
it did not exist before this PR (§3: "This PR creates the phase-exit walk
sheet"). Nothing here is optional against a green CI run: CI proves the app
is internally consistent, never that the redesigned surface reads true
against the erg (`.claude/agent-briefing.md`'s "verifying the app only
against itself" recurring failure).

**Walk medium is BINDING**, the same convention `walk-2026-08-16/RUNSHEET.md`
established: Chrome + Web Bluetooth from the worktree dev server, recording
tab foregrounded, display awake. The phone's native adapter routes past the
tap and records nothing — this walk needs the recorder live for the same
reason the previous one did (photographs cover only what the wire cannot).

**Two evidence streams, label which is which everywhere:** the WIRE
(recording: every 0x0031 tick, 0x0033 counts in true arrival order,
0x0037/38 splits, CSAFE writes/acks, 0x0039 if it beats teardown) versus the
SCREENS (photographs: what the rower-facing displays showed, and when).

**What changed since the last walk (2026-08-16):** the connected surface's
whole visual vocabulary — header segmented control, cut labels, two judged
heroes, the up-next + TOTAL LEFT band, the GRID table. `TOTAL M` does not
exist on the live surface any more (§ below has the replacement route).
Every number this walk checks is the SAME wire-derived value the redesign
carries forward (`totalLeftDisplay`, `elapsedDisplay`, the accumulator) —
only where it is drawn, and what it is called, changed.

---

## Session 1 — the keystone re-run (Stage B's own committed fixture, re-shot on the new surface)

**Program: 2×250 m, r0, NO warm-up.** A-priori truth 500 m; no rest means no
coast-metres to argue about — the same program `walk-2026-08-16` session 1
rowed, re-run here because that walk's own screens (TOTAL M, the old
metric-row labels) no longer exist to re-photograph. The WIRE side of that
walk is not repeated — PR #104's clamp already has two permanent CI
replay tests against those exact recordings (`registerReplay.test.ts`); this
session is the SCREENS half, on the redesigned surface, for the first time.

- Connect, arm the program, confirm the FIRST FRAME (2D: `1 OF 2 · READY`,
  ghost split in ink-4, rate `0` plain ink, no dash-bars) before pulling.
- During piece 2: read the band's `TOTAL LEFT` cell (not a session-total
  cell any more — there is no session-total cell on LIVE). Compare it by
  head-math against the a-priori 500 m total and the elapsed shown on the
  PM5's own screen.
- **At the finish: LINGER before touching anything** — give the handoff-hold
  time to collect the final split and, ideally, 0x0039 into both the ring
  and the recording.
- Photograph the PM5's own memory/summary per-interval detail screens (the
  backstop for per-interval actuals).
- **Download the recording and save the file BEFORE navigating or
  reconnecting** — latest-session-wins; a reconnect silently discards it.
- Read `final-totals` from diagnostics after (existing protocol).
- Open the diagnostics log sheet (triple-tap the control) and read the
  `SESSION` line against the PM5's own elapsed at the same instant — see
  the session-meters row below for why this is now the comparison route.

## Session 2 — the REST-BEARING row (PR #104's clamp, first hardware look)

**Program: at least one WORK → REST → WORK sequence** (the 4-unequal-
interval shape `walk-2026-08-16` session 2 used is fine, or the keystone's
own 2×250 with r30 substituted for r0). PR #104 fixed a +221 m overcount
that only a rest-bearing session can exhibit (a finished interval's meters
filed one register low the instant the PM5 announces "resting"); the fix
shipped behind two replay tests against RECORDED captures, never against a
live erg mid-rest. This is that check.

- **The primary row: both screens, one frame, during an actual REST.**
  Photograph the phone's `TOTAL LEFT` reading and the PM5's own displayed
  session/total distance in the SAME frame, mid-rest — not at a boundary,
  not after the rest ends. Before the clamp this is exactly the moment the
  finished interval's meters could double-count into the wrong register;
  the numbers must agree (allow the same ~1 m / one truncation-step
  tolerance the interval-clock rows use).
- Repeat once more at the SECOND rest (if the program has one) — the clamp
  logs one divergence per key per run, so a second rest is a second chance
  to see it fire (or not).
- Natural finish: linger, PM5 memory screens, download + save, diagnostics
  `final-totals`.
- After the walk: check the downloaded recording's own clamp log (if any
  entries exist, they are diagnostic, not necessarily a failure — read
  them against `driver.ts`'s own clamp comment before calling anything
  wrong).

## Session 3 — END finals (cheap, from the 2026-08-16 runsheet)

Connect, row ~20 strokes, END twice mid-interval: diagnostics must carry
`final-totals` (the END path writes it at terminate-dispatch). Download this
recording too if convenient.

## Session 4 — the F6 reload-mid-piece check (PR #105, first hardware look)

PR #105 gave an interrupted connected session a way home instead of the app
asserting anything on the machine's behalf; it shipped against the fake
transport (e2e) and jsdom (unit), never against a real reload while genuinely
paired to hardware.

- Connect to the erg for real, row past at least one interval boundary.
- **Reload the browser tab mid-piece** (not End, not disconnect — a real
  page reload, the crash-equivalent F6 exists for).
- Open Today: confirm the quiet interrupted-session row appears
  (`"{title}: interrupted connected session."`, **Log it** + a two-tap ✕).
- Press **Log it**: confirm the log screen opens with a duration built from
  what the monitor actually measured (recorded work + programmed rest for
  completed intervals) — read the minutes shown and sanity-check them
  against how long the piece actually ran, not wall-clock time since the
  reload (a session logged minutes after a reload must not read as hours).
- Optional: repeat once choosing **Discard** instead, and confirm the next
  Connect attempt no longer claims "a session is in progress" about the
  discarded run.

## The handoff's on-erg test list, VERBATIM (`docs/design/handoffs/2026-08-15-connected-v2/README.md`, "On-erg test list")

> 1. Rate hero at 92px readable mid-pull? 2. Any cut label missed?
> 3. Status at 22px readable at full pull? 4. Zone/cal legible through screen
> glare? 5. Try to mis-hit the switcher toward END — any near-miss is a stop.
> 6. Mount the phone both rotations; nothing moves or is occluded.
> 7. First frame looks deliberate. 8. Triple-tap still opens diagnostics.

Reproduced exactly as the handoff wrote it, per this task's own brief — item
4 is MOOT (Ruling 2 cut ZONE and CAL outright; there is nothing left at that
slot to read through glare) but the list is not edited to remove it, so the
walk record shows what was asked for, not a silently trimmed version of it.
Item 3's own number changed under this same PR (the status caption now
renders at its intended `--c-size-status` — 22px landscape, 21px portrait —
closing a gap Task 5's review left open); item 3 as printed above still
names the number that matters.

## Session-meters comparison — RE-POINTED at the log sheet's SESSION line

**`TOTAL M` no longer exists on the live surface.** The redesign cut it
outright (design spec §3's fate table: `meters` off `SurfaceModel`, its only
render site was `PaneLive`) — there is no cell on LIVE or GRID that shows a
running session-distance total any more. The walk's old "same-frame totals
photo" protocol (`walk-2026-08-16` session 2, item 3: "the PM5 rest screen
shows a live session total … photograph it beside the phone's TOTAL M") has
no phone-side target left to photograph.

The replacement route: **triple-tap the segmented control** (either half,
the same gesture that always opened diagnostics) to open the Connection log
sheet, and read its own `SESSION {elapsedDisplay}` caption line — session
TIME, not session distance; `elapsedDisplay` is `SurfaceModel`'s own
untouched field (design spec §3's fate table: "survives untouched"). This
is a genuinely different comparison than the old one (elapsed time against
the PM5's own elapsed, not distance against distance) — recorded as a
deliberate narrowing, not an oversight: distance verification now happens
through TOTAL LEFT (which the keystone and rest-bearing sessions above both
check) and the post-session log summary, not through a live running total.

## After the walk (Claude)

1. Before trusting any app-vs-erg number: the inter-arrival check
   (`walk-2026-08-16`'s own protocol — the recording's 0x0031 inter-arrival
   distribution against the committed baseline).
2. Commit the gunzipped recordings to `docs/monitor/sessions/` with a README
   row each: date, program, photo transcriptions labelled by evidence stream
   (screen vs wire).
3. Compare the rest-bearing session's same-frame photo against the
   recording's own clamp-log entries (if any) — this is the first LIVE
   evidence for PR #104's fix; the replay tests prove the mechanism against
   RECORDED bytes, this proves the mechanism against a machine that hasn't
   already been decoded.
4. Confirm the F6 reload session's logged minutes against the recording's
   own elapsed-seconds — the number the log screen showed must agree with
   what the wire actually carries, not merely "look plausible."
5. Only once 1-4 pass: v0.10.0 tags (notes PR first, per the spec's own
   header line: "Release after merge: v0.10.0 (MINOR) with a notes PR before
   the tag").
