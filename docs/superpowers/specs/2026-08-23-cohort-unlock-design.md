# The cohort unlock — Try again works where the walk found it dead, and a lost link finally shows

**What and why, in plain words.** Two small fixes that together discharge
the cohort-growth condition (Release posture, Phase LL) and the F3 tag
condition. F1: the failure screen's Try again button is dead exactly
where a rower most needs it — after Bluetooth dies mid-session — because
that path renders the failure JSX from the `disconnected`-no-run branch
where `canRetry` is statically false; the 2026-08-23 walk hit it live.
F3: a session the link killed is stored as `endedBy: "link-lost"` and no
screen ever shows it; the corrected v0.17.0 note promises "that surface
is coming." Approved design (James, 2026-08-23: "Looks right").

## 1. F1 — wire retry in the disconnected branch

**Mechanism (code-verified; supersedes the walk's filed listener
theory):** `ConnectedInterstitial.tsx:309` sets `canRetry =
session.phase === "failed"`; the failure JSX has TWO call sites — the
`failed` phase (button always enabled) and the `disconnected`-no-run
branch, which reuses the same element with the button disabled by
construction (`:451-456`'s own comment documents it). A mid-session
BT-off lands in the second. The ring's missing enabled-true event is
real but irrelevant: `canRetry` never reads enabled state.

**Change:** `canRetry` becomes `session.phase === "failed" ||
session.phase === "disconnected"`. The disconnected-WITH-run case never
reaches this JSX (the LOST-banner surface owns it — verify with a test,
not assumption). Try again from `disconnected` runs `session.connect()`
after Phase LL's full disposal — the identical path the walk PROVED
works from this exact state (Cancel → Connect, minus the navigation).
The `:451-456` comment is rewritten: the second call site's disabled
state was the walk's F1, not belt-and-braces.

**Tests:** hook+component: drive the session to disconnected-no-run
(the walk's scenario), render the interstitial → button enabled; tap →
`connect()` called once (retryingRef still guards double-tap). The
failed-phase behavior unchanged (existing tests). A test pinning that
a disconnected phase WITH an open run renders the surface, not this
screen.

## 2. F3 — the link-lost marking on the log detail

**Read-path fact (code-verified):** the server STORES `endedBy` on POST
(`data.ts:1294`) and never returns it on any GET; no client log shape
carries it. Threading is part of this change — additive response field
only (API additive-only rule holds; no schema change, no stored-shape
change; the value already exists in the column).

**Change:** (a) the sessions GET(s) that feed the log include
`endedBy`; (b) the client log types + `storedSummary.ts` carry it
optionally; (c) `FromTheLog.tsx`'s detail header — the
`AUG 23 · 09:46 · PM5 …` region — renders, for `endedBy ===
"link-lost"` only, a marked line: `LINK LOST · the app lost the monitor
before the end` (plain words; no promise the gap was filled — the LL
copy rule; middle dot, no em-dash — house style). No other endedBy
values render anything (this spec is the lost-link surface, not an
endedBy taxonomy display).

**Tests:** storedSummary/type threading unit tests; FromTheLog client
test with a link-lost fixture (realistic stored record, not a minimal
stub — recurring failure 3) showing the line, and a finished fixture
showing nothing; a server test pinning the GET field.

## 3. Gates and sequencing, spoken

- Antagonist: SKIP — inherits phase ground, no new invariant class; F1's
  exact retry path has hardware evidence (the walk), F3 exposes a stored
  value read-only.
- PM per-PR gate: not run — not triad (no number meaning, no stored
  shape, no auth; the server change is an additive response field).
- e2e + screenshots run (both screens change); the detail screen's
  capture will genuinely change — seed a link-lost record for it only if
  an existing screenshot flow covers the detail screen (do not invent a
  new capture scenario just for this).
- One PR. After merge: v0.20.0 notes PR (F2a's both directions + this
  surface + the revived button), tag, `pnpm ios:release` — discharges
  the F3 tag tripwire and completes the cohort discharge test's second
  arm (James decides the cohort call itself).

## 4. Exit criteria — written so they can go red

1. A component test drives the walk's exact scenario (disconnected,
   no run) and taps a working Try again that reaches `connect()`.
2. A stored link-lost session's detail shows the marked line; a
   finished session's detail shows nothing new.
3. The GET response carries `endedBy` and the server test pins it.
4. e2e green on the merged tree; any capture diffs are the two changed
   screens only, opened and looked at.
