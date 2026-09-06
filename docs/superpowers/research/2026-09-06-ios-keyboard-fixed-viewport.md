# iOS WebKit, the software keyboard, and `position: fixed` (2026-09-06)

**Question.** With the software keyboard up, a strip of page paints between
the bottom tab bar and the keyboard on the phone (James's device report,
2026-09-06, Library search). PR #317 shipped a CSS fill for it that James
found still failing on v0.39.1. What is the mechanism, why could #317 not
work, and what owns the fix?

**Answer in one paragraph.** iOS WebKit does not shrink the *fixed-position*
viewport when the keyboard appears; it shrinks only the *visual* viewport.
A `bottom: 0` fixed element therefore stays anchored behind the keyboard
until a scroll, at which point WebKit re-anchors it to the visual viewport
and **clips the whole fixed layer to that viewport**. UIKit's keyboard frame
includes the input-accessory tray, so the visual viewport ends at the
tray's top, while the WebView keeps painting the *document* layer down to
the keyboard proper — that ~70px is the strip. Nothing a fixed element
paints below the visual viewport's bottom reaches the screen, so no CSS
hung off the tab bar can fill it. The fix is to shrink the WebView itself
(`@capacitor/keyboard`, `resize: 'native'`), which makes the fixed viewport
and the visual viewport the same thing.

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
- **PRIMARY.** `Keyboard.m:370-392` — `setAccessoryBarVisible(false)`
  swizzles `-inputAccessoryView` on `WKContentView` to return `nil`. It
  removes the tray, and with it the ✓ that dismisses the keyboard. Not
  adopted (spec §3).
- **PRIMARY.** [capacitorjs.com/docs/apis/keyboard](https://capacitorjs.com/docs/apis/keyboard),
  `KeyboardResize.Native`: _"The whole native Web View will be resized when
  the keyboard shows/hides. This affects the `vh` relative unit."_ The
  `vh`/`dvh` census that consequence demands is in spec §5.

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
  line is a viewport clip, not a per-element one. Pixel scan of the
  scrolled capture for the three fill colours: 0 red, 17 green, 23 blue
  (antialiasing noise; a 140px band would be tens of thousands).
- **The strip is document, not fixed:** Safari's keyboard frame is
  `656 − 356 = 300`; the keyboard proper starts at WebView y≈428, so the
  tray occupies ≈356..428. That band is outside the visual viewport, still
  inside the WebView, and the document layer paints there while the fixed
  layer cannot. Same arithmetic in Chrome (`684 − 383 = 301`), whose taller
  autofill tray makes three rows of list visible through it.
- **The app's own capture** (`app-v0.39.1-portrait-scrolled.png`, from
  James, the TestFlight build): tab bar box 419..498 = 44px tabs + 34px
  `env(safe-area-inset-bottom)`, library visible 498..566, tray 566..581,
  keyboard from 581. Bar bottom 498 = the visual viewport's; the shipped
  `.tabbar::after` (present in the served bundle — `pnpm build` then
  `grep -o "\.tabbar:after{[^}]*}" dist/client/assets/*.css` returns the
  rule) contributes zero painted pixels.

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

## 4. What this does not settle

- Whether `env(safe-area-inset-bottom)` reads 0 inside a WebView whose
  frame no longer touches the screen bottom (INFERENCE: it should, and the
  bar would drop its 34px pad under the keyboard). Settled by the Gate 0
  captures in spec §4.
- The exact tray height under `resize: 'native'` — i.e. whether the shrunk
  WebView ends at the tray's top (566 in the app capture) or the keyboard's
  (581). §1.1's SECONDARY source and §2's arithmetic both say the frame
  includes the tray, so the WebView should end at 566. Gate 0 settles it.
