# Phase KB — The keyboard shrinks the WebView

**What and why.** With the software keyboard up on the phone, a band of the
page shows between the bottom tab bar and the keyboard, and the Library
list scrolls through it (James, 2026-09-06: _"you can see the library under
the footer"_). PR #317 painted a 140px fill under the bar for it and shipped
in v0.39.1; James found it still failing the same afternoon. The reason is
not a short fill. iOS WebKit never shrinks the fixed-position viewport when
the keyboard shows, and once the page scrolls it re-anchors fixed elements
to the visual viewport and clips them to it — so nothing the tab bar paints
below its own bottom edge can reach the screen (research doc
`2026-09-06-ios-keyboard-fixed-viewport.md`, §2: three fill mechanisms, one
clip line, zero painted pixels). This phase stops fighting the viewport and
resizes the WebView instead: `@capacitor/keyboard` with `resize: 'native'`
shrinks the native view to the keyboard's top, which makes `bottom: 0` the
real bottom and leaves no strip for anything to show through. A rower
typing in the Library search sees the tab bar sitting directly on the
keyboard tray, with plain page background behind the tray, and never the
list.

**Why now.** It is a shipped regression a tester can reproduce in one tap
and one scroll, on the screen a stranger reaches first (Wave A's north
star), and the fix is one dependency plus four lines of config.

**Gate class, spoken.** Not fast path: a native dependency, a change to the
shell's behaviour on every screen with a field, and a failure mode that is
a device interaction (RF19 — no gate this repo runs on Chromium can see it).
Not TRIAD: no number's meaning, no stored shape, no auth. **Antagonist:
anchor pass on this spec** (its premise class — what the platform owns,
what a viewport API means — is where that ledger's kills live), capped by
`/harden`. **PM at open: SKIPPED, said aloud** — one bug, opened by James
himself, no scope or sequencing question to judge; the PM's phase-close call
is the release call in §8. **Gate 0: rendered, on the phone** (§4), because
what changes is what a rower sees under the keyboard, and #317's Gate 0 was
approved on a description and shipped a fill nobody had seen.

## 1. The mechanism, in the numbers

Full record in the research doc. The three readings the design rests on,
all from James's iPhone on 2026-09-06 with the probe page
(`docs/testing/2026-09-06-keyboard-probe/`):

| State | `innerHeight` | `visualViewport.height` | tab bar `rect.bottom` |
| --- | --- | --- | --- |
| keyboard up, not yet scrolled | 656 | 356 | **656** (behind the keyboard) |
| keyboard up, after a scroll | 656 | 356 | **356** (re-anchored, clipped) |
| v0.39.1 app, after a scroll | 874 | 498 | **498**; list visible 498..566 |

- **PRIMARY** (csswg-drafts#7475, quoted in the research doc §1.1): iOS
  _"shrink[s] the visual viewport but keep[s] the fixed position viewport
  the same size … showing the keyboard does not affect layout in any way."_
- The strip is the input-accessory tray's band: UIKit's keyboard frame
  includes the tray (SECONDARY, research §1.1; consistent with
  `656 − 356 = 300` covering both), the visual viewport ends at the tray's
  top, and the WebView keeps painting the document down to the keyboard
  proper. The fixed layer stops at the visual viewport; the document layer
  does not.

**What this falsifies.** `index.css`'s `.tabbar::after` comment (_"the bar
… sits exactly where the only API that reports a bottom says the bottom
is"_), `docs/testing/2026-09-06-keyboard-harness.md`'s _"verified here, by
hand"_ (its recorded harness is the withdrawn hide-the-bar code and never
rendered the fill), and DEVIATIONS row 66, which repeats both. All three are
reconciled in this PR (§6).

## 2. Decision

Install `@capacitor/keyboard@8.0.5` (peer `@capacitor/core >=8.0.0`; app is
on 8.5.0 — `npm view`, 2026-09-06) and declare, in `app/capacitor.config.ts`:

```ts
plugins: {
  CapacitorHttp: { enabled: true },
  Keyboard: {
    resize: "native",
    autoBackdropColor: "dom",
  },
},
```

Nothing else changes in product code. No JS listens to the plugin; no
screen reads `visualViewport`; the tab bar keeps `position: fixed; bottom:
0` and its `env(safe-area-inset-bottom)` pad.

**`resize: 'native'`** — PRIMARY, the plugin's shipped source
(`Keyboard.m:356-358`, quoted in research §1.2): the WebView's own frame is
set to `window height − keyboard frame height`. With the WebView ending at
the keyboard's top, `innerHeight`, the fixed viewport and the visual
viewport are one height, `bottom: 0` is the visible bottom, and there is no
below-the-viewport band for the document to paint into.

**`autoBackdropColor: 'dom'`** — PRIMARY (`Keyboard.m:131-155`,
`definitions.d.ts:41-56`): on every keyboard-will-show the plugin reads
`getComputedStyle(document.body).backgroundColor` and paints the UIWindow
behind the WebView with it. Under `native` resize the shrunk WebView exposes
that window inside the keyboard frame, and the translucent tray sits over
it. `body { background: var(--page) }` (`index.css:90-91`), so the tray
reads over the page's own cream, in both themes, with no colour named
twice. `'auto'` would do the same here (no `backgroundColor` in the
Capacitor config to prefer) but says so less directly; `'off'` (the
default) leaves the window's own colour, which is whatever UIKit's default
is — measured at Gate 0 only if `'dom'` fails to take.

### Rejected, with the cost measured or marked

| Option | Why not | Evidence class |
| --- | --- | --- |
| Any CSS on `.tabbar` (the shipped `::after`, a taller box, a box-shadow) | Clipped at the visual viewport's bottom; three variants, zero pixels | MEASURED, research §2 |
| Reposition the bar from `visualViewport` at runtime | Same clip: the bar can be *placed* at the visual viewport's bottom but nothing it paints below that line shows, and the strip is below that line by definition. Also the pinch-zoom cost #317 recorded (a 1.21× zoom shrinks `visualViewport.height` like a keyboard) — correctable by `scale`, but moot | MEASURED (clip); #317's zoom measurement carried |
| Hide the bar while the keyboard is up | Withdrawn at #317's branch review: removes a tested affordance (`e2e/builder.spec.ts:412`, "typed content survives a tab-bar exit and return") and needed the same fragile `visualViewport` read | CARRIED from #317, not re-measured |
| `resize: 'body'` | Sets `document.body`'s height by JS and never touches the WebView (`Keyboard.m:346-348`); the fixed viewport is unchanged, so the bar still lands behind the keyboard | READ from source |
| `setAccessoryBarVisible(false)` | Removes the tray by swizzling `-inputAccessoryView` to `nil` (`Keyboard.m:370-392`) — and with it the ✓ that dismisses the keyboard from a search field. Removes an affordance to hide a symptom | READ from source |

## 3. What a rower sees

- **Library search, keyboard up, any scroll position:** the tab bar sits
  directly on the keyboard tray. Behind the tray's translucency is flat
  page background, not the list. The bar is tappable, as before.
- **Every other field** (builder title, duration and clock inputs, bulk
  import textarea, baseline split inputs, the session door's notes, Just
  Row's log) gets the same: the screen's bottom is the keyboard's top.
  Screens that hide the tab bar (session door, connected, onboarding) simply
  end at the tray.
- **Keyboard dismissed:** the WebView grows back; nothing moves that did
  not move before.
- **Web (Safari, Chrome on the phone; desktop):** unchanged, still shows
  the strip. The web build is the harness and the fallback, never polished
  at the app's expense (CLAUDE.md, native-first). Noted in DEVIATIONS.

**Colour pairings.** No text is drawn on any new surface. The one new
adjacency is UIKit's own tray over `--page`; the tab bar over `--surface`
with `--rule` above it is unchanged from v0.39.1. No contrast ratio changes,
so none is restated here; Gate 0's captures show the pairing at real
proportions.

## 4. Gate 0 — rendered, on the phone, before implementation is called done

The plugin has to be installed to render anything, and installing it IS the
implementation. So the gate is on the build, and nothing merges before James
has approved these captures:

1. A dev build of this branch on James's iPhone (`pnpm ios:build`, then
   Xcode → run on device; or `ios:release` to TestFlight if the device is
   not paired — `docs/RELEASING.md`).
2. Captures, both orientations, each beside its v0.39.1 counterpart:
   - **Library**, search focused, scrolled so the list runs under the bar
     (the reported case; the v0.39.1 side is
     `docs/testing/2026-09-06-keyboard-probe/captures/app-v0.39.1-portrait-scrolled.png`
     and its landscape twin).
   - **Builder**, title field focused (the tab bar is present; the field
     is near the top — shows the WebView shrink on a screen whose content
     is above the keyboard).
   - **You → BASELINES**, a split input focused (a field low on a scrolling
     screen).
   - **The session door**, notes focused (a screen with NO tab bar, so the
     bottom edge is bare page against the tray).
3. Readings the captures have to carry, recorded in the PR: with the
   keyboard up, `window.innerHeight` (expected: the pre-keyboard value
   minus the keyboard frame — ≈566 portrait on this phone per research
   §2), the tab bar's `rect.bottom` (expected: equal to `innerHeight`), and
   `env(safe-area-inset-bottom)` as the bar's computed `padding-bottom`
   (INFERENCE, research §4: 0 while shrunk). The probe page gives the first
   two; the third is one `getComputedStyle` in Safari's Web Inspector on
   the dev build.
4. Pinch-zoom with no keyboard: the bar stays. (Nothing in this design reads
   `visualViewport`, so this cannot regress — captured anyway because it
   is the affordance the withdrawn candidate lost.)

Present the set, state the three readings as numbers, and stop. The gate
is the approval, not the presentation.

## 5. Consequence census (what `native` resize can move)

Capacitor's own doc for `native`: _"This affects the `vh` relative unit."_
Every `vh`/`dvh` consumer in `app/src/index.css`, with whether a keyboard
can be up on that screen (a screen with no text input never shows one):

| Line | Selector | Text input on screen? | Effect while shrunk |
| --- | --- | --- | --- |
| 130 | `.signin` `min-height: 90vh` | no | none |
| 852 | `.filter-sheet` `max-height: 80vh` | no (chips; the search input is outside the sheet) | none |
| 4103, 4129 | `.countdown-screen` | no | none |
| 4307, 5108 | `.timer-screen` | no | none |
| 5887 | `.connected-interstitial` | no | none |
| 6237, 8182 | `.connected-surface` | no | none |
| 8768 | landscape sheet cap | no | none |
| 8798 | `.onb-screen` `min-height: 100vh` | no (`OptionGroup` radios) | none |
| 10024 | `.you-screen` `min-height: calc(100dvh − tap − inset)` | no (`BaselinesScreen` is its own `.screen`) | none |

Every screen that HAS a text input (`Builder`, `BulkImport`, `ClockInput`,
`DurationInput`, `Stepper`, `DurationRange`, `JustRowLog`, `Library`,
`PostWorkoutSummary`, `ReadOnlyRecording`, `BaselinesScreen`, `SplitInput`
— `grep -rln '<input\|<textarea' app/src --include='*.tsx'`, 2026-09-06)
renders inside a plain `.screen` in `.app-shell`, sized by content and
scrolled by the document. A shorter WebView means a shorter scroll port and
nothing else. The sixteen `env(safe-area-inset-bottom)` consumers all pad
FOR the home indicator; if the inset reads 0 while shrunk (research §4)
they pad 0, which is the correct answer under a keyboard. Gate 0 confirms
on the tab bar; the rest follow the same variable.

Scroll-into-view on focus is WebKit's, unchanged; the plugin additionally
zeroes the scroll view's `contentInset` on show/hide
(`Keyboard.m:206-210, 215, 258`) so no stale inset survives a dismissal.

## 6. One PR

Grouped (CLAUDE.md: one PR per coherent chunk), inline implementation with
the review half dispatched — the change is small enough that a transcriber
adds nothing, and James paste-tests the config himself at Gate 0.

- `app/package.json`: `@capacitor/keyboard` `^8.0.5` (version verified
  2026-09-06; re-verify at install).
- `app/capacitor.config.ts`: the `Keyboard` block in §2, with a comment
  citing the research doc and the two source lines.
- `app/ios/App/CapApp-SPM/Package.swift`: regenerated by `npx cap sync
  ios` ("DO NOT MODIFY THIS FILE — managed by Capacitor CLI"); the diff is
  the new package entry and product, committed as generated.
- `app/src/index.css`: delete `.tabbar::after` and its comment (dead code
  the same PR that proves it dead removes — RF29, no ROADMAP row needed
  because it does not outlive this PR).
- `app/e2e/design.spec.ts:11130-11196`: delete "the tab bar's fill below the
  fold" (two tests). They pinned a rule that no longer exists; nothing on
  Chromium can see the replacement.
- `app/src/capacitorConfig.test.ts` (client project): imports
  `capacitor.config.ts` and asserts `plugins.Keyboard.resize === "native"`
  and `autoBackdropColor === "dom"`. It gates the one thing a web test can
  reach — that the declaration is present and has not drifted. Mutation:
  `"native"` → `"body"` must fail it; the PR records the failure text. It
  proves the config, not the behaviour, and its title says so (RF26).
- `docs/design/DEVIATIONS.md` row 66: rewritten to the current state — the
  WebView resizes, the web build keeps the strip, and why.
- `docs/testing/2026-09-06-keyboard-harness.md`: rewritten around the probe
  page (§7); the Xcode recipe survives as the way to exercise the plugin
  itself, with the withdrawn-hook harness code removed.
- `docs/superpowers/research/2026-09-06-ios-keyboard-fixed-viewport.md`:
  this phase's research record (already in the branch).
- `ROADMAP.md`: this phase's section (already in the branch); the ledger
  row at close.
- Release note, rower words: _"The Library no longer shows through under
  the tab bar while you type. The keyboard now pushes the whole screen up
  instead of covering it."_ — replaces v0.39.1's second item, which
  described a fix that did not work.

## 7. Instruments (RF19)

Nothing this repo runs on Chromium can see a software keyboard, and the
2026-09-06 attempt to raise one in the iOS Simulator for a web input failed
(tap, programmatic focus and the Toggle Software Keyboard menu all left
`visualViewport.height === innerHeight`). Two instruments ship with this
change:

1. **The probe page**, `docs/testing/2026-09-06-keyboard-probe/index.html`:
   a static page with a search field, a long list, a live readout of
   `innerHeight` / `visualViewport.height` / `offsetTop` / the bar's rect,
   and three bottom bars that each try a different way of painting below
   themselves. Serve it (`python3 -m http.server 8901` in that directory),
   open it on the phone over Wi-Fi, tap, scroll, screenshot. It reproduces
   the clip in any WKWebView host in under a minute with no build. The four
   captures in `captures/` are its baseline readings.
2. **The dev build on the phone** for the plugin itself (§4). The Xcode
   simulator recipe in the harness doc is kept for the WKWebView-specific
   path — Capacitor lets `focus()` raise the keyboard there, Safari does
   not — with the probe page as its `dist/client/index.html`.

## 8. Exit

- Gate 0 approved on the captures in §4, with the three readings stated as
  numbers in the PR.
- Unit + client green; `pnpm e2e` green with the two fill tests gone and
  no other capture moved (the change is native-only; if a web capture
  moves, something is wrong).
- The config test's mutation recorded.
- DEVIATIONS row 66, the harness doc and the `index.css` comment carry no
  sentence the research doc falsifies (grep the withdrawn phrasings —
  "already flush", "cannot be moved", "verified here, by hand" — across
  `app/src`, `docs/design`, `docs/testing`; each hit reconciled).
- PM close = the release call: tester-visible, on the first screen a
  stranger types into, so **TestFlight recommended** as v0.39.2 with the
  note in §6; `git log v0.39.1..main --oneline` accounted for at the tag.
