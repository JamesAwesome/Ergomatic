# Phase KB — The tab bar hides while the keyboard is up

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
clip line, zero painted pixels). This phase does what every other bottom tab
bar on iOS does under a keyboard: **it gets out of the way.** The Capacitor
Keyboard plugin's `keyboardWillShow` / `keyboardWillHide` events — UIKit's
own notifications, posted as the keyboard starts to move — hide the bar as
the keyboard rises and bring it back as it falls, and the WebView is never
resized. A rower typing in the Library search sees the keyboard come up
over the list with nothing between them, and the tab bar return the moment
the keyboard goes. Ionic's own `ion-tab-bar` does exactly this
(`tab-bar-hidden` while `keyboardVisible`, research §1.3).

**Why now.** It is a shipped regression a tester can reproduce in one tap
and one scroll, on the screen a stranger reaches first (Wave A's north
star), and the fix is one dependency plus ~50 lines in the adapter and
shell.

**How the design got here, in one paragraph** (the record matters because
each step was measured on James's phone the same day). #317's first draft
hid the bar on `visualViewport.height` and was withdrawn: a pinch-zoom fakes
that signal, and the branch review preferred keeping the bar. The fill
replaced it and painted nothing. This spec's rev 1 chose `resize: native`
(shrink the WebView), which the anchor pass hardened and Gate 0 build C
rendered — and James's recording showed the bar vanish behind the rising
keyboard and pop into place ~0.5 s after it settled, then drop behind it
again on dismiss: the plugin applies the frame `animationDuration + 0.2 s`
late in one unanimated step (`Keyboard.m:256`) and grows it instantly on
hide (`:215`). _"Very unsettling."_ Build D — hide on the plugin's events,
never resize — was his _"That's perfect."_

**Gate class, spoken.** Not fast path: a native dependency, a change to the
shell's behaviour on every screen with a field, and a failure mode that is
a device interaction (RF19). Not TRIAD. **Antagonist: anchor pass RUN
2026-09-06** on rev 1 (`/harden` lens 1; ledger entry of the same date;
lens 2 skipped aloud — the one prescribed block was typecheck-matrixed and
mutated by lens 1 itself). Its vetted ground carries to this rev where the
ground is unchanged (the clip observation, the plugin's `load()` side
effect, observer lifetime, the typecheck matrix, the web arm); the two
mechanisms this rev adds — a plugin-event subscription and a shell store —
are the class of thing a delta pass exists for and get one inside the
whole-branch review (§6), because the rev was measured on the phone before
it was reviewed. **PM at open: SKIPPED, said aloud** — one bug,
James-opened. **Gate 0: rendered on the phone and APPROVED** (§4).

## 1. The mechanism, in the numbers

Full record in the research doc. From James's iPhone (402×874 CSS, dpr 3),
2026-09-06, with the probe page (`docs/testing/2026-09-06-keyboard-probe/`):

| State | `innerHeight` | `visualViewport.height` | tab bar `rect.bottom` |
| --- | --- | --- | --- |
| Safari, keyboard up, not yet scrolled | 656 | 356 | **656** (behind the keyboard) |
| Safari, keyboard up, after a scroll | 656 | 356 | **356** (at the visual viewport's bottom; paint below it not shown) |
| v0.39.1 app, after a scroll | 874 | 498 | **498**; list visible from 500, tray ≈505..556, keyboard from 566 |

- **PRIMARY** (csswg-drafts#7475, quoted in research §1.1): iOS
  _"shrink[s] the visual viewport but keep[s] the fixed position viewport
  the same size … showing the keyboard does not affect layout in any way."_
- **INFERENCE, mechanism unestablished** (anchor pass m1): after a scroll the
  bar's paint stops at the visual viewport's bottom; three fills of different
  geometry ended at that one line. No WebKit source names it; the design
  depends only on the observation.
- **Build C, recorded** (research §2): `resize: native` leaves the bar
  behind the keyboard for the whole rise (~0.4 s) plus ~0.2 s, then moves it
  in one step; on dismiss the bar drops behind the falling keyboard at once.
  Hard-coded in the plugin, no config key.

**What this falsifies.** `index.css`'s `.tabbar::after` comment (_"the bar
… sits exactly where the only API that reports a bottom says the bottom
is"_), `docs/testing/2026-09-06-keyboard-harness.md`'s _"verified here, by
hand"_, DEVIATIONS row 66 — all reconciled in this branch. **What it does
NOT falsify** (anchor pass): that deleted comment's "~66px … accessory bar"
had the band's size right.

## 2. Decision

Install `@capacitor/keyboard@8.0.5` (peer `@capacitor/core >=8.0.0`; app on
8.5.0 — `npm view`, 2026-09-06) **for its events**, and declare:

```ts
// app/capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";
// ...
plugins: {
  CapacitorHttp: { enabled: true },
  Keyboard: { resize: KeyboardResize.None },
},
```

(The enum, not the string: the string form is unchecked at build — the
plugin's `declare module "@capacitor/cli"` augmentation only loads via an
import, and once loaded the literal is not assignable to the string enum —
while `KeyboardResize.Nativ` fails typecheck with TS2551. `npx cap sync ios`
is a no-op without `dist/client`; `pnpm build` runs first.)

Three adapter-layer pieces, each native-only through `keepAwake.ts`'s
dynamic-import idiom so the plugin never enters the web bundle:

```ts
// app/src/adapters/keyboard.ts
restoreKeyboardAccessoryBar(): Promise<void>   // boot: Keyboard.setAccessoryBarVisible({ isVisible: true })
subscribeKeyboardOpen((open: boolean) => void): () => void   // keyboardWillShow → true, keyboardWillHide → false
// app/src/shell/keyboardOpen.ts
useKeyboardOpen(): boolean   // useSyncExternalStore over one shared subscription
// app/src/shell/AppRoutes.tsx
{!hidesTabBar(location.pathname) && !keyboardOpen && <TabBar />}
```

- **The tray restore** (anchor pass B1): the plugin's `load()` runs
  `self.hideFormAccessoryBar = YES;` unconditionally (`Keyboard.m:187`;
  present since 6.0.3) and the setter swizzles `-inputAccessoryView` to
  `nil` (`:373-393`), so installing the plugin removes the ‹ › ✓ tray from
  every field. On the numeric keypad — `SplitInput`, `Stepper`,
  `DurationInput`, `ClockInput`, all `inputMode="numeric"` — that ✓ is the
  only dismiss. `setAccessoryBarVisible({isVisible:true})` is the one call
  that undoes it (`:420-427`).
- **The signal**: `keyboardWillShow` / `keyboardWillHide` are UIKit's
  `UIKeyboardWillShow/HideNotification` forwarded by the plugin
  (`Keyboard.m:191-194`, `:261`, `:217`) — posted as the keyboard starts to
  animate. It is the keyboard, not a viewport measurement, so a pinch-zoom
  cannot fake it (the defect that withdrew #317's first draft). The adapter
  unsubscribe handles a handle that resolves after the unsubscribe.
- **`resize: none`**: the WebView is never resized. `innerHeight`, `vh`,
  `env(safe-area-inset-*)`, scroll position and the document's layout are
  exactly what they were before this phase, under the keyboard and after
  it. Every consequence the rev-1 census and the anchor pass raised for a
  shrinking WebView (stale inset after dismiss, un-shrink on rotation, `vh`
  screens, the exposed window's colour) is moot by construction — there is
  no resize to go wrong.
- **`.app-shell`'s 44px bottom pad stays** while the bar is hidden: it sits
  under the keyboard, nothing moves, and the bar returns into the space it
  never gave up.

### Options, with every cost measured or marked

| Option | Outcome | Evidence |
| --- | --- | --- |
| Any CSS on `.tabbar` (the shipped `::after`, a taller box, a box-shadow) | Nothing painted below the visual viewport's bottom shows | MEASURED: three variants, zero pixels (research §2) |
| Reposition the bar from `visualViewport` | Same line; plus the pinch-zoom cost #317 measured | MEASURED (clip); #317's zoom measurement carried |
| Hide the bar on `visualViewport.height` (#317's first draft) | A 1.21× pinch-zoom crosses the threshold with no keyboard | MEASURED at #317's branch review |
| `resize: native` (rev 1, builds B/C) | Bar vanishes for the keyboard's rise + 0.2 s, then pops; drops behind it on dismiss | MEASURED: James's recording, research §2; `Keyboard.m:256`, `:215` |
| `resize: body` / `ionic` | Resize a DOM element, never the WebView; the fixed viewport is unchanged | READ, `Keyboard.m:346-353` |
| Patch the plugin to animate the frame with the keyboard | Would need a `pnpm patch` of Objective-C we then own; whether a WKWebView frame animation renders smoothly is UNTESTED | untested — not built |
| Tray removed (build A) | Numeric keypad has no dismiss | MEASURED on build A |
| **Hide the bar on the plugin's events, `resize: none` (build D)** | Bar goes as the keyboard starts to rise, returns as it starts to fall; nothing else moves | **MEASURED, approved: "That's perfect"** |

## 3. What a rower sees

- **Any field, keyboard up:** the keyboard over the page, no tab bar, the
  ‹ › ✓ tray present. Page content scrolls behind the keyboard exactly as
  before; the focused field is scrolled into view by WebKit as before.
- **Keyboard dismissed** (✓, the search key, or tapping away): the bar is
  back in its place as the keyboard starts down.
- **While typing, leaving the screen means dismissing the keyboard first.**
  This is the cost the withdrawn #317 draft was charged with, and it is the
  behaviour of every iOS tab bar. `e2e/builder.spec.ts`'s "typed content
  survives a tab-bar exit and return" runs on the web, where nothing
  changes, and still holds.
- **Web (Safari, Chrome on the phone; desktop):** unchanged — the strip is
  still there. The web build is the harness and the fallback (CLAUDE.md,
  native-first). Recorded in DEVIATIONS.

**Colour pairings.** None change. No surface is added; one is hidden.

## 4. Gate 0 — rendered on the phone, APPROVED 2026-09-06

Four Debug builds went to James's iPhone (`Kaito`) from this worktree over
the afternoon, each installed with `xcrun devicectl device install app`:

| Build | What | James |
| --- | --- | --- |
| A `88fbc13b` | plugin, `native`, `dom` backdrop, tray as the plugin leaves it | Library: bar on the keyboard, no list — "Mostly fixed. The corner is the wrong color" (`--page` behind the keyboard's rounded corner against the `--surface` bar) |
| B `d110ed30` | + tray restore | built, not installed (superseded by C) |
| C `f8befbf6` | + `--surface` backdrop | recording: the bar gone during the keyboard's rise, pops ~0.5 s later, drops behind it on dismiss — "Very unsettling" |
| **D `92c20bcf`** | **`none`, hide on events, tray restored** | **"That's perfect"** |

**What the rev-1 gate list still owed, and its disposition under D:**

- Library, both orientations — portrait APPROVED. Landscape: the same
  code path (a route rule and a boolean), nothing orientation-specific;
  not separately captured.
- Builder, Baselines, onboarding, session door — the bar's presence is one
  boolean in `AppRoutes`; screens that already hide the bar by route are
  unaffected. The numeric keypad's ✓ (tray restore) is the same code as C,
  where the tray was present.
- `innerHeight` = 498 vs 566, the pad after dismiss, rotate-with-keyboard-up,
  the `vh` screen — **all struck**: they were consequences of resizing the
  WebView, and D does not.
- Pinch-zoom with no keyboard — struck: nothing reads `visualViewport`.

## 5. Consequence census

Nothing in the document changes size, so the rev-1 `vh`/`dvh` census and
the sixteen `env(safe-area-inset-bottom)` consumers are unaffected by
construction. What DOES change is one boolean feeding `AppRoutes`, and its
consumers are:

- `TabBar` — unmounted while the keyboard is up. `TabBar`'s own state is
  per-render (it reads the route and the scroll keys on click); nothing is
  lost across an unmount (`shell/TabBar.tsx`).
- `.app-shell`'s `padding-bottom` — unchanged, so no reflow.
- The plugin still removes the WebView's own keyboard observers at load
  (`Keyboard.m:196-199`, anchor pass m3). On build D the focused field was
  scrolled into view as before (James's approval was on exactly that
  interaction). Recorded as observed, not proved.
- The web arm: `subscribeKeyboardOpen` returns a no-op unsubscribe without
  touching the plugin; `useKeyboardOpen()` is always `false`; the plugin
  lives in its own dynamic chunk (`dist/client/assets/keyboard-*.js`);
  `pnpm dist:grep` OK; main bundle has zero mentions of the events.

## 6. One PR

Grouped, inline implementation (paste-tested; James paste-tested the
result on the phone four times), with the review half dispatched: a
whole-branch review that also carries the delta-pass questions for the two
new mechanisms (the subscription's lifetime and the store's). Everything
below is on the branch:

- `app/package.json`, `pnpm-lock.yaml`: `@capacitor/keyboard` `^8.0.5`.
- `app/capacitor.config.ts`: `Keyboard: { resize: KeyboardResize.None }`.
- `app/ios/App/CapApp-SPM/Package.swift`: regenerated by `pnpm build && npx
  cap sync ios`.
- `app/src/native/keyboard.ts` (v8-ignored thin wrapper),
  `app/src/adapters/keyboard.ts`, `app/src/shell/keyboardOpen.ts`,
  `app/src/shell/AppRoutes.tsx`, `app/src/main.tsx` (the boot-time tray
  restore).
- Tests, each red before its module existed: `adapters/keyboard.test.ts`
  (restore: native calls once with `true`, web never; subscribe: native
  reports show/hide in order and unsubscribes, an unsubscribe that beats
  the plugin import opens nothing, web never fires),
  `shell/keyboardOpen.test.ts` (starts closed, follows the adapter, one
  shared subscription, unsubscribes with the last consumer, forgets an open
  keyboard once nobody is listening),
  `shell/AppRoutes.test.tsx` (bar absent on `/library` while open, back
  when closed), `capacitorConfig.test.ts` (`resize === "none"` against an
  independent literal; no backdrop keys).
- `app/src/index.css`: `.tabbar::after` and its comment deleted.
- `app/e2e/design.spec.ts`: the two fill tests deleted; "the tab bar's
  bottom edge" kept, two-sided; mutation `.tabbar { bottom: -10px }` →
  "Expected: <= 853, Received: 862"; restored → passed.
- `docs/design/DEVIATIONS.md` row 66, `docs/testing/2026-09-06-keyboard-harness.md`,
  the research doc, this spec, `ROADMAP.md`, the ledger entry, and the
  v0.39.1 release plan's superseded "authoritative for #317" line.
- Release note, rower words: _"The tab bar now gets out of the way while
  you type, so the Library no longer shows through under it. It comes back
  as soon as the keyboard goes."_ — replaces v0.39.1's second item.

## 7. Instruments (RF19)

- **The probe page**, `docs/testing/2026-09-06-keyboard-probe/index.html`:
  reproduces the clip in any WKWebView host in under a minute; its four
  captures are the baseline readings.
- **The dev build on the phone** (harness doc §2) for the plugin itself.
- **Accepted, named:** nothing in production observes the plugin's events
  arriving. If `keyboardWillHide` were ever missed, the bar would stay
  hidden until the next show/hide pair — visible immediately, recoverable
  by tapping any field. No detector; the failure is self-announcing.
- **Untested, named (branch review NIT 5):** with a hardware (Bluetooth)
  keyboard paired, iOS may post `willShow` for the shortcuts bar alone
  (INFERENCE), which would hide the tab bar though nothing covers it. Not
  measured; no height threshold added (an unmeasured cut-off is RF30's
  shape). If a tester reports it, that is the next spec's first capture.

## 8. Exit

- Gate 0 approved (§4).
- Unit + client green; `pnpm e2e` green with the two fill tests gone and
  the bottom-edge test in; no web capture moved.
- Both mutations recorded (config test; bottom-edge test).
- The withdrawn phrasings grepped out of `app/src`, `docs/design`,
  `docs/testing`, `docs/superpowers`; each hit gone or quoted as the thing
  corrected.
- PM close = the release call: tester-visible, on the first screen a
  stranger types into — **TestFlight recommended** as v0.39.2 with the note
  in §6; `git log v0.39.1..main --oneline` accounted for at the tag.
