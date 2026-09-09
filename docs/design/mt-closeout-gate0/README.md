# Phase MT close-out PR B — every failure frame, re-measured

The design gate's evidence for the two rulings James made on 2026-09-08
(`ConnectedInterstitial`'s failure frames):

1. `Row on the phone timer instead` is withheld on `unsupported-machine`.
2. The DETAIL panel no longer repeats `error.detail`.

The follow-on Gate 0 (`close-phase-mt-gate0`) measured **two** frames. Both
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
  stack, with production's own `detail`/`raw` strings. Used for the fourteen
  reasons no browser can reach.
- **`before`** — the same reconstruction of the PRE-PR render: the panel's
  duplicate `detail` line restored, and (on the refusal) the phone-timer
  button back in the stack.
- **`*-ios5`** — the five-button `permission-denied` stack. `Open Settings`
  renders only when `canOpenAppSettings()` is true, and that is `isNative()`,
  which also flips `adapters/monitorTransport.ts` onto the Capacitor arm — so
  no web render can reach this shape. The harness inserts the identical button
  node the native render emits and re-measures.

**The reconstruction is checked, not trusted.** Every one of the six real
frames is measured twice in each orientation — once as React rendered it, once
with the body replaced by `renderBody()`'s output — and the harness fails if
window, content height or headline y-range differ at all. All twelve pairs
agree exactly (see the `real`/`reconstructed` row pairs in the JSON).

## Captures

Landscape for every frame; portrait only for `unsupported-machine` and
`permission-denied`, the two whose portrait geometry changes (every other
frame's portrait window and content height are identical before and after —
only the vertically centred column shifts by ~10px). Every number for every
frame and orientation is in the JSON regardless.
