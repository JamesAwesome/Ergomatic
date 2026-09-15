# Gate 0B — board 1 (the session screens: M1, M1b, M2)

Rendered 2026-09-14 in Chromium against this worktree's compose stack, at
390×844 portrait and 844×390 landscape, by `app/e2e/gate0b.spec.ts` —
**which no longer exists**: the PR implementing this board's ruling deleted it
as promised and replaced it with `app/e2e/provenance.spec.ts`, which asserts
the behaviour instead of capturing it. The frames here are what that harness
produced while it lived.

**Boards 2 and 3 are NOT here.** Board 2 (the axis: M3, M6, M9) waits on the
2026-09-15 walk, which decides whether one of its three candidates is
drawable at all. Board 3 (M4, M5) is unstarted — see "What is not built" at
the foot.

## The three frames, and what each is for

| frame | wire says | screen says | source |
| --- | --- | --- | --- |
| `before/tiles-finished-*.png` | `avgStrokeRate: 26` | **RATE 26** | the monitor's |
| `before/tiles-terminated-*.png` | `avgStrokeRate: 52` | **RATE 26** | **ours** |
| `guard-removed/tiles-terminated-portrait.png` | `avgStrokeRate: 52` | **RATE 52** | the monitor's |

**The first two are pixel-identical in the RATE tile.** The same label sits
over two different sources and a rower cannot tell which they are reading.
The screen looks correct precisely because a guard is silently declining the
monitor's own field — `logbookDerived.ts:43`,
`if (input.finished) return input.avgStrokeRate`.

Verified in the database rather than read off the picture: the terminated row
stores `ended_by = 'rower'` and `machine_summary->>'avgStrokeRate' = 52`
while its tile reads 26, so the branch fired.

**The third frame is the prototype with that guard removed**, and it is why
removing it is not on the table: `pm5-interface-notes.md` §27.6 —
*"0x0039's Average Stroke Rate reads exactly DOUBLE on a terminate"* — with
the PM5's own View Detail screen photographed at 23 against the wire's 46.
Frame 3 is that doubled number presented to a rower as their stroke rate.

## The one frame that shows M1 and M2 together

`before/block-hr-portrait.png` — the tiles, the eyebrow and the table in one
capture, because a contradiction of this kind is only catchable by reading
the frame (RF7):

- **AVG HR 140** in the tiles, directly above a table reading **HR 152** and
  **148**. About ten bpm apart, both on screen, nothing saying they are
  different quantities. (Measured range across the corpus: 3.5-15.2 bpm.)
- The eyebrow reads **`PM5 · PER INTERVAL`** over a table whose **WATTS**
  (140/248) and **CAL/HOUR** (848/1026) columns are OURS —
  `session/logbookDerived.ts` says so in its own comment.
- The tiles' **AVG WATTS 184** sits above table rows of 140 and 248.

## The census this board is arguing from

**The table: six data columns, two of them ours.**

| column | whose arithmetic |
| --- | --- |
| HR | the monitor's (0x0038 per-interval) |
| **WATTS** | **ours** (`logbookWatts`) |
| CAL | the monitor's |
| **CAL / HOUR** | **ours** (`logbookCalPerHour`) |
| DRAG | the monitor's |
| REST m | the monitor's |

**The tiles: six, and two of them are not a fixed source at all.**

| tile | whose | fixed? |
| --- | --- | --- |
| AVG WATTS | ours | yes |
| CALORIES | the monitor's | yes |
| CAL / HOUR | ours | yes |
| **RATE** | the monitor's if the piece FINISHED, ours if it did not | **no** |
| DRAG | the monitor's | yes |
| **AVG HR** | the monitor's if present, ours from the trace otherwise — always ours in practice | **no** |

**The two conditionals are different in kind**, and a board that treats them
alike gets the design wrong: RATE switches because the monitor is WRONG on a
terminate; AVG HR falls back because the monitor sends NOTHING.

## The question this board exists to answer

**Can one label be true of a tile whose source switches for a documented
reason?** Three ways out, none assumed here: compute the label per row from
the same predicate the value came from; group the tiles so one honest eyebrow
covers each group; or say the switch out loud on the rows where it happens.
Removing the conditional is ruled out for RATE by §27.6, and for AVG HR would
mean showing a dash where a real number exists.

**The house's existing mark does not answer it.** The tilde is already
provenance-adjacent — `Builder.tsx:633`, and the baselines article's own
words, *"distance workouts show a rough length marked with a tilde"* — but it
means ESTIMATED, not OURS. `logbookWatts` is exact arithmetic on measured
inputs. Reusing it would conflate the two axes this pass exists to separate.

## Contrast

`before/contrast.json` — **7 pairings**, measured from the live cascade, one
per element class on this board. Lowest **6.69:1** (`--ink-3` on `--page`:
the tile labels, the eyebrow, the table header and the total line), against
WCAG AA's 4.5:1 for normal text. Highest 15.41:1.

The test fails if any selector matches no element: its first draft covered
**3 of 7** and looked complete.

## What is not built, and why

- **Board 3 (M4, M5)** — the live total beside the stored one. The live half
  needs a real fake-driven session; `connected.spec.ts`'s `walkToReady` is
  private to that file, so building it means either duplicating ~150 lines of
  fixture machinery or exporting from a shared spec for a throwaway board.
  **The repo's existing live-pane captures are hand-edited HTML fixtures**
  (`screenshots.spec.ts`'s `showConnectedFixture`), which are layout-only and
  would be weaker evidence than everything above. Worth a decision rather
  than a guess.
- **Board 2 (M3, M6, M9)** — waits on the walk. Candidate B (wall clock) is
  exactly what a frozen work clock would kill, and the walk decides it.
