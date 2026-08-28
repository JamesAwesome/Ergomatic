# The machine has left — RC-37, and one line for the End button

**REVISION 5 (2026-08-27): RC-37's behaviour ruled — exit to the workout,
no banner, keep the nudges. See [R5] below. Revision 4's cut stands.**

**REVISION 4 (2026-08-27). Roughly 80% of revision 3 is CUT.** James:
*"How much of this is even really important to do. We were pretty okay with
the behavior before."* He was right. A YAGNI pass agreed and found the reason
is worse than over-engineering: **the spec's flagship harm was already fixed
and shipped, and the spec was written against stale evidence.**

Revisions 1-3 and the three adversarial passes that produced them are in git
history and in `.claude/agents/antagonist-ledger.md` / `pm-ledger.md`. This
document is what we are actually going to build.

**This is Phase RC work.** Its content is RC-37 plus one line of RC-29. "Phase
LA" never existed in the ROADMAP and is retired.

## Why almost all of it was cut

**The motivating story is dead.** The spec opened on nine `LOST THE MONITOR`
banners in 288 s (walk-2026-08-26). **Phase LM shipped `decideResumeLatch` in
v0.24.0 and killed that.** The production ring from the next day — build 759,
`walk-2026-08-27/lock-phone-ring.json` — shows **one** latch for one 39.4 s
lock, with `silent=true`: the watchdog firing correctly over a stream that
genuinely stopped, which is exactly what v0.24.0's own release note promised
testers it would now do. **What remains is a word on a screen, not a defect.**

**The relabel did not deliver its own headline benefit.**
`isReconstructableClose` (`storedSummary.ts:472`) admits only
`"finished" || null`, so relabelling `link-lost` -> `"rower"` lands the row in
FALLBACK too. It bought exactly TIER A eligibility, and walk-2026-08-27 shows
TIER A can render **500 m where the rower rowed 559.8 m**, because a
terminated partial leaves no trace in PM5 memory. A migration, a pgEnum, three
columns, a summary identity guard, a falsified release note, a row-line
replacement and a floor constant — for a number that can be wrong in the
rower's disfavour, in a cohort nobody has ever hit.

**Nobody has ever reported the harms this spec ranked first.** The only
user-reported loss in this area was the pre-row lock — record never opened,
row saved LOGGED BY HAND — and **v0.24.0 shipped its fix**. RC-29's and
RC-30's triggers have never been observed in the field.

**James's brittleness test inverted the priorities.** His rule: *"I don't want
to invent brittle heuristics to catch something that we're not told about in a
deterministic way."* Applied:

| mechanism | deterministic? |
| --- | --- |
| RC-37's structure comparison | **YES** — compares a readback against a value we ourselves sent |
| `explained-quiet` | no — infers causation from a lifecycle event near a silence |
| `SILENCE_THRESHOLD_MS` (2.5 s) | no — a tuned guess whose own comment concedes native adequacy is UNMEASURED |
| the `frame.state` freshness table | no — a cached belief with a timeout |

The spec ranked the deterministic item **sixth of seven** and the heuristic
one first.

## What we build

### 1. RC-37 — the machine drops the program and we notice

Confirmed at the erg 2026-08-27. Menu at READY makes the PM5 return to its
unprogrammed shape while `workoutState` never moves, so READY keeps rendering
and a later pull is filed against a program the machine discarded.

```
t= 7.17   wt=8  it=0  ws=0  durRaw=24000  durType=0     <- armed
t=29.05   wt=1  it=1  ws=0  durRaw=0      durType=128   <- Menu
```

**Detection is deterministic, and independently verified.** All three
`expectedArmedStructure` fields diverge together and hold **112 consecutive
frames over 56.4 s**. The negative corpus is what makes it trustworthy:
across four healthy captures, **300 armed frames, ZERO mismatches**.

**Files and sizes:**

- **`app/src/monitor/driver.ts` (~50 lines).** Lift the structure comparator
  past the verify phase. It needs persistent state (`mismatchStreak`,
  `mismatchSince`, a retained `expectedArmedStructure(p)`) rather than the
  `pendingVerify`-scoped state it uses today — **this is a new comparator, not
  a lifetime extension**, and the plan should say so.
  - **Keep the `armed` gate** (`:4767`). The structural quadruple legitimately
    moves mid-session; the gate is why the corpus is clean.
  - **Use BOTH constants.** `STRUCTURE_MISMATCH_TICKS` (3) AND
    `STRUCTURE_MISMATCH_WINDOW_MS`. That constant's own comment: *"NO LONGER
    SUFFICIENT ON ITS OWN (hardware walk 5)… carries only the STABILITY
    half… a rejection needs both."*
  - **Compare against what we SENT, never a literal `8`** (RC-38).
    `expectedArmedStructure(p)` already does. We have read one row of
    `OBJ_WORKOUTTYPE_T`; the check does not need to know what `1` means.
- **`app/src/monitor/useMonitorSession.ts` (~20 lines).** Consume it: end the
  session and **exit, exactly the way Cancel already does**.

**[R5] THE BEHAVIOUR, RULED BY JAMES 2026-08-27: `session.cancel();
onExit();` and NOTHING ELSE.** His words: *"Loose any new banners. Just take
it back here and remember any nudges."*

- **No banner, on any screen.** Two earlier drafts proposed one — over the
  dead READY screen (a lie plus a correction printed under it), then on the
  destination. Both cut. The rower pressed Menu; they know why they are back.
- **The destination is `WorkoutDetail`** — the screen carrying **Connect**,
  the last-used PM5 and the block with its targets. `onExit()` already lands
  there (`WorkoutDetail.tsx:281`, `handleInterstitialExit`), which is why
  this is a two-line change and not a screen.
- **Nudges survive, and this is VERIFIED rather than promised.** They live in
  `useState` on `WorkoutDetailView`, keyed `key={workout.id}` so the reset
  fires only on a workout SWITCH (`WorkoutDetail.tsx:123-126`). Exiting the
  interstitial is `setConnecting(null)`; the component stays mounted and the
  nudged targets are still on screen. **Pin it with a test anyway** — it is
  the half of James's ruling that a future refactor could silently break.
- **No copy anywhere.** Which also means **there is nothing for Gate 0 to
  approve on RC-37**; the design gate now has only the `LOST THE MONITOR`
  question, if James opens it.

### 1b. THE RING ENTRIES — build the instrument in the same change **[R5]**

James, 2026-08-27: *"Make sure if we need to add anything to monitor log to
make debugging easy we do."* Recurring failure #19's rule: for a new
machine-sourced input, ask which instrument catches it when it is wrong, and
if the answer is none, build it now.

Three entries. **The second is the one that matters, and without it the
walk's gate leg is unfalsifiable.**

1. **`structure-left`** — the detector fired. Carries what we EXPECTED and
   what we OBSERVED (all four fields), the streak length, and the elapsed
   window. Enough to reconstruct the decision without the recording.
2. **`structure-mismatch-recovered`** — a mismatch that started and then
   went away WITHOUT reaching both thresholds. **This is the near-miss.**
   Without it, "the detector stayed silent through the piece" cannot be
   told apart from "it mismatched twice at every rest boundary and got
   lucky on the thresholds" — the first is a passing gate, the second is a
   warning that we are one firmware quirk from ending live sessions. Carries
   the streak reached and the elapsed window, so the margin is readable.
3. The existing **`structure`** entry already logs on CHANGE and needs no
   work — it is what caught RC-37 in the first place.

**Throttle, because the ring is 500 entries and status ticks arrive at
~2 Hz.** Log the START of a mismatch streak and its RESOLUTION (fired or
recovered), never per tick — the same idiom `refusedKeysLogged` and the
stale-count rest clamp already use in this file, and for the same reason.

**Read the near-miss count at the walk.** If a rest-bearing piece produces
`structure-mismatch-recovered` entries at all, say so in the walk record even
though the gate passed: it is the measurement that decides whether the
thresholds are comfortable or lucky.

### 2. End always terminates the machine. One line.

`useMonitorSession.ts:3155` — delete `|| linkGone` from
`if (driver === null || linkGone) return;`.

Today a false link-lost latch means the rower presses End, the app closes the
record, and **the erg keeps running while they are standing at it**. Attended
human intent is not a verdict. If the link genuinely is gone, `terminate()`
throws into the existing catch, which is already best-effort by design.

Plus two tests. This is the whole of RC-29 worth building today.

## GATE 0 — one question, and only if James opens it

**[R5] RC-37 no longer needs a gate.** Its ruled behaviour adds no copy and
no new screen, so there is nothing rendered to approve.

What remains, entirely optional: **should `LOST THE MONITOR` change?** On a
phone that was merely asleep, that title blames the erg for our own
suspension — the highest-frequency wrong thing on the board and the cheapest
to fix. **But it reverses a one-day-old v0.24.0 ruling** which kept the title
identical in both branches deliberately, and the shipped release note tells
testers to expect exactly those words. Not assumed either way. If opened, it
gets its own rendered comparison with contrast computed.

## Constraints

- **No stored shape, no pgEnum, no migration, no TRIAD.** That is the point of
  revision 4.
- **No em-dashes in user-facing strings.**
- **Do not touch `livePace`.** RC-27's surface is unchanged.
- 44 px targets and WCAG AA.
- One PR. With the relabel cut, nothing carries TRIAD weight and the two-PR
  split's own justification evaporates with it.

## Testing

- Replay `menu-at-ready-recording.jsonl.gz`; assert the session ends rather
  than sitting at READY.
- **Pin the negative corpus:** replay the four healthy captures and assert
  **zero** false detections across their armed frames. This is the test that
  makes the detector trustworthy, and it is the one a future change will break
  first.
- Pin that End still terminates on a latched `frameSilence` — the one-line
  fix, in the direction it was broken.
- Pin that both structure constants are required: a mismatch shorter than the
  window must NOT end the session.
- Every new gate proved red by mutation, transcript in the report.

## Exit criteria

1. Menu at READY exits to `WorkoutDetail`, with the `armed` gate and both
   structure constants.
2. The nudged targets are still on that screen. Pinned.
3. Zero false detections across the healthy corpus.
4. End terminates the machine even when the link is believed lost.
5. **[R5] A WALK GATES THE MERGE (James, 2026-08-27: "Gate on a walk for this
   too").** Replay proves the detector against captures we already own; only
   an erg proves it against a machine nobody has scripted. Three legs, and
   the second is the one that matters:

   | leg | proves | rowing |
   | --- | --- | --- |
   | Menu at READY | the ruled behaviour end to end — the app exits, the workout and its nudges are still there, Connect re-sends | **none** |
   | a rest-bearing piece, rowed through | **the detector stays SILENT through a real session** — boundaries, rests and the ephemeral transition states are exactly where a structure comparator would misfire | one short piece |
   | End mid-piece | the one-line fix: the erg actually stops | rides the second leg |

   **The second leg is the gate.** A detector that fires on a real rest
   boundary is worse than the bug it fixes: it would end a session the rower
   is mid-way through. The corpus says 300 armed frames with zero mismatches,
   but every one of those captures is laptop/Chrome, and we have exactly one
   observation of the positive.

   Nudge a target before the first leg, so criterion 2 is observed rather
   than inferred.

## Deferred, with the reason

- **RC-29's stored half** (`endedBy` on a derived verdict) — real, never
  observed, and its fix costs a migration. The cheap instrument if we ever
  want to rank it honestly: **one ring line at `endSession` recording
  `frameSilence`**, no schema, no ceremony.
- **RC-30** — highest per-incident cost, but the trigger is narrower than the
  ROADMAP says and needs re-deriving. Its fix also LOSES DEVIATIONS row 70's
  coverage (the abandoned arm), which deserves its own decision rather than a
  sub-clause.
- **The saved row can still say the app lost the monitor when it was asleep**,
  and still shows targets-only. Note the relabel would not have fixed the
  second half either.
- **The native frame-gap distribution** stays unmeasured. Get it from a ring
  at the next walk that happens for another reason.
- **The four-tier verdict, the three columns, the summary identity guard, the
  release-note correction, the row-line replacement and its floor, the two-PR
  split, and the walk as a merge gate.** All cut.
