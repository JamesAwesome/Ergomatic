# Phase KB — The keyboard shrinks the WebView

**What and why.** With the software keyboard up on the phone, a band of the
page shows between the bottom tab bar and the keyboard, and the Library
list scrolls through it (James, 2026-09-06: _"you can see the library under
the footer"_). PR #317 painted a 140px fill under the bar for it and shipped
in v0.39.1; James found it still failing the same afternoon. The reason is
not a short fill. iOS WebKit never shrinks the fixed-position viewport when
the keyboard shows, so the bar sits behind the keyboard until the page
scrolls; after that scroll the bar is drawn at the visual viewport's bottom
and **nothing it paints below that line reaches the screen** (research doc
`2026-09-06-ios-keyboard-fixed-viewport.md`, §2: three fill mechanisms, one
clip line, zero painted pixels). This phase stops fighting the viewport and
resizes the WebView instead: `@capacitor/keyboard` with `resize: 'native'`
shrinks the native view by UIKit's keyboard frame, which makes `bottom: 0`
the real bottom and leaves no band for anything to show through. A rower
typing in the Library search sees the tab bar sitting on the keyboard,
and never the list.

**Why now.** It is a shipped regression a tester can reproduce in one tap
and one scroll, on the screen a stranger reaches first (Wave A's north
star), and the fix is one dependency, four lines of config, and one
adapter call.

**Gate class, spoken.** Not fast path: a native dependency, a change to the
shell's behaviour on every screen with a field, and a failure mode that is
a device interaction (RF19 — no gate this repo runs on Chromium can see it).
Not TRIAD: no number's meaning, no stored shape, no auth. **Antagonist:
anchor pass RUN on this spec 2026-09-06** (`/harden` lens 1; its report's
vetted ground is in the ledger entry of the same date — two BLOCKING, four
MAJOR, all folded below; **lens 2 SKIPPED, said aloud:** the only prescribed
block is the config, which lens 1 itself ran through a four-way typecheck
matrix and whose test it mutated — a second dispatch over twelve lines adds
nothing). **PM at open: SKIPPED, said aloud** — one bug, opened by James
himself, no scope or sequencing question to judge; the PM's phase-close call
is the release call in §8. **Gate 0: rendered, on the phone** (§4), because
what changes is what a rower sees under the keyboard, and #317's Gate 0 was
approved on a description and shipped a fill nobody had seen.

## 1. The mechanism, in the numbers

Full record in the research doc. The readings the design rests on, all from
James's iPhone (402×874 CSS, dpr 3) on 2026-09-06 with the probe page
(`docs/testing/2026-09-06-keyboard-probe/`):

| State | `innerHeight` | `visualViewport.height` | tab bar `rect.bottom` |
| --- | --- | --- | --- |
| Safari, keyboard up, not yet scrolled | 656 | 356 | **656** (behind the keyboard) |
| Safari, keyboard up, after a scroll | 656 | 356 | **356** (at the visual viewport's bottom; paint below it clipped) |
| v0.39.1 app, after a scroll | 874 | 498 | **498**; list visible from 500, tray ≈505..556, keyboard from 566 |

- **PRIMARY** (csswg-drafts#7475, quoted in the research doc §1.1): iOS
  _"shrink[s] the visual viewport but keep[s] the fixed position viewport
  the same size … showing the keyboard does not affect layout in any way."_
  That is the not-yet-scrolled row.
- **INFERENCE, mechanism unestablished** (anchor pass m1): after a scroll the
  bar is at the visual viewport's bottom and its paint stops there. Three
  fills with different geometry — a `::after` overflow, the fixed element's
  own 184px box, a box-shadow — all ended at that one line, and the
  scrolled capture shows page, not fill, below it. No WebKit source or bug
  names the clip; the research doc records the search. The design does not
  depend on the mechanism, only on the observation: nothing a fixed element
  paints below the visual viewport's bottom is visible.
- **The band's geometry, from the app capture, per-column pixel scan**
  (anchor pass B2 — the research doc's first decomposition was wrong): bar
  bottom 498; list content paints from 500; the ‹ › ✓ pill ≈505..556; the
  keyboard proper from 566. The UIKit keyboard frame is therefore either
  `874 − 498 = 376` (tray included) or `874 − 566 = 308` (tray excluded).
  Which one is **not established** — SECONDARY only (research §1.1) says
  included — and §4 measures it, because the design's correctness differs
  between the two (§4, item 3).

**What this falsifies.** `index.css`'s `.tabbar::after` comment (_"the bar
… sits exactly where the only API that reports a bottom says the bottom
is"_ — it sits 300px below that until a scroll), and
`docs/testing/2026-09-06-keyboard-harness.md`'s _"verified here, by hand"_
(its recorded harness was the withdrawn hide-the-bar code and never rendered
the fill). Both reconciled in this branch, with DEVIATIONS row 66. **What it
does NOT falsify** (anchor pass): that deleted comment's "the ~66px
difference is iOS's floating input-accessory bar" had the band's size right.

## 2. Decision

Install `@capacitor/keyboard@8.0.5` (peer `@capacitor/core >=8.0.0`; app is
on 8.5.0 — `npm view`, 2026-09-06) and declare, in `app/capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";
// ...
backgroundColor: "#fffdf7", // --surface
plugins: {
  CapacitorHttp: { enabled: true },
  Keyboard: {
    resize: KeyboardResize.Native,
    autoBackdropColor: "auto",
  },
},
```

Two things the paste-test settled (2026-09-06, this worktree, before the
anchor pass; the anchor pass reproduced both directions): **the string form
`resize: "native"` is NOT type-gated** — `pnpm typecheck` passed with
`"nativ"` because the plugin's `declare module "@capacitor/cli"`
augmentation only loads when something imports `@capacitor/keyboard`, and
once it does, `KeyboardResize` is a string enum to which the literal
`"native"` is not assignable (TS2322). The value import above makes a typo
fail typecheck (TS2551 on `KeyboardResize.Nativ`) and the Capacitor CLI
still loads the config (`npx cap config --json` →
`"Keyboard":{"resize":"native","autoBackdropColor":"dom"}`). And **`npx cap
sync ios` is a no-op without `dist/client`** — it errors "Could not find the
web assets directory" and leaves `Package.swift` untouched; `pnpm build`
runs first.

**And one adapter call at boot** (anchor pass B1). The plugin's `load()`
runs `self.hideFormAccessoryBar = YES;` unconditionally (`Keyboard.m:187`,
8.0.5 — present since at least 6.0.3), and the setter swizzles
`-inputAccessoryView` on `WKContentView` to return `nil` (`:373-393`). No
config key gates it. So installing the plugin removes the ‹ › ✓ tray from
every field in the app. On the numeric keypad — `SplitInput`, `Stepper`,
`DurationInput`, `ClockInput`, all `inputMode="numeric"` — that tray's ✓
is the only dismiss, so the tray comes back:

```ts
// app/src/adapters/keyboard.ts — native only, keepAwake's dynamic-import idiom
export async function restoreKeyboardAccessoryBar(): Promise<void> {
  if (!isNative()) return;
  const { nativeSetAccessoryBarVisible } = await import("../native/keyboard");
  await nativeSetAccessoryBarVisible(true); // Keyboard.setAccessoryBarVisible({ isVisible: true })
}
```

called once from `main.tsx` before render. The tab bar keeps `position:
fixed; bottom: 0` and its `env(safe-area-inset-bottom)` pad; no screen
reads `visualViewport`.

**`resize: 'native'`** — PRIMARY, the plugin's shipped source
(`Keyboard.m:356-358`, quoted in research §1.2): the WebView's own frame is
set to `window height − keyboard frame height`. With the WebView ending at
the keyboard frame's top, `innerHeight`, the fixed viewport and the visual
viewport are one height, `bottom: 0` is the visible bottom, and there is no
below-the-viewport band for the document to paint into.

**`autoBackdropColor: 'auto'` + `backgroundColor: "#fffdf7"`** — PRIMARY
(`Keyboard.m:131-143`, `definitions.d.ts:41-56`): on every
keyboard-will-show the plugin sets the UIWindow's background to the
Capacitor config's `backgroundColor`. Under `native` resize the shrunk
WebView exposes that window inside the keyboard frame — the keyboard's
rounded corners and, with the tray restored, the whole band behind the
translucent pill, directly under the tab bar. **Gate 0 build A measured
the alternative** (`'dom'`, which reads `body`'s `--page`): James, "the
corner is the wrong color" — cream against the bar's `--surface`. So the
window carries `--surface` (`theme/tokens.css`), the bar's own colour and
the colour #317 was trying to paint there. Cost, stated: on the screens
that hide the tab bar (session door, onboarding) the band reads as a
surface-coloured strip against `--page`; Gate 0's session-door and
onboarding captures show it. `backgroundColor` also sets the WKWebView's
own background (`CAPBridgeViewController.swift:308-310`), visible only
before the first paint. The window is never reset on hide
(`forceBackdropColor` has no hide-side caller) — harmless while the WebView
is the root view and covers it. `'off'` would leave UIKit's default behind
any gap.

### Options, with every cost measured or marked

| Option | Why not, or why | Evidence class |
| --- | --- | --- |
| Any CSS on `.tabbar` (the shipped `::after`, a taller box, a box-shadow) | Nothing painted below the visual viewport's bottom shows; three variants, zero pixels | MEASURED, research §2 |
| Reposition the bar from `visualViewport` at runtime | Same clip: the bar can be *placed* at the visual viewport's bottom but nothing it paints below that line shows, and the band is below that line by definition. Also the pinch-zoom cost #317 recorded (a 1.21× zoom shrinks `visualViewport.height` like a keyboard) — correctable by `scale`, but moot | MEASURED (clip); #317's zoom measurement carried |
| Hide the bar while the keyboard is up | Withdrawn at #317's branch review: removes a tested affordance (`e2e/builder.spec.ts`, "typed content survives a tab-bar exit and return") and needed the same fragile `visualViewport` read | CARRIED from #317, not re-measured |
| `resize: 'body'` | Sets `document.body`'s height by JS and never touches the WebView (`Keyboard.m:346-348`); the fixed viewport is unchanged, so the bar still lands behind the keyboard | READ from source |
| **Tray removed** (what the plugin does by itself) | Every numeric-keypad field loses its only dismiss (four components, `inputMode="numeric"`; iOS's number pad has no return key — INFERENCE from platform convention, confirmed on build A at Gate 0). Also removes the ‹ › field-hopping on the builder | READ from source + Gate 0 build A |
| **Tray restored at boot** (chosen) | Keeps every dismiss. Cost: with the tray present, where the shrunk WebView ends relative to it is the unmeasured question in §4 item 3 | READ from source; geometry at Gate 0 |
| `setAccessoryBarVisible(false)` as a deliberate choice | A no-op: `load()` already set `hideFormAccessoryBar = YES` and the setter's equality guard rejects a second `YES` (`:373-376`, `:420-427`). The only direction that does anything is `true` | READ from source |

## 3. What a rower sees

- **Library search, keyboard up, any scroll position:** the tab bar sits on
  the top of the keyboard frame. Below it is UIKit's own tray and keyboard
  over a flat `--page` backdrop; never the list. The bar is tappable, as
  before. The tray's ‹ › ✓ is present.
- **Every other field** (builder title, duration, clock and stepper inputs,
  bulk import textarea, baseline split inputs on You and on the onboarding
  doors, the session door's notes, Just Row's log) gets the same: the
  screen's bottom is the keyboard frame's top. Screens that hide the tab
  bar (session door, connected, onboarding) simply end there.
- **Keyboard dismissed:** the WebView grows back; nothing moves that did
  not move before, including the bar's 34px home-indicator pad (§4 item 4
  measures exactly this).
- **Web (Safari, Chrome on the phone; desktop):** unchanged, still shows
  the band. The web build is the harness and the fallback, never polished
  at the app's expense (CLAUDE.md, native-first). Noted in DEVIATIONS.

**Colour pairings.** No text is drawn on any new surface. The one new
adjacency is UIKit's own tray over `--surface`; the tab bar over `--surface`
with `--rule` above it is unchanged from v0.39.1. No contrast ratio changes,
so none is restated here; Gate 0's captures show the pairing at real
proportions.

## 4. Gate 0 — rendered, on the phone, before anything merges

Two Debug builds of this branch exist, signed for James's iPhone (`Kaito`),
built 2026-09-06 from the worktree: **build A** (`/tmp/kb-dev`, commit
`88fbc13b`: plugin installed, tray as the plugin leaves it — removed) and
**build B** (`/tmp/kb-dev-b`, commit `d110ed30`: the same plus the boot-time
tray restore). Each installs with `xcrun devicectl device install app
--device F193E1FA-A8AF-5413-B648-8EB802DDDCFB <App.app>`, replacing the
TestFlight build until it is reinstalled from TestFlight. James decides
when.

1. **Build A, one capture only:** You → BASELINES, tap a split input. The
   question is whether the tray is gone and, if so, whether the number pad
   offers any dismiss. This is the measured cost of the "tray removed" row.
2. **Build B, the set.** Captures, both orientations, each beside its
   v0.39.1 counterpart:
   - **Library**, search focused, scrolled so the list runs under the bar
     (the reported case; v0.39.1's side is
     `docs/testing/2026-09-06-keyboard-probe/captures/app-v0.39.1-portrait-scrolled.png`
     and its landscape twin).
   - **Builder**, title field focused (tab bar present; the field is near
     the top).
   - **You → BASELINES**, a split input focused (a field low on a scrolling
     screen; numeric keypad).
   - **Onboarding → KNOW MY BASELINE**, a split input focused (anchor pass
     M3: the one `100vh` screen that raises a keyboard; no tab bar).
   - **The session door**, notes focused (no tab bar; the bottom edge is
     bare page against the tray).
3. **Readings, keyboard up** (Safari Web Inspector attached to the device,
   or the probe page's readout logic pasted into the console). Two
   hypotheses, two expected numbers, and what each means — stated before
   reading (anchor pass B2):
   - `window.innerHeight` = **498** → UIKit's frame includes the tray; the
     WebView ends at the tray's top; the tab bar sits above the pill.
     Correct.
   - `window.innerHeight` = **566** → the frame excludes the tray; the
     WebView ends at the keyboard proper; the pill (≈505..556) overlaps
     the bar's last 44px. **Worse than today.** The fix then is to keep
     the tray removed (build A's state) and give the numeric fields a
     dismiss of their own, which is a different spec.
   - Either way: `.tabbar`'s `rect.bottom === innerHeight`, and
     `getComputedStyle(.tabbar).paddingBottom` (the safe-area pad —
     INFERENCE: `0px` while shrunk).
   - **Look, not just read:** is the ‹ › ✓ pill on screen, and does
     anything cover the tab bar?
4. **Readings, keyboard dismissed** (anchor pass M1 — `ionic-team/capacitor
   #6430` reports `env(safe-area-inset-*)` not re-evaluated after a resize,
   the pad gone until the rule is toggled): `.tabbar`'s `paddingBottom`
   back to **34px**, `innerHeight` back to **874**, on the same screen
   without navigating.
5. **Transitions** (anchor pass M2 — the WKWebView is the view controller's
   root view, `CAPBridgeViewController.swift:46`; UIKit re-lays it out on
   rotation and the plugin's `_updateFrame` re-runs only when the keyboard
   height CHANGES, `Keyboard.m:308-310`; it observes no
   `WillChangeFrame`): (a) keyboard up in portrait, **then rotate** —
   read `innerHeight` and look at the bar; (b) keyboard up, then a native
   interruption (a BLE permission sheet or the Concept2 link's
   `ASWebAuthenticationSession`), dismiss it — same reading. A WebView left
   at full height with the keyboard up reproduces today's bug; one left
   shrunk with the keyboard down is a black band. Both are one capture.
6. **Pinch-zoom with no keyboard:** the bar stays. (Nothing here reads
   `visualViewport`, so this cannot regress — captured because it is the
   affordance the withdrawn candidate lost.)

Present the set, state every number, and stop. The gate is the approval,
not the presentation.

## 5. Consequence census (what `native` resize can move)

Capacitor's own doc for `native`: _"This affects the `vh` relative unit."_
Every `vh`/`dvh` consumer in `app/src/index.css`, by selector, with
whether a keyboard can be up on that screen — **walked from each selector's
renderers through their child components** (anchor pass M3: a file-level
grep for `<input` misses inputs three components deep; `KnowBaseline.tsx`
contains no `<input` literal and renders two):

| Selector | Text input reachable? | Effect while shrunk |
| --- | --- | --- |
| `.signin` (`min-height: 90vh`) | no | none |
| `.filter-sheet` (`max-height: 80vh`) | no — `DurationRange`'s thumbs are `<button role="slider">`; its `<input` grep hit is a comment saying so | none |
| `.countdown-screen` (`100dvh`, both orientations) | no | none |
| `.timer-screen` (`100dvh`, both orientations) | no | none |
| `.connected-interstitial`, `.connected-surface` (`100dvh`) | no | none |
| **`.onb-screen`** (`min-height: 100vh`) | **yes** — `KnowBaseline.tsx` and `Recommend.tsx` render `<BaselineField>` → `SplitInput` → `<input inputMode="numeric">` | the floor drops from 874 to ~498; content taller than that is unaffected, a bottom-anchored control on a short screen moves up. Captured at Gate 0 |
| `.you-screen` (`min-height: calc(100dvh − tap − inset)`) | no — `BaselinesScreen` is its own `.screen` | none |

Every other screen with a text input renders inside a plain `.screen` in
`.app-shell`, sized by content and scrolled by the document. A shorter
WebView means a shorter scroll port and nothing else. The sixteen
`env(safe-area-inset-bottom)` consumers all pad FOR the home indicator; the
correct value while shrunk is 0 and after dismissal 34, and §4 item 4 is
the only gate that can tell a stale 0 from a correct one.

**Scroll-into-view on focus** is WebKit's own — but the plugin removes the
WebView's `UIKeyboardWillShow/WillHide/WillChangeFrame/DidChangeFrame`
observers at load (`Keyboard.m:196-199`), so whether the focused field is
still scrolled into the shrunk viewport is a Gate 0 observation, not a
claim (anchor pass m3). The plugin zeroes the scroll view's `contentInset`
on show and hide (`:206-210`).

## 6. One PR

Grouped (CLAUDE.md: one PR per coherent chunk of work), inline
implementation with the review half dispatched — James paste-tests the
result himself at Gate 0. All of it is on the branch at `d110ed30`:

- `app/package.json`: `@capacitor/keyboard` `^8.0.5` (`pnpm add` pins
  exact here; the caret is set by hand to match the other Capacitor deps).
- `app/capacitor.config.ts`: the `Keyboard` block in §2, with a comment
  citing the research doc and the two source lines.
- `app/ios/App/CapApp-SPM/Package.swift`: regenerated by `pnpm build &&
  npx cap sync ios`; one `.package(name: "CapacitorKeyboard", …)` entry and
  one `.product`, committed as generated.
- `app/src/adapters/keyboard.ts`, `app/src/native/keyboard.ts`,
  `app/src/main.tsx`: the tray restore (§2), adapter-layer only; the plugin
  lands in its own dynamic chunk (`dist/client/assets/keyboard-*.js`) and
  the main bundle is clean (`pnpm dist:grep` OK). `adapters/keyboard.test.ts`
  was red first (module missing), then green: native arm calls
  `nativeSetAccessoryBarVisible(true)` once; web arm never touches it.
- `app/src/index.css`: `.tabbar::after` and its comment deleted — dead code
  removed by the PR that proved it dead (RF29 needs no row).
- `app/e2e/design.spec.ts`: the two fill tests deleted; the one
  fill-independent invariant they carried — the bar's box ends at the
  viewport's bottom edge, both orientations — kept as "the tab bar's bottom
  edge", two-sided. Mutation `.tabbar { bottom: -10px }` → "Expected: <= 853,
  Received: 862"; restored → passed (2026-09-06, stack `ergomatic-59194`).
- `app/src/capacitorConfig.test.ts` (client project): asserts
  `plugins.Keyboard.resize === "native"`, `autoBackdropColor === "auto"`
  and `backgroundColor === "#fffdf7"`
  against independent literals (never `KeyboardResize.Native` — RF21's
  first smell). Mutation `KeyboardResize.Native` → `.Body`: "expected
  'body' to be 'native'". Its comment says why gating one hop upstream of
  the phone's `capacitor.config.json` is sound (that file is regenerated
  by `ios:build` every time).
- `docs/design/DEVIATIONS.md` row 66, `docs/testing/2026-09-06-keyboard-harness.md`:
  rewritten to the current state.
- `docs/superpowers/research/2026-09-06-ios-keyboard-fixed-viewport.md`,
  this spec, `ROADMAP.md`'s Phase KB section, the ledger entry, and the
  v0.39.1 release plan's now-superseded "authoritative for #317" line.
- Release note, rower words: _"The Library no longer shows through under
  the tab bar while you type. The keyboard now pushes the whole screen up
  instead of covering it."_ — replaces v0.39.1's second item, which
  described a fix that did not work.

## 7. Instruments (RF19)

Nothing this repo runs on Chromium can see a software keyboard, and the
2026-09-06 attempt to raise one in the iOS Simulator for a web input failed
(tap, programmatic focus and the Toggle Software Keyboard menu all left
`visualViewport.height === innerHeight`). Two instruments ship with this
change, and one risk is accepted by name:

1. **The probe page**, `docs/testing/2026-09-06-keyboard-probe/index.html`:
   reproduces the clip in any WKWebView host in under a minute with no
   build. Its four captures are the baseline readings.
2. **The dev build on the phone** for the plugin itself (§4).
3. **Accepted, named (anchor pass M4):** in production nothing observes
   whether the WebView is in the right state. A WebView left shrunk after
   the keyboard goes (upstream `capacitor-plugins#2194`, `#24`) or left
   full-height with it up (§4 item 5) is invisible to every gate here.
   The cheap detector, if Gate 0's transition steps show either: the plugin
   raises `keyboardDidHide` / `keyboardDidShow` window events; one adapter
   listener comparing `innerHeight` to the pre-keyboard height and logging
   the disagreement is under twenty lines. Not built until a capture says
   it is needed — a detector for a state nobody has seen is RF21's
   decoration.

## 8. Exit

- Gate 0 approved on the captures in §4, with every reading stated as a
  number in the PR — including which of the two `innerHeight` hypotheses
  held.
- Unit + client green; `pnpm e2e` green with the two fill tests gone, the
  bottom-edge test in, and no web capture moved (the change is native-only;
  if a web capture moves, something is wrong).
- Both mutations recorded (config test; bottom-edge test).
- The withdrawn phrasings — "already flush", "cannot be moved", "verified
  here, by hand", "verified on device in both orientations" — grepped
  across `app/src`, `docs/design`, `docs/testing`, `docs/superpowers`;
  each hit either gone or quoted as the thing being corrected.
- PM close = the release call: tester-visible, on the first screen a
  stranger types into, so **TestFlight recommended** as v0.39.2 with the
  note in §6; `git log v0.39.1..main --oneline` accounted for at the tag.
