# Phase MT close-out PR B — every failure frame, re-measured

The design gate's evidence for the two rulings James made on 2026-09-08
(`ConnectedInterstitial`'s failure frames):

1. `Row on the phone timer instead` is withheld on `unsupported-machine`.
2. The DETAIL panel no longer repeats `error.detail`.

The follow-on Gate 0 — the artifact James actually ruled on, now committed at
`docs/design/mt-followon-gate0/` (it was only ever on the
`close-phase-mt-gate0` branch when this line was written) — measured **two**
frames. Both
changes reach thirteen of the twenty `ConnectedError` reasons, so this is the
same measurement over all of them, in both orientations, before and after.

Produced by `app/e2e/gate0/mt-closeout.gate.ts` via
`app/playwright.gate0.config.ts` — not part of `pnpm e2e` (the default
`testMatch` rejects `.gate.ts`), so CI never runs it. Command, against a booted
stack:

```
cd app
REPO_ROOT=<worktree> bash -c 'source scripts/stack-env.sh >/dev/null; \
  export E2E_BASE_URL; npx playwright test --config playwright.gate0.config.ts'
```

## What is real and what is reconstructed

`variant` in every `measure-*.json` row says which.

- **`real`** — driven end to end through a supported producer. Six reasons,
  which is every reason a browser can reach: `link-failed`, `bluetooth-off`,
  `scan-dismissed`, `permission-denied` and `scan-cleanup-failed` (the arms
  `mapRadioFailure` sorts a `requestDevice` rejection into) plus
  `unsupported-machine` (the fake reports `ERGMACHINE_TYPE_STATIC_SKI` on
  0x0032 and the real driver refuses the sitting).
- **`reconstructed`** — the message column rebuilt from the reason by the
  harness's own `renderBody()`, on the real `link-failed` frame's real action
  stack, with production's own `detail`/`raw` strings. Used for EIGHT of the
  fourteen reasons no browser can reach.

  **Read the coverage precisely: 14 of the 20 reasons have a measured frame
  here, not 20.** Six are `real` and eight are `reconstructed`. The remaining
  six — `bad`, `not-ready`, `garbled`, `timeout`, `not-observed`,
  `structure-mismatch` — were NOT rendered. `nak` stands in for all seven
  machine refusals, which is legitimate because they share one headline
  ("The monitor wouldn't take it") and one panel shape, but it is a stand-in
  and is named as one here rather than left to be inferred from the file list.
  Corrects an over-claim in commit `e9892360`'s message, which said "the other
  fourteen are reconstructed" — 6 + 14 = 20, and the number of RECONSTRUCTED
  frames is eight.

  **One arm of the reconstruction is not cross-checked.** The twelve
  real/reconstructed pairs agree on every field, but none of the six real
  reasons is a machine refusal, so the branch that KEEPS the panel's detail
  line (`mt-closeout.gate.ts:344`) is validated by no real render. The product
  invariant for all seven refusals is gated at the React layer by the
  exhaustive client tests; what rests on an unchecked reconstruction is only
  `nak`'s geometry number.
- **`before`** — the same reconstruction of the PRE-PR render: the panel's
  duplicate `detail` line restored, and (on the refusal) the phone-timer
  button back in the stack.
- **`*-ios5`** — the five-button `permission-denied` stack. `Open Settings`
  renders only when `canOpenAppSettings()` is true, and at the time these
  captures were taken that was `isNative()`, which also flips
  `adapters/monitorTransport.ts` onto the Capacitor arm — so no web render
  could reach this shape. The harness inserts the identical button node the
  native render emits and re-measures.
  **SUPERSEDED, and only for future readers:** the Phase MT close-out gave
  `canOpenAppSettings()` a dev-only door, and `design.spec.ts` now drives the
  real five-button frame in a browser. These captures still came from the
  insertion described above, which is why the description stands.

**The reconstruction is checked, not trusted.** Every one of the six real
frames is measured twice in each orientation — once as React rendered it, once
with the body replaced by `renderBody()`'s output — and the harness fails if
window, content height or headline y-range differ at all. All twelve pairs
agree exactly (see the `real`/`reconstructed` row pairs in the JSON).

## Captures

**THREE LANDSCAPE PAIRS ARE BYTE-IDENTICAL BEFORE AND AFTER, AND THAT IS
CORRECT.** `scan-cleanup-failed`, `permission-denied` and
`permission-denied-ios5` have the same sha256 in both directions, because on
those frames the suppressed line sits BELOW the fold: they overflow (30, 53
and 121 px respectively), so removing content that was never visible changes
no pixel. Do not read those three pairs as "the fix did nothing" — the
portrait pair for `permission-denied` does show it, and the measured
`content`/`overflow` columns show it on all three. Named here because a
reader flipping through the landscape set would otherwise draw exactly the
wrong conclusion.

Landscape for every frame; portrait only for `unsupported-machine` and
`permission-denied`, the two whose portrait geometry changes (every other
frame's portrait window and content height are identical before and after —
only the vertically centred column shifts by ~10px). Every number for every
frame and orientation is in the JSON regardless.
