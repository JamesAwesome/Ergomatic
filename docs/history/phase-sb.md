# Phase SB — A blurred strip behind the status bar (archived at close, 2026-09-06)

A RECORD, not a backlog. Merged as PR #323 on 2026-09-06 and released in v0.40.0; nothing live was left behind. The ROADMAP ledger row is the live record.

---

## Phase SB — A blurred strip behind the status bar

**Status:** Gate 0 APPROVED 2026-09-06 on build `a41f0f88`; PR #323 in
review. Opened the same day by James's capture of `← BACK` printed over
the clock on a scrolled Detail screen (v0.39.2). Spec
`docs/superpowers/specs/2026-09-06-status-bar-backdrop-design.md`. Not
TRIAD; **not fast path by James's call** ("since there are a lot of
surfaces"). **S.**

**Goal:** scrolled content passes under a blurred, page-coloured band the
height of the status bar on every screen; nothing moves at rest.

**Why it happens:** `viewport-fit=cover` + per-screen `padding-top:
env(safe-area-inset-top)` — the padding scrolls away with the page. Apple
HIG (PRIMARY): "Obscure content under the status bar … Prefer using a
scroll edge effect to place a blurred view behind the status bar."

**One PR:** `.status-backdrop` (fixed, `height: env(safe-area-inset-top)`,
`rgba` for `--page` at 82% through a 14px blur — not `color-mix`, which is
below the iOS 15.0 floor — `pointer-events: none`, z 30) rendered once in
`AppRoutes`; `UIStatusBarStyleDarkContent` in Info.plist so the glyphs stay
dark in Dark Mode; an AppRoutes test (red first) and two e2e tests, one
driving a CDP-emulated inset (height = inset; a scrolled row under it);
a DEVIATIONS row. Anchor pass RUN 2026-09-06: two BLOCKING (the
`color-mix` floor; the falsely-ruled-out CDP gate), folded.

**Gates:** antagonist anchor pass on the spec (the surface census in §4 is
the target); PM open/close SKIPPED aloud (pure UI); **Gate 0 on Kaito** —
the seven captures in spec §5 (Detail scrolled beside v0.39.2, Library
scrolled, landscape at 0px, one non-scrolling screen at rest, Releases
scrolled inside its overlay panel, Dark Mode, the half-blurred straddle)
— contrast stated as numbers.

**Exit:** Gate 0 approved; e2e green, no web capture moved; DEVIATIONS row;
rides the next tag (no release of its own).
