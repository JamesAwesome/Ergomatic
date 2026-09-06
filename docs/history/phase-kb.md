# Phase KB — The tab bar hides while the keyboard is up (archived verbatim from ROADMAP.md at close, 2026-09-06)

## Phase KB — The tab bar hides while the keyboard is up

**Status:** CLOSED 2026-09-06 — #321 merged (`343c3b61`), releasing as
v0.39.2. Opened the same day by James's device report on v0.39.1 ("still
failed"). Spec `docs/superpowers/specs/2026-09-06-keyboard-webview-resize-design.md`;
research `docs/superpowers/research/2026-09-06-ios-keyboard-fixed-viewport.md`.
Not TRIAD; not fast path (native dependency, device interaction). **S.**

**Goal:** with the software keyboard up, nothing shows between the tab bar
and the keyboard — on any screen with a field, at any scroll position.

**The mechanism, measured.** PR #317's `.tabbar::after` fill shipped in
v0.39.1 and paints zero pixels on the phone: iOS WebKit keeps the
fixed-position viewport unshrunk under the keyboard (the bar sits behind
it until a scroll), then re-anchors fixed elements to the visual viewport
and clips them to it. Three fill mechanisms on the probe page stopped at
one line (`barBottom 356 = visualViewport.height 356`, James's iPhone,
2026-09-06). No CSS on the bar can reach the strip. `resize: "native"`
(shrink the WebView) was built and rejected on James's recording — the
plugin applies the frame 0.2 s after the keyboard settles, unanimated, so
the bar vanished and popped ("very unsettling"). The fix that shipped is
the platform's convention: `@capacitor/keyboard` for its
`keyboardWillShow`/`WillHide` events, `resize: "none"`, and `AppRoutes`
hides the tab bar while the keyboard is up — Ionic's `ion-tab-bar` does
the same. Build D: "That's perfect."

**One PR:** the dependency and config; `adapters/keyboard.ts` +
`shell/keyboardOpen.ts` (the event subscription and the store) and the
one-boolean change in `AppRoutes`; a boot-time adapter call that puts
the keyboard's ‹ › ✓ tray back (the plugin's `load()` removes it
app-wide, and on the numeric keypad that ✓ is the only dismiss — anchor
pass B1); `.tabbar::after` and its two e2e tests deleted, the one
fill-independent invariant kept as its own test; a config test that can
go red; DEVIATIONS row 66, the keyboard-harness doc and the `index.css`
comment reconciled (all three carried the falsified "already flush with
the visual viewport" premise); the probe page and four device captures
committed under `docs/testing/2026-09-06-keyboard-probe/`.

**Gates:** antagonist anchor pass RUN 2026-09-06 (`/harden` lens 1: two
BLOCKING, four MAJOR, folded; lens 2 skipped aloud — the one prescribed
block was typecheck-matrixed and mutated by lens 1 itself); PM at open
SKIPPED (one bug, James-opened); **Gate 0 APPROVED 2026-09-06 on build
D** after A ("mostly fixed, the corner is the wrong color") and C (the
recording: "very unsettling"); the rev-1 readings (`innerHeight`, the pad
after dismiss, rotation) were struck as consequences of a resize D does
not do (spec §4). Whole-branch review carries the delta pass on the two
new mechanisms. PM close = the release call.

**Exit:** Gate 0 approved (build D); e2e green with no web capture
moved; the withdrawn phrasings — #317's AND this branch's own rev-1
("resize: native", "shrinks to the keyboard's top") — grepped out of
`app/src`, `app/e2e`, `docs/design`, `docs/testing`; one numeric-field
check on the phone (tray + ✓ on the keypad); PM close PASS WITH
CONDITIONS 2026-09-06, **v0.39.2 recommended**. **The notes PR does two
things:** the v0.39.2 item (spec §6, with the dismiss-first clause) AND
a rewrite of v0.39.1's second item in `app/src/news/content/releaseNotes.ts`,
which claims a fix that never worked and a behaviour this phase reverses
("The tabs stay available with the keyboard open") — replace with "The
gap below the tab bar while you type is not fixed in this build. v0.39.2
closes it." Then the ledger row.

