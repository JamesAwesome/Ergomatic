# iOS WebKit, the software keyboard, and `position: fixed` (2026-09-06)

**Question.** With the software keyboard up, a strip of page paints between
the bottom tab bar and the keyboard on the phone (James's device report,
2026-09-06, Library search). PR #317 shipped a CSS fill for it that James
found still failing on v0.39.1. What is the mechanism, why could #317 not
work, and what owns the fix?

**Answer in one paragraph.** iOS WebKit does not shrink the *fixed-position*
viewport when the keyboard appears; it shrinks only the *visual* viewport.
A `bottom: 0` fixed element therefore stays behind the keyboard until a
scroll; after that scroll it is drawn at the visual viewport's bottom and
**nothing it paints below that line is visible** (observed on three
independent fill mechanisms; the mechanism behind the observation is
INFERENCE — §1.1). The band between that line and the keyboard proper
(≈505..566 CSS in the app capture, holding the ‹ › ✓ pill) is inside the
WebView, outside the visual viewport, and shows the document — that is the
strip. No CSS hung off the tab bar can fill it. The fix that survived four
device builds is the platform's own convention: hide the tab bar on the
Keyboard plugin's `keyboardWillShow`/`keyboardWillHide` events and never
resize the WebView (`resize: 'native'` was built and rejected on a
recording — §2, build C).

Prior art in this repo: none. `ls docs/superpowers/research/` (eight docs,
2026-09-06) has nothing on the keyboard or viewport, and
`grep -n -i "keyboard\|visualviewport\|accessory" ROADMAP.md` returns one
unrelated hit (line 1666). RF18 discharged.

## 1. Sources

### 1.1 The mechanism

- **PRIMARY (spec discussion by a browser engineer).**
  [w3c/csswg-drafts#7475](https://github.com/w3c/csswg-drafts/issues/7475),
  _"[css-position-3] Reinterpret viewport positioned (fixed, sticky)
  elements wrt virtual keyboard"_, opened by @flackr (Chrome), 2022-07-07.
  On iOS: _"shrink the visual viewport but keep the fixed position viewport
  the same size. As a result, elements which are fixed position to the
  top/bottom **may be scrolled out of view** (even while zoomed out).
  However, **showing the keyboard does not affect layout in any way**."_
  On Android/Chrome, for contrast: _"resizes the page to the height
  remaining after the keyboard is shown, changing the fixed position
  viewport as well as the ICB … position: fixed elements are still fully
  visible."_ No WebKit engineer speaks in the thread; the claim is a
  Chrome engineer's description of iOS, corroborated by §2 below.
- **INFERENCE, and the search that failed to source it (anchor pass m1,
  2026-09-06).** "WebKit re-anchors fixed elements to the visual viewport
  after a scroll and clips the fixed layer to it" is OUR sentence. #7475
  says fixed elements are *scrolled out of view*, not re-anchored;
  WebKit's `computeLayoutViewportRect` (`WebPageProxyIOS.mm`) feeds the
  unobscured rect into the layout viewport's size only behind
  `interactive-widget=resizes-content` (WebKit bug 259770, unshipped on
  iOS) and into its origin always; nothing in WebKit source, bugzilla or
  the CSS Viewport spec describes clipping a fixed layer. The
  OBSERVATION stands on its own — three fills, one line, page visible
  below it in `safari-scrolled.png` — and the design depends on the
  observation only.
- **SECONDARY.** Rahul Kumar, _"Mobile Safari, position: fixed and the
  virtual keyboard — an erroneous combination"_
  ([Medium](https://medium.com/@im_rahul/safari-and-position-fixed-978122be5f29)):
  Safari _"doesn't honor any `position: fixed` elements with virtual
  keyboard open, with `position: fixed` elements starting to behave like
  `position: static`."_ A blog post; it matches §2's at-rest reading and is
  cited only for that.
- **SECONDARY.** fluffy.es, _"Move view when keyboard is shown"_
  ([link](https://fluffy.es/move-view-when-keyboard-is-shown/)): _"the
  keyboard's frame.size.height includes the system's keyboard height plus
  inputAccessoryView height."_ Apple's own reference page for
  `keyboardFrameEndUserInfoKey` returned no quotable body text when
  fetched (2026-09-06), so this attribute is NOT tagged PRIMARY. §2's
  arithmetic (656 − 356 = 300 covers keyboard **and** tray in Safari;
  684 − 383 = 301 in Chrome) is consistent with it.

### 1.2 The fix's own source

`@capacitor/keyboard@8.0.5`, read from the npm tarball
(`npm view @capacitor/keyboard dist.tarball`, 2026-09-06). Peer:
`@capacitor/core >=8.0.0`; the app is on `8.5.0`.

- **PRIMARY.** `ios/Sources/KeyboardPlugin/Keyboard.m:232-234` — the
  height the plugin acts on is UIKit's:

  ```objc
  CGRect rect = [[notification.userInfo valueForKey:UIKeyboardFrameEndUserInfoKey] CGRectValue];
  double height = rect.size.height;
  ```

- **PRIMARY.** `Keyboard.m:356-358` — `resize: 'native'` shrinks the
  WebView's own frame by that height:

  ```objc
  case ResizeNative:
    [self.webView setFrame:CGRectMake(wf.origin.x, wf.origin.y,
        f.size.width - wf.origin.x, f.size.height - wf.origin.y - self.paddingBottom)];
  ```

- **PRIMARY.** `Keyboard.m:346-348` — `resize: 'body'` does NOT touch the
  WebView; it sets `document.body`'s height by JS
  (`resizeElement:@"document.body"`). The fixed viewport is unchanged under
  it, so the tab bar would still land behind the keyboard. Ruled out on
  its source, not on a guess (RF30).
- **PRIMARY.** `Keyboard.m:86-91` — the "ignore a short keyboard" cutoff
  begins `if (![self isIPad]) return NO;`. It cannot fire on iPhone.
- **PRIMARY.** `Keyboard.m:73-79, 131-155` and `dist/esm/definitions.d.ts:
  41-56` — `autoBackdropColor: 'dom'` reads
  `getComputedStyle(document.body).backgroundColor` and sets
  `UIWindow.backgroundColor` to it: _"Controls how the keyboard backdrop
  color (the area visible behind the keyboard) is set every time the
  keyboard is about to show."_ Default `'off'`. Under `resize: 'native'`
  the shrunk WebView exposes the window behind it inside the keyboard
  frame; this is what the translucent tray then sits over.
- **PRIMARY (anchor pass B1, 2026-09-06).** `Keyboard.m:187`, inside
  `load()`: `self.hideFormAccessoryBar = YES;` — unconditional, no config
  key, present in 6.0.3, 7.0.3 and 8.0.0 too (three tarballs diffed). The
  setter (`:373-393`) swizzles `-inputAccessoryView` on `WKContentView` to
  return `nil`, so INSTALLING the plugin removes the ‹ › ✓ tray from every
  field. `load()` runs at launch: `capacitor.config.json`'s
  `packageClassList` → `CapacitorBridge.init` → `registerPlugins()` →
  `loadPlugin` → `load()`. `setAccessoryBarVisible({isVisible:false})`
  (`:420-427`) is therefore a no-op (the setter's equality guard rejects a
  second `YES`); `{isVisible:true}` is the only call that does anything,
  and it restores the tray. Spec §2 makes that call at boot.
- **PRIMARY.** [capacitorjs.com/docs/apis/keyboard](https://capacitorjs.com/docs/apis/keyboard),
  `KeyboardResize.Native`: _"The whole native Web View will be resized when
  the keyboard shows/hides. This affects the `vh` relative unit."_ The
  `vh`/`dvh` census that consequence demands is in spec §5.

### 1.3 What the platform's own tab bars do

- **PRIMARY.** Ionic Framework, `core/src/components/tab-bar/tab-bar.tsx`
  (main, fetched 2026-09-06): `@State() keyboardVisible = false;`, fed by
  `createKeyboardController()` in `connectedCallback()`; render computes
  `const shouldHide = keyboardVisible && this.el.getAttribute('slot') !==
  'top';` and, when true, applies class `tab-bar-hidden` and
  `aria-hidden="true"`. The comment on the hide side: _"If the keyboard is
  hiding, then we need to wait for the webview to resize. Otherwise, the
  tab bar will flicker before the webview resizes."_ — Ionic combines
  `resize: native` WITH hiding the bar, and masks the resize by keeping the
  bar hidden until the resize lands. This app's document scrolls the page
  itself, so it needs no resize at all and takes the hide alone.
- **INFERENCE from platform convention:** UIKit tab bars are covered by the
  keyboard; no first-party iOS app shows a tab bar above a keyboard.

## 2. Measurements

All on James's iPhone (dpr 3, 402×874 CSS portrait), 2026-09-06. The probe
page is `docs/testing/2026-09-06-keyboard-probe/index.html`; the captures
are beside it. Numbers are the probe's own readout, photographed.

| Capture | Host | State | `inner` | `vv.h` | `vv.top` | `barTop..barBottom` |
| --- | --- | --- | --- | --- | --- | --- |
| `safari-at-rest.png` | Safari (in-app) | keyboard dismissed | 656 | 656 | 0 | 612..656 |
| (video frame 1, not committed) | Safari (in-app) | keyboard up, **no scroll** | 656 | 356 | 0 | 612..**656** |
| `safari-scrolled.png` | Safari (in-app) | keyboard up, **scrolled** | 656 | 356 | 300 | 312..**356** |
| `chrome-scrolled.png` | Chrome (WKWebView) | keyboard up, scrolled | 684 | 383 | 301 | 339..**383** |

What the rows say:

- **Keyboard up, no scroll:** `barBottom 656 = inner 656`. The bar is at
  the *unshrunk* fixed viewport's bottom, behind the keyboard, invisible.
  That is why the defect is not seen on the first tap — there is nothing
  on screen to look wrong. (§1.1's "does not affect layout in any way".)
- **After a scroll:** `barBottom 356 = vv.h 356`. WebKit has re-anchored
  the bar to the visual viewport. The probe's three fills (a `::after`
  overflowing the bar; a 184px box pushed 140px below the anchor, of
  which only the top 44px painted; a spread `box-shadow`) all stopped at
  this one line regardless of their own geometry. A clip at one absolute
  line is a viewport-level stop, not a per-element one. Pixel scan of the
  scrolled capture for the three fill colours: 0 red, 17 green, 23 blue
  (antialiasing noise; a 140px band would be tens of thousands) — and,
  because a translucent pill overlays the band and could tint a fill, the
  capture was also LOOKED at: the band is cream and shows `row 12`.
- **The strip is document, not fixed:** Safari's keyboard frame is
  `656 − 356 = 300`; the keyboard proper starts at WebView y≈428, so the
  tray occupies ≈356..428. That band is outside the visual viewport, still
  inside the WebView, and the document layer paints there while the fixed
  layer cannot. Same arithmetic in Chrome (`684 − 383 = 301`), whose taller
  autofill tray makes three rows of list visible through it.
- **Build C recording** (`resize: native`, `autoBackdropColor: auto`,
  tray restored; James's screen recording 2026-09-06 14:41, 6.55 s, frames
  extracted at 10 fps — not committed, the numbers are): frame 14 (before
  the tap) bar at the bottom; frames 16–20 (0.4 s) the keyboard rises with
  the bar GONE — page and cards run to the tray; frame 26 (≈0.6 s after the
  tap) the bar appears above the tray in one step. On dismiss (frames
  38–41): the bar drops to the screen's bottom instantly while the keyboard
  is still descending, invisible behind it, then shows when the keyboard
  clears. Source: `Keyboard.m:256` schedules `_updateFrame` at
  `UIKeyboardAnimationDuration + 0.2`; `:215` `setKeyboardHeight:0
  delay:0.01` on hide; neither animates. James: _"Very unsettling."_
- **Build D** (`resize: none`, hide on events, tray restored): bar goes as
  the keyboard starts to rise, returns as it starts to fall. James: _"That's
  perfect."_ Not captured; the approval is the record.
- **The app's own capture** (`app-v0.39.1-portrait-scrolled.png`, from
  James, the TestFlight build), **per-column pixel scan** (anchor pass B2
  corrected this doc's first, single-column reading, which put the tray at
  566..581): tab bar box 419..498 = 44px tabs + 34px
  `env(safe-area-inset-bottom)`; list content paints from **500**; the
  ‹ › ✓ pill occupies ≈**505..556** (a card's chip is visible at 500,
  above it); the keyboard proper from **566**. There is no boundary at
  581. So the keyboard frame UIKit reported is either `874 − 498 = 376`
  (tray included) or `874 − 566 = 308` (tray excluded) — the spec's Gate
  0 measures which. Bar bottom 498 = the visual viewport's; the shipped
  `.tabbar::after` (present in the served bundle — `pnpm build` then
  `grep -o "\.tabbar:after{[^}]*}" dist/client/assets/*.css` returns the
  rule) contributes zero painted pixels. The deleted #317 comment's "the
  ~66px difference is iOS's floating input-accessory bar" had this band's
  SIZE right.

## 3. What this falsifies in the repo

- `app/src/index.css` (#317's comment on `.tabbar::after`): _"the bar is not
  misplaced and cannot be moved down: it sits exactly where the only API
  that reports a bottom says the bottom is."_ The at-rest reading shows the
  bar 300px BELOW that bottom, behind the keyboard; only a scroll brings it
  to the visual viewport. And _"WebKit anchors fixed elements to the visual
  viewport, correctly"_ — it does, after a scroll, and then clips them to
  it, which is exactly what makes the fill impossible.
- `docs/testing/2026-09-06-keyboard-harness.md`: _"that it actually covers
  the strip is verified here, by hand"_ — the harness code recorded in that
  file is the withdrawn hide-the-bar version (`useKeyboardOpen`,
  `{!keyboardOpen && <TabBar />}`) and cannot have rendered the fill; the
  fill was never seen on a device before v0.39.1 shipped.
- `docs/design/DEVIATIONS.md` row 66 repeats both claims.

## 4. What this does not settle (rev 1's list; under `resize: none` the first four are moot — the WebView is never resized — and stand only as the record of why `native` was not the answer)

- Whether `env(safe-area-inset-bottom)` reads 0 inside a WebView whose
  frame no longer touches the screen bottom (INFERENCE: it should, and the
  bar would drop its 34px pad under the keyboard). Settled by the Gate 0
  captures in spec §4.
- Whether UIKit's keyboard frame includes the tray — i.e. whether the
  shrunk WebView ends at the tray's top (`innerHeight` 498 in the app's
  geometry) or the keyboard's (566, under which the pill would overlap the
  tab bar). §1.1's SECONDARY source says included; Apple's reference for
  `keyboardFrameEndUserInfoKey` says only _"a CGRect for identifying the
  frame rectangle of the keyboard (in the screen's coordinate space)"_;
  the plugin's own `"Ignoring QuickType Bar"` branch (`Keyboard.m:250-254`)
  implies an accessory-only frame can be reported. Gate 0 settles it, with
  both expected values written down first (spec §4 item 3).
- Whether the accessory-view swizzle takes on iOS 26's floating pill (if
  `WKContentView` no longer overrides `-inputAccessoryView`, the swizzle
  lands on `UIResponder` process-wide — the pill goes either way, or not at
  all). Build A at Gate 0.
- Whether iOS re-posts `keyboardWillShow` on rotation with the keyboard up.
  The plugin observes no `WillChangeFrame` (`Keyboard.m:191-194`), removes
  the WebView's own observers (`:196-199`), re-applies the frame only when
  the height CHANGES (`:308-310`), and the WKWebView is the view
  controller's root view (`CAPBridgeViewController.swift:46`), so a
  relayout can un-shrink it silently. Gate 0 item 5.
- Whether `ionic-team/capacitor#6430` (safe-area insets not re-evaluated
  after a resize; pad gone after the keyboard closes) reproduces on this
  iOS. Gate 0 item 4.
