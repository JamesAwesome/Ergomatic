# The software-keyboard instruments (2026-09-06, rewritten for Phase KB)

Nothing this repo runs on Chromium can raise an iOS software keyboard, and
jsdom has no layout at all, so what the phone shows between the tab bar and
the keyboard cannot be rendered by any automated gate we own. Two
instruments exist for it instead. Recurring failure 19: when the answer to
"which instrument would catch this if it were wrong" is none, the instrument
ships with the change — this file is that instrument's manual.

**This file's first version claimed the `.tabbar::after` fill was "verified
here, by hand."** It was not: the harness code it recorded was the withdrawn
hide-the-bar version and could not have rendered a fill, and the fill
shipped in v0.39.1 having never been seen on a device. The readings below
replace that version's table; the mechanism they show is written up in
`docs/superpowers/research/2026-09-06-ios-keyboard-fixed-viewport.md`.

## 1. The probe page (no build; any WKWebView host)

`docs/testing/2026-09-06-keyboard-probe/index.html` is a static page: a
search field, a long list, a fixed readout of `innerHeight`,
`visualViewport.height`/`offsetTop`/`scale`, `scrollY` and the bar's
`getBoundingClientRect`, and three fixed 44px bars across the bottom that
each try to paint 140px below themselves a different way (`::after`; a box
pushed below the anchor; a spread `box-shadow`). Whichever colour survives
in the strip is a mechanism that works; none did.

1. `cd docs/testing/2026-09-06-keyboard-probe && python3 -m http.server 8901`
2. `ipconfig getifaddr en0` for the Mac's LAN address.
3. On the phone, same Wi-Fi, open `http://<that address>:8901/` in Safari
   (or Chrome — same WebKit, different tray).
4. Tap the field, then **scroll the list**. The clip only appears after a
   scroll; on first focus the bar is behind the keyboard and there is
   nothing on screen to look wrong.
5. Screenshot. The readout rides just above the bars so it cannot scroll out
   of shot.

### Readings, James's iPhone (dpr 3), 2026-09-06 — `captures/`

| Capture | Host | State | `inner` | `vv.h` | `vv.top` | bar `top..bottom` |
| --- | --- | --- | --- | --- | --- | --- |
| `safari-at-rest.png` | Safari | keyboard dismissed | 656 | 656 | 0 | 612..656 |
| (video frame) | Safari | keyboard up, no scroll | 656 | 356 | 0 | 612..**656** |
| `safari-scrolled.png` | Safari | keyboard up, scrolled | 656 | 356 | 300 | 312..**356** |
| `chrome-scrolled.png` | Chrome | keyboard up, scrolled | 684 | 383 | 301 | 339..**383** |
| `app-v0.39.1-portrait-scrolled.png` | the app | keyboard up, scrolled | 874 | 498 | — | 419..**498**; list visible 498..566 |

The bar sits at `innerHeight` until a scroll, then at
`visualViewport.height`, and paints nothing below that line. The keyboard
frame (`inner − vv.h` ≈ 300) includes the accessory tray; the tray's band
(≈ 356..428 in Safari) is inside the WebView, outside the visual viewport,
and shows the document.

## 2. The dev build on the phone (the plugin itself)

`@capacitor/keyboard` only acts inside the Capacitor shell, so the fix is
checked on a real build. From the worktree's `app/`:

1. `pnpm ios:build` (bundle + `cap sync` + version stamp; export
   `GOOGLE_IOS_CLIENT_ID` or sign-in is silently dead — CLAUDE.md,
   Commands), then `pnpm ios:open` and run on the paired iPhone; or
   `pnpm ios:release` from a tag for TestFlight (`docs/RELEASING.md`).
2. Library → tap search → scroll. Expected: the tab bar's bottom edge is
   the keyboard tray's top; no list between them; the band behind the
   translucent tray is `--page`.
3. Readings, via Safari's Web Inspector attached to the device
   (Develop → the phone → Ergomatic): with the keyboard up,
   `window.innerHeight` (expected: the pre-keyboard value minus the keyboard
   frame), `document.querySelector(".tabbar").getBoundingClientRect().bottom`
   (expected: equal to `innerHeight`), and
   `getComputedStyle(document.querySelector(".tabbar")).paddingBottom` (the
   safe-area pad — expected `0px` while shrunk; INFERENCE until read).
4. Both orientations. Landscape is the one to look at hardest: ~402px of
   height minus a ~300px keyboard frame.

## 3. The simulator, and why it is not listed above

The recipe this file used to carry — a `vite` harness entry, `cap sync`,
`xcodebuild` to the simulator, `xcrun simctl io booted screenshot` — still
works for a Capacitor build, because Capacitor lets `focus()` raise the
keyboard without a tap. It is not the first instrument because two attempts
on 2026-09-06 to raise the software keyboard for a **web** page in the
simulator failed outright: a synthetic tap on the field focused it (blue
ring, `focus=q`) but `visualViewport.height` stayed equal to `innerHeight`
with *Connect Hardware Keyboard* unchecked, and I/O → Keyboard → Toggle
Software Keyboard changed nothing. The phone answers in a minute; the
simulator did not answer at all. If you do use it:

- `xcrun simctl io screenshot` always writes a portrait-shaped PNG, even in
  landscape — rotate the image (`sips -r 90`) before reading it.
- Rotating from a script needs Accessibility permission for whatever runs
  `osascript`; without it the menu click reports success and does nothing.
- A JS syntax error in a harness page is silent — it renders and nothing
  runs, and the capture looks like a legitimate no-keyboard frame.
- `cap sync` copies the harness into `ios/App/App/public`; remove it (or run
  `pnpm ios:build`) before the next real build, or the app serves the
  harness.
