# `rowingActive`: pin the unpinned consumer, and put the raw byte in the ring

**Date:** 2026-09-03 · **Rev 2** (lens 1 folded — 3 major, 5 medium, 4
bookkeeping) · **ROADMAP item:** Wave F, "`rowingActive` is falsified but not
dangerous" · **Size:** S · **TRIAD:** no (no stored shape, no number's
meaning, no auth)

## What and why

`MonitorFrame.rowingActive` is the PM5's rowing-state byte flattened to a
boolean (`pm5/parse.ts`, `raw.rowingState === 1`). The repo has already
convicted it as a rowing signal — `useMonitorSession.ts`'s pause derivation
says so at its own site: *"now with the byte FALSIFIED as a hard gate (Phase
LM task 2: it read `false` through an entire real row)"*. Nothing here
changes that verdict and nothing here changes behaviour.

Two things are owed. One of the byte's two live consumers is held up only by
an incidental snapshot rather than by a test that says what it means. And
when the byte next misbehaves, the diagnostics ring will not say what it did
— which matters more than it sounds, because the falsification happened on
the phone, and the phone has no recording tap at all.

## §1 — The unpinned consumer, pinned on purpose (I-1)

**The byte has TWO behavioural uses, not one.** Naming both matters, because
an implementer told there is one will not look for the other:

1. **The ready gate.** `useMonitorSession.ts`'s `declared` reads
   `frame.state === "rowing" && frame.rowingActive && frame.distanceMeters > 0`
   — the leg that opens the session record, whose failure mode is a lost
   session, which is why `ROWING_ACTIVE_FALLBACK_FRAMES` exists. **This one is
   ALREADY PINNED** by a named assertion: `useMonitorSession.test.ts`'s *"the
   STUCK Inactive byte does not cost the session: five frames of strictly
   increasing distance promote to live anyway, and the log says so"*. No work
   is owed here.
2. **`surfaceModel.ts`'s `midSessionMirror`.** At a mid-session interval
   boundary, before the first pull of the next piece, both heroes read `0`
   rather than previewing a target. Three terms ANDed — `!armedMirror`,
   `frame.rowingActive === false`, `frame.distanceMeters <= MID_SESSION_RESET_METERS`.
   **This is the one that is not pinned.**

**I-1: a frame whose byte reads TRUE must not mirror, whatever its
distance.** Stated as a model-layer contract rather than as "it stops the
mirror firing on a rower who is rowing" — because that stronger sentence is
false, and the same spec's own falsification says why: a rower rowing through
the window with a stuck-Inactive byte DOES mirror. The term protects the
model against a frame whose byte says Active. It does not protect the rower.

**The discriminator is a HEURISTIC, and the spec says so rather than letting
a reader assume otherwise.** `MID_SESSION_RESET_METERS = 1` was tuned against
three observed boundary readings (`surfaceModel.ts`'s own evidence dowry:
`0`, `0.8`, `0`), and the byte half is a machine declaration the machine has
been caught not making. Both error cases, named:

- **False positive** — byte stuck Inactive while the rower genuinely rows the
  first metre of a mid-session interval: both heroes read `0` for under a
  metre, which is close to what the mirror is for anyway. This is the
  "falsified but not dangerous" of the ROADMAP title, written down as a
  reason instead of left as a title.
- **False negative** — byte reads Active at the boundary before the first
  pull: the heroes show the previous interval's ghost, the defect the mirror
  exists to remove. Unobserved; all three committed boundary frames read
  `rowingActive=false`.

By contrast **§2's mechanism is DETERMINISTIC** — the machine reports a byte
and the detector compares it against a value we received. That asymmetry is
why §2 is cheap and trustworthy and §1 is a pin rather than a fix.

### The ROADMAP's measurement for this item is stale, and this spec corrects it

It says deleting the term "leaves 5,357 tests / 191 files green, so nothing
gates it today". Re-measured on this branch's base (`c2182ef5`), against a
green baseline of `Test Files 231 passed (231)` /
`Tests 6597 passed | 1 skipped (6598)`:

    (delete `frame.rowingActive === false &&` from surfaceModel.ts)
    NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run \
      --project unit --project client
    -> Test Files 1 failed | 230 passed (231)
       Tests  1 failed | 6596 passed | 1 skipped (6598)

The term IS gated today — but only by `ConnectedSurface.screens.test.tsx`'s
`"pane C, the grid mid-rest (RC-24)"` snapshot, and only as an HTML diff:
`connected-grid-spm` renders `0` where it expected `21`. A snapshot says
"this page changed"; it does not say what must be true, and `-u` re-baselines
it silently. The pin belongs at the model layer where the decision is made.

**The work is a test only. `surfaceModel.ts` is not modified.**

**The new test's own mutation is stated, per RF21.** With the pin in place,
deleting `frame.rowingActive === false &&` must fail `surfaceModel.test.ts`
at the new test's own assertion, and the report quotes the failure message.
The test asserts POSITIVE values (the exact `display`, `judgement`, and
`absent: false`) rather than a `not.toBe(...)`, and sits beside its mirror
image — the existing *"the guard: once distance advances past the reset
window, the mirror ends and judged values return — even with rowingActive
still false"*, whose own comment explains that it deliberately isolates the
DISTANCE half. The new test isolates the BYTE half and says so.

## §2 — The raw byte in the ring (I-2, I-3)

`MonitorFrame.rawRowingState` already exists and `pm5/parse.ts` populates it
on every frame (both shipped with the lifecycle spec's §3, PR #267). Its only
consumer is `useMonitorSession.ts`'s `resume-first-frame` ring entry — one
entry, at one moment, on a resume edge.

### Why a ring entry is the right instrument, not merely an available one

The falsification happened on the phone. **Native builds ship without the
recording tap** — it is a dev/web seam — so on the surface where the defect
lives, the ring is the entire evidence base. The 2026-09-03 resume-edge walk
says exactly this in its own README (*"No recording exists … the diagnostics
ring is the whole evidence"*), and it names this item as the reason it could
not answer the byte question.

That walk's committed `ring.json` demonstrates the gap on the exact gesture.
It carries **68 entries, of which 6 are `frame` entries** (counted from the
committed file), because `driver.ts` logs a frame only when the state WORD
changes — and a mid-work stop changes no state word. Across the whole stop
(elapsed 80.52 → 92.11 s while distance sat 247.1 → 249.6 m) the ring says
nothing about the byte at all.

**This is a SECOND entry kind, not an extra field on the existing `frame`
entry**, and that is the point: the `frame` entry fires on state-word change,
which is precisely the trigger that misses this case.

### The invariants

**I-2: a logical session that produced any frame records the byte AT LEAST
ONCE — on its first frame — and again on every change thereafter.** So an
operator reading a ring can tell three things apart: no entry means the
instrument did not run; exactly one entry means the byte never moved; N+1
entries mean N changes.

The first-frame entry is not decoration. A change-only detector emits **zero
entries** for the session that motivates this whole item — walk 2026-08-26,
where the byte read `false` on every frame of an entire real row, one value,
no changes — and that walk kept no recording either. The instrument would
have been silent on the one case it was built for.

**I-3: after the first, the entry is recorded on CHANGE, never per frame.**
The ring holds 500 entries (`eventLog.ts`, `DEFAULT_CAPACITY`) and drops the
oldest as it fills. `driver.ts` records the precedent in its own words:
status notifications arrive ~2/second, so recording every one *"evicted the
whole programming trace … from the 500-entry ring inside about four
minutes."*

**The entry carries:** previous value, new value, `state`, `elapsedSeconds`,
`distanceMeters` — the same shape `driver.ts`'s `frame` entry uses, so an
operator reads the two side by side. The clock-and-distance pair is not
optional context: a stop IS "distance frozen while the clock runs", which is
the pair the 09-03 walk used to settle item (d).

### The measurement that sets the rate

Two committed scripts, because the script is the artifact and a transcribed
table goes stale: `docs/monitor/sessions/rowing-state-census.py` (values and
change counts) and `docs/monitor/sessions/rowing-state-rate.py` (the
wall-clock windows). Both read byte 9 of every `ce060031` rx frame.

    python3 docs/monitor/sessions/rowing-state-census.py
    TOTAL frames: 7777 values: {0: 3009, 1: 4768} changes: 91

    python3 docs/monitor/sessions/rowing-state-rate.py
    worst in any 60s: ('boundaries-terminated-recording.jsonl.gz', 6)
    worst in any 10s: ('session-2-wu-4unequal.jsonl', 3)

**I-3's affordability is argued in entries-per-window, not as a percentage of
frames**, because the ring fills in TIME and a percentage says nothing about
that. The worst 60-second window in the corpus is **6 entries**; the worst
10-second window is **3**. Against a 500-entry ring whose real occupancy is
68 entries for a whole 100-second connect → program → row → terminate → save
(the 09-03 ring, counted), and against the driver's own four-minute eviction
precedent, that is affordable with a wide margin.

**A per-file changes-per-minute figure is deliberately NOT cited**: the worst
such number in the corpus is 12.3/min, from a 9.7-second recording containing
two changes, which is a short-file artifact rather than a sustained rate. The
bounded windows are the sound statistic.

### What the census does and does not bound

**Scope, stated rather than implied.** 17 of the 18 non-twin recordings in
`docs/monitor/sessions/` (20 files; two are byte-identical gzip twins, and
`walk-2026-08-17/step-1-…jsonl` contains zero frames), spanning
2026-08-16 to **2026-08-31**. These are web-transport captures from a small
number of PM5s. It bounds what our corpus has seen; it is not a claim about
the firmware.

**And the corpus cannot answer the value question, by construction.** The
byte takes only 0 and 1 across those 7,777 frames — but every recording in
the census comes from a session where the byte behaved. The one session where
it did not (walk 2026-08-26) kept no recording, and
`docs/monitor/pm5-interface-notes.md` says why that matters in as many words:
*"this capture cannot distinguish 'the machine said Inactive' from 'the
machine said something we do not decode.'"* So the ROADMAP's worry — that a
non-1 read is flattened to `false` and the next occurrence will not say which
value it was — is **still open**, and the ring is the only thing that can
close it. The census sets the entry rate; it does not retire the question.

### Lifetime (RF27)

The detector holds one previous value. That is session-scoped state, and PR
#258 cost five review rounds for exactly this omission, so it gets a table.

| | |
|---|---|
| **What** | The last raw byte value seen, plus a "nothing seen yet" state |
| **Home** | `src/monitor/driver.ts`, beside `lastLoggedFrameState` — the direct precedent, which change-logs the state word into the same ring for the same eviction reason |
| **Mint site** | One, with the driver instance |
| **Clear sites** | None other than the mint. It is per-driver by construction |
| **Survives teardown** | No — a new driver is a new detector, so an old previous-value can never pair with a new trace (#258's cross-attempt alias, one layer down) |
| **Survives relaunch / re-arm** | No, same reason |
| **First frame of a session** | No previous value exists; I-2 records unconditionally, so this is the defined case, not an edge |
| **`rawRowingState` is optional on the type** | `undefined` is treated as "not reported" and never as a change against a number. The house answer for the sibling entry is adopted verbatim: render it `?? "unknown"`, with the same comment saying the guard is defensive rather than reachable |

Stated as invariants, not as a mechanism: the implementer picks the
expression, but a new driver must not be able to inherit an old byte, and no
entry may claim a change it cannot name both sides of.

## §3 — What this deliberately does not do

- **No behaviour change.** No screen, number, stored row or decision reads
  differently. §1 adds a test; §2 adds a diagnostic entry.
- **No new predicate on the byte.** `PAUSED_FRAME_HOLD`'s comment gives the
  standing reason and it stands: keying a pause on a byte that reads `false`
  through a real row would trade a visible defect for a silent one.
- **No change to `parse.ts` or `types.ts`.** Both already carry the raw byte
  and its doc comment.

## §4 — Record corrections, swept in this PR

**(a) The withdrawn "freezes whenever `rowingActive` goes false" survives in
FOUR live files — three found by the obvious grep and a fourth that the
obvious grep misses.** #280's walk narrowed the claim at `types.ts`'s own site;
CLAUDE.md's rule is that a withdrawn claim's PHRASING is then grepped across
every file that repeated it, and it was not. Confirmed by
`grep -rn "FREEZES whenever\|freezes whenever\|freezes to the centisecond" app docs ROADMAP.md`
— **and then the same grep with `freezes when`, which is the one that finds
the fourth.** A withdrawn claim is swept by its MEANING, not by its exact
wording; `whenever` and `when` are the same assertion and only one of them
was searched for at rev 2. The branch review caught the miss:

1. **`app/src/session/summaryModel.ts`** — the worst: it calls the
   elapsed-vs-rowing-time question *"NOT settled"* and quotes
   *"`types.ts:134` says this same field 'FREEZES whenever `rowingActive`
   goes false'"*. The 09-03 walk settled that residual and the quoted
   sentence no longer exists at that line. **Narrow it, and drop the dangling
   line number for the symbol** (RF16's corollary: a dangling citation reads
   as evidence).
2. **`app/src/workout/connected/surfaceModel.ts`** — *"freezes to the
   centisecond the instant `rowingActive` goes false"*, which contradicts its
   own next paragraph sixteen lines later. **Narrow to the REST case.**
3. **`app/src/workout/connected/surfaceModel.test.ts`** — same phrasing,
   already scoped by its own next clause to a rest. **Narrow it too** rather
   than leave the next reviewer to re-find it and spend a round.
4. **`app/src/monitor/transports/fake.ts`** — *"the interval clock, which
   freezes when `rowingActive` goes false"*, on the sibling field beside
   `restDistanceMeters`. Reachable only by the `freezes when` grep, which is
   why rev 2 missed it and the branch review found it. **Narrowed to the
   REST case**, which is the case that field's consumer actually fixes and
   which the walk left unchanged.

The two spec documents that also carry the phrasing
(`2026-08-20-est-left-design.md`, `2026-09-02-door-partial-design.md`) are
HISTORICAL records of what was believed when written and stand unchanged;
`ROADMAP.md`'s two hits are this item's own text quoting the original for the
record and likewise stand.

**(b) The ROADMAP entry for this item needs three corrections in the same
commit**, or it ships contradicting the spec that closed it:

- the falsified measurement ("deleting it leaves 5,357 tests / 191 files
  green, so nothing gates it today") — replaced with the re-measured result
  and the snapshot that catches it;
- the stale citation `surfaceModel.ts:915` — `midSessionMirror` is not there;
  cite the symbol, per the plan-authoring rule;
- the box itself, which is ticked once (a) through (d) are all done. Sub-item
  **(b), the "reconciled comment", is already DONE** — `types.ts`'s
  `restSeconds` block was narrowed at its own site by #280's walk — and the
  entry is corrected to say so.

**(c) The `programDropped` item's box is still `- [ ]` while its own prose
says it shipped.** The entry reads *"SHIPS as the live-drop PR from spec §1 …
**PR #248**"*; `gh pr view 248` reports `MERGED 2026-09-01T03:32:52Z`. Ticked,
naming #248. This is the same prose-corrected-but-box-unticked failure the
AUD PR's whole-branch review caught hours earlier, swept here rather than
left for the next reviewer.

## §5 — Decomposition and spoken skips

One PR, one implementer, one task review, one whole-branch review.

- **Antagonist:** ONE lens-1 pass, DONE (James, 2026-09-03: "harden once").
  Verdict SHIPPABLE AFTER FIXES; all 3 major, 5 medium and 4 bookkeeping
  findings are folded into this rev. Lens 2 is SKIPPED and the skip is
  spoken: this spec prescribes no executable content.
- **PM gate:** SKIPPED. Non-TRIAD, and by the PM-gate rule this changes
  nothing the app DOES and gives a tester no new capability.
- **Gate 0:** not required. Nothing user-visible changes; the ring is an
  operator surface reached through You → DIAGNOSTICS.
- **Not fast path**, and the reason is I-3: a wrong version floods the ring
  and evicts a session's evidence, which is a lost record.
