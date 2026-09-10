# Screenshot churn: what actually moves, and what to do about it

**Date:** 2026-09-10. **Status:** measurement complete, fix partly scoped.
**Replaces the ROADMAP row's cause list**, which was wrong in both directions.

## What and why

`pnpm screenshots` rewrites captures no code change touched, so `git status`
after a PR is full of noise and the frames a change actually altered are buried
(RF7: committed captures are the PR's visual record and a reviewer's only look
at a screen). The row filed for this had been SIGHTED five times over three
weeks and carried four measured causes; nobody had ever attributed the churn
FILE BY FILE, which is what its own "still unexplained" clause asked for.

This document is that attribution, plus what each cause costs to close.

## The measurement

Two runs of `pnpm screenshots` at the same commit (`8c5da0c5`), on the same
booted stack, 157 captures each, both green. Committed bytes, run A and run B
each hashed separately, so STALENESS and NONDETERMINISM are separated rather
than counted together — the 2026-08-28 filing already suspected they were two
problems and could not prove it.

|                                |  files | what it is                                                                                               |
| ------------------------------ | -----: | -------------------------------------------------------------------------------------------------------- |
| **Stale but reproducible**     | **33** | A and B agree byte-for-byte; the committed bytes are old. One recapture commit closes these permanently. |
| **Genuinely nondeterministic** | **36** | Differs run to run. The real bug.                                                                        |
| unchanged                      |    133 |                                                                                                          |

67 of 202 differ from committed; only 36 churn. **Every prior filing counted
the 67.**

**36 IS A FLOOR, NOT A CENSUS — corrected 2026-09-10 by the verification runs
themselves, and this is the most important methodological fact in the
document.** A second pair of runs at a later commit found 29 churning files
INCLUDING THREE the first pair never flagged (`log-monitor-landscape.png`,
`today-checkpoint-overridden.png`,
`recovery-missing-type-portrait-actions.png`). So the churning SET is itself
nondeterministic: some causes fire intermittently, and any single pair of runs
under-counts by an unknown margin. Every count in this document — and every
count in every prior filing, which all rested on one pair — is a lower bound.
**A census needs N pairs, not one**, and nobody has run that.

### The 36, by cause

Attribution is mechanical: per-file pixel diff between run A and run B, then
the changed region read directly.

| cause                                               | files | evidence                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Generated identity carrying `Date.now()`**     |    12 | `helpers.ts:117` — `RUN_ID = String(Date.now()).padStart(13,"0") + randomBase36(6)`, spliced into every e2e user's email by `signInViaBackdoor`. `you.png` renders `screenshots-you-1789060665…` in run A and `…1789060783…` in run B. |
| **B. Wall-clock time of day**                       |    13 | `log-detail-partial.png` reads `:17` then `:19`; `diagnostics-monitor-logs.png` reads `13:17` then `13:19`.                                                                                                                            |
| **C. A different suggested workout**                |     5 | `today-unlogged.png` shows O2 "Imbat" in one run and AT "Nor'wester" in the next — not noise, different content.                                                                                                                       |
| **E. A capture taken before async content settles** |    1+ | `recovery-today-landscape.png` caught `LOADING…` in one run of two. Waits on `UNSAVED WORKOUT`, which renders BEFORE the suggestion fetch resolves. RF7's own failure mode, hiding inside a churn count.                               |
| **D. Antialiasing and font-metric jitter**          |     5 | 4–6 changed pixels each, max channel delta ≤9.                                                                                                                                                                                         |

**C AND E ARE ENTANGLED, AND THE FIX ORDER MATTERS.** Before the suggestion is
pinned, a re-rolled workout and an unsettled `LOADING…` frame are
indistinguishable in a file hash — both read as "this file churns". Pinning is
what makes the race VISIBLE: `recovery-today-both-portrait.png` still differed
after its pin landed, and the reason was that one run captured the pinned
"Sea Fret" card and the other captured `LOADING…`. **E is probably the larger
cause of the two, and it could not have been counted before C was fixed.**

**A and C were never named by the row, and together they are half the churn.**

### Two of the row's four named causes are not causes

- **The focus-dependent hint cannot flap.** The row cites
  `you-derive-offer-accepted` alternating `ESTIMATED · TYPE TO ADJUST` and
  `ESTIMATED`. That copy was **deleted on 2026-08-28** —
  `BaselineEditor.tsx:135-144` carries the reason (the baseline round's
  `[−][+]` steppers made "type to adjust" name one entry path and hide the
  other). The file is in the STALE bucket, byte-identical across both runs.
- **The trace-axis-tick cause is not live.** No `log-monitor*` capture is
  nondeterministic in either run.

Both were real observations once. Neither was re-checked before being carried
into a later filing — the same shape as RF16's second corollary, one layer
over: a true-when-written claim used as if current.

### And a methodological finding worth keeping

**A diff bounding box over-reports, badly.** `news-reader-close.png` has a
351×628 diff box and **six changed pixels inside it**, spread far apart. Every
prior filing measured bounding boxes. Count changed pixels and the maximum
channel delta; the box only says where to look.

## What each cause costs to close

**C — the suggestion (6 files). Test-only, closeable now.** `pinToday`
(`screenshots.spec.ts:345`) already exists and already states the idiom:
_"Pixels are identical to a real draw of that outcome; only the dice are
removed."_ These six captures do not call it. Fix: call it.

**B — the clock (13 files). SPLITS, and the halves are not alike.**

- **4 are spec-side and closeable now:** `diagnostics-monitor-logs{,-landscape}`
  seed `savedAt` from `new Date()` (`:2858`, `:2905`), and
  `post-workout-summary{,-landscape}` seed `phaseStartedAt` from `Date.now()`
  (`:3076`). The file already has the constant to use —
  `MONITOR_FIXED_NOW = new Date("2026-08-01T12:00:00.000Z")` (`:1035`) — and
  already uses it for the monitor captures. These four escaped it.
- **9 are DB-side and have NO test seam.** `storedSummary.ts:439` formats
  `row.loggedAt`, and `server/stores/logs.ts:775` says in as many words:
  _"`loggedAt` is a DB-side default, not settable by `create()`'s input"_.
  Closing these means a test-only settable `loggedAt`, or freezing the
  Postgres container's clock. **A server change takes this out of fast path.**

**A — the identity (12 files). Needs a decision, and the obvious fix is
wrong.** Making `RUN_ID` a constant would make captures reproducible and would
also make every screenshots run reuse the previous run's users on a kept stack,
inheriting their data. That is a stale-data bug traded for a churn bug, and it
is the same class as the already-filed _"`retest.spec.ts` is not idempotent
across runs on a KEPT stack"_. **The principled fix is the other direction:
give the screenshots project a FRESH DATABASE per run and then a stable
`RUN_ID` is safe** — deterministic input, deterministic output. That also
retires the kept-stack idempotency class rather than adding to it.
**Its cost is UNMEASURED (RF30):** a fresh boot pays the 300-workout library
seed on every `pnpm screenshots`. Both runs above took 1.3–1.4 min on a
warm stack. Nobody has timed the cold path, and this document does not claim
a figure.

**D — antialiasing and font-metric jitter (5 files). Proposed: ACCEPT, with
the number attached — but the threshold is NOT settled.**
The original five are 4–6 pixels at max delta 9, invisible at any size a human
reads. **The verification runs then produced a case that breaks that bound:**
`recovery-missing-type-portrait-actions.png` renders the identical text
"Choose a type" in both runs with **729 changed pixels at max delta 227** — the
same glyphs at a sub-pixel offset, equally invisible, two orders of magnitude
above the proposed threshold. So "changed pixel count" alone cannot separate
noise from content, and any accept-threshold written against it would be
arbitrary. Recorded as an open question rather than answered. Chasing them
means hunting browser rendering nondeterminism for pixels no reviewer can see.
Recorded here with the measurement so the next sighting is recognised rather
than re-investigated.

## Recommended split

1. **Now, test-only, no product code:** C (6) + B-spec-side (4) + recapture the
   33 stale. Takes per-run churn from 36 to 26 and `git status` noise from 67
   to 26.
2. **Decision, then its own PR:** A (12) via fresh-DB-per-run, and B-DB-side (9)
   via a settable `loggedAt`. Both reach `app/server` or the compose boot, so
   neither is fast path.
3. **Accepted:** D (5), with the measurement above.

## What the fix earned, measured honestly

| pair                                                      | churn |     |
| --------------------------------------------------------- | ----: | --- |
| A/B — before any fix                                      |    36 |     |
| C1/C2 — frozen clock, pinned suggestions, one settle wait |    29 |     |
| D1/D2 — settle wait extended to the shared loop           |    16 |     |

**36 → 16, but the change earns 8 of that, not 20, and the rest is timing
luck.** All eight targeted files are stable in the final pair. The other
twelve — every `concept2-screen-*` and `you-concept2-*` capture — are NOT
fixed; they are MASKED. Proof, from the hashes: each is `same` within the
close D1/D2 pair and `DIFF` against the earlier C1 run.

**Why, and it is the reason nobody ever attributed cause A: `RUN_ID` embeds an
epoch timestamp and the UI TRUNCATES the email.** Two runs minutes apart share
the visible leading digits and hash identically; two runs an hour apart do not.
**So a back-to-back pair systematically under-counts the largest single cause**
— and a back-to-back pair is what every prior filing ran. The A/B pair caught
it only because those two runs straddled enough wall clock for the visible
digits to roll.

## Reproducing — and the spacing requirement

Run `pnpm screenshots` twice at one commit, hashing `docs/screenshots/*.png`
after each and restoring the committed bytes in between. Compare committed
vs A, committed vs B, and A vs B; the third comparison is the one that
separates churn from staleness, and no prior filing made it.

**Two requirements the obvious version of this gets wrong:**

1. **Space the runs, or add an hour to the clock between them.** Back-to-back
   runs hide cause A entirely, for the truncation reason above. This is the
   single easiest way to measure this problem and conclude the wrong thing.
2. **Use more than one pair.** The churning set is itself nondeterministic:
   across the three pairs run here, **43 distinct files churned at least once
   and only 9 churned in all three**. One pair is an anecdote.
