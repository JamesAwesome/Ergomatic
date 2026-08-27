# Walk 2026-08-26b — the re-walk. Leg A PASSED.

The walk that closes Phase LM PR 1's merge gate, after the morning's walk
(`../walk-2026-08-26/`) failed.

**This directory exists because the PM re-gate caught its absence.** The failing
walk got a committed ring and five photographs; the passing walk got sentences
in a PR body, and the spec cited this directory before it existed — a dangling
citation for the number that closes a merge-gating criterion. *"We commit the
evidence when it disappoints us and narrate it when it agrees."* The numbers
below are now checkable rather than quoted.

## Provenance

| Artefact | What it is |
| --- | --- |
| `phone-ring.json` | the diagnostics ring, verbatim, copied off the device via `MONITOR LOG · COPY` |
| `phone-ready-lost-on-unlock.png` | leg A on unlock: `1 OF 4 · READY`, red `LOST THE MONITOR / Nothing kept.`, `47m` greyed, heroes as target previews |
| `phone-recovered-rowing.png` | moments later, having resumed rowing: banner retracted, `1 OF 4 · WORK`, `60m`, live |

Build: branch `lost-monitor`, stamped **0.23.0 (789)**, built from the worktree
at `.claude/worktrees/lost-monitor`. No wire recording — the download row is
dev-gated and a device build cannot produce one.

## Criterion 3: ZERO spurious latches. MET.

Computed from `phone-ring.json`, not eyeballed. Session span **151.0 s**.

- **`app-lifecycle` entries: 2.** Both `latched=true`, both with a measured gap
  far past the threshold:
  - `resume gap=20076ms threshold=2500ms silent=true latched=true`
  - `resume gap=98870ms threshold=2500ms silent=true latched=true`
- **Entries with `latched=false`: 0** — no resume in this session was even
  close enough to the threshold to be worth suppressing.
- **Spurious latches: ZERO.** Both correspond to backgrounds James actually
  performed.

**Against the morning walk: nine latches in 288 s, seven of which the watchdog
disagreed with.** Here the two instruments agree: `liveness-silence` fired
twice, independently, before each resume.

The criterion's own words demanded "a count, not an impression." That count is
above and reproducible from the committed file.

## Criterion 4: the ring asserts no cause. MET.

The line reads `resume gap=… threshold=… silent=… latched=…` — what was
measured. The morning's `"resumed from background — stream treated as suspect"`
asserted a cause nobody had checked, and was often untrue.

## Leg A: PASSED

James connected, programmed a 4×500 m, tapped **Show me the numbers**, locked
the phone, pocketed it, rowed ~30 s, and unlocked.

- **No banner on entering the surface.** The morning's flap is gone.
- **`1 OF 4 · READY` on unlock**, not `WORK` — the armed state survives a lost
  link, which is the Phase LM fix.
- **The banner DID appear on unlock, correctly**: a genuine 20 s background,
  measured, past threshold.
- **It retracted when he rowed**, and the session picked up and recorded.

Also visible and correct: `Nothing kept.` beside a greyed `47m`. True — the
machine banked metres the app never recorded as an interval.

## Leg B: NOT WALKED AS SPECIFIED. Substituted, and the substitution is named.

The card asked for a deliberate mid-piece **lock**, with which of three landings
occurred recorded. What happened was a 98 s **background** while `phase=live`
(seq 35-37): it latched correctly, `distanceIncreased=true`, and **the run
continued** — landing 1 of the three.

**That is evidence about landing 1 under a 98 s gap. It is not leg B**, and this
PR is the wrong one to blur that: its own root cause is that a background and a
foreground-interruption are *different iOS transitions we had conflated*. A
change that just proved two events are not interchangeable cannot claim one
covers a card asking for the other.

Mitigation, stated fairly: a 98 s background with `framesWhileHidden=2` is a
**harsher** frame gap than a lock (`pm5-interface-notes.md:4663` records a
15-20 s lock not even dropping the link), so for the continuity question it is a
superset stressor.

**Still unobserved on hardware:** `kept = 0` beside a nonzero greyed counter,
the majority outcome of a mid-row loss on a single-interval workout. The run
continued here, so it never arose. That ROADMAP row stays open.

## Legs 3 and 4 (the §D1e probe): CANCELLED by James, not run.

Closed on evidence gathered here: both genuine backgrounds report
`framesWhileHidden=2`, against 32/33/61 in the morning walk where the same
counter was measuring `active`/`inactive` transitions with the app still
running. **A real background delivers almost nothing** — most of what the
control arm existed to measure.

**Stated honestly: this closed the CONTROL arm only, incidentally.** What
`bluetooth-central` would change is still unmeasured. See the spec's
"The §D1e probe: CLOSED without running it" for the reopen conditions.

## Leg 2b (the false pause): reproduced, then fixed, then NOT re-walked.

Reproduced here on the second attempt (see `../walk-2026-08-26/` and the spec's
Task 5), fixed at `3423e95`, and **the fix has never been walked.** The
corpus regression pins that a genuine pause still fires; nothing on hardware
pins that the coast case is now silent. Filed rather than hidden.

## Second finding, again

**`rowing-active-fallback` fired once more** (seq 31): `rowingActive=false
spm=23`. **Second consecutive session** where the byte reads Inactive through a
real row and only the five-frame distance streak opens the record. See
`../walk-2026-08-26/README.md` and `pm5-interface-notes.md` §20 fact 13.
