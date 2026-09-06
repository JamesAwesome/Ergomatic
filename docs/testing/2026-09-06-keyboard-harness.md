# The software-keyboard harness (2026-09-06)

`.tabbar::after` (`app/src/index.css`) exists because of a quantity **no
gate this repo owns can produce**: the band iOS paints behind its floating
input-accessory bar with the software keyboard up. Playwright runs desktop
Chromium with no keyboard, and jsdom has no layout at all, so the strip this
fix covers cannot be rendered by any automated check we have. The e2e suite
asserts the fill EXISTS, is anchored to the bar's bottom edge, carries the
bar's surface and costs the document no height; that it actually covers the
strip is verified here, by hand.

Recurring failure 19 says that when the answer to "which instrument would
catch this if it were wrong" is none, the instrument ships with the change.
This file is that instrument: a recipe, not live code, because the harness
needs a `vite` entry and an Xcode build that would otherwise have to earn
their keep in CI for a check that runs by hand a few times a year.

It renders the **shipped** `TabBar` and the **shipped** stylesheet in the
**real** Capacitor WKWebView. No auth and no API: that is the whole point —
the defect lives in the shell, not in any screen's data.

## What it measured, 2026-09-06 (iPhone 17 Pro simulator, iOS 26.5)

| Reading | Keyboard closed | Keyboard open |
| --- | --- | --- |
| `window.innerHeight` | 874 | 874 |
| `visualViewport.height` | 874 | 498 |
| `visualViewport.offsetTop` | 0 | 376 (after scrolling) |
| tab bar `rect.bottom` | 874 | 498 |
| where the keyboard really starts | — | ≈564 |

The last two rows are the finding: the bar is ALREADY flush with the bottom
`visualViewport` reports, and the ~66px below it is iOS's floating
input-accessory bar, which is excluded from that viewport while the page
still paints behind it. Repositioning was tried against these numbers and
moved nothing.

**A withdrawn candidate, recorded so it is not re-proposed.** The first fix
hid the tab bar whenever `innerHeight - visualViewport.height` passed a
150px threshold. It was approved at Gate 0 and withdrawn at the branch
review for two reasons. `visualViewport.height` is reported in CSS pixels,
so a pinch-zoom shrinks it exactly the way a keyboard does — measured in
Chromium at a 390x874 viewport, a 1.21x zoom produced a 151.7px delta and
removed the whole main navigation with no keyboard anywhere (correctable by
multiplying by `visualViewport.scale`, which the candidate did not read).
And the tab bar is genuinely usable with the keyboard up — it sits ABOVE the
accessory bar — so hiding it removed an affordance `e2e/builder.spec.ts`
already tests ("typed content survives a tab-bar exit and return"). Painting
the band needs no runtime state and has neither failure mode.

## Running it

1. `xcrun simctl boot "iPhone 17 Pro"` and `open -a Simulator`.
2. Simulator menu: **I/O > Keyboard**, make sure *Connect Hardware Keyboard*
   is UNCHECKED, or `focus()` raises no software keyboard and every capture
   is a false pass.
3. Write the two files below into `app/kbd-harness/`.
4. `cd app && npx vite build --config kbd-harness/vite.config.ts`
5. `npx cap sync ios`
6. `cd ios/App && xcodebuild -project App.xcodeproj -scheme App \
   -configuration Debug -destination "platform=iOS Simulator,id=<UDID>" \
   -derivedDataPath /tmp/kbd-dd CODE_SIGNING_ALLOWED=NO build`
7. `xcrun simctl install booted /tmp/kbd-dd/Build/Products/Debug-iphonesimulator/App.app`
   then `xcrun simctl launch booted haus.waffle.ergomatic`
8. `xcrun simctl io booted screenshot shot.png` after ~10s. The harness
   focuses the field and scrolls on its own.
9. `rm -rf app/kbd-harness app/dist/client app/ios/App/App/public` when
   done. The third path matters: step 5's `cap sync` already copied the
   harness bundle into the native project, and removing only the first two
   leaves the app serving the harness until the next `ios:build`.

## Three traps, all of which cost a capture here

- **`xcrun simctl io screenshot` always writes a portrait-shaped file**, even
  in landscape. Do not test orientation by reading the PNG's dimensions —
  rotate the image (`sips -r 90`) and look at it.
- **Rotating the simulator from a script needs Accessibility permission**
  for whatever runs `osascript`. Without it the menu click reports success
  and does nothing.
- **A JS syntax error in the harness is silent** — the page renders, nothing
  runs, and the capture looks like a legitimate "no keyboard" frame. Parse
  the built bundle before trusting a shot. Three landscape captures were
  thrown away to a raw newline inside a string literal.

## `app/kbd-harness/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
});
```

## `app/kbd-harness/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>keyboard harness</title>
  </head>
  <body><div id="root"></div><script type="module" src="/main.tsx"></script></body>
</html>
```

## `app/kbd-harness/main.tsx`

The harness below still mounts `TabBar` inside an `.app-shell`, which is all
the fill needs. Drop the `useKeyboardOpen` import and its call if you paste
it from this file's history.

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "../../src/theme/tokens.css";
import "../../src/index.css";
import TabBar from "../../src/shell/TabBar";
import { useKeyboardOpen } from "../../src/shell/keyboardOpen";

function Harness() {
  // The SHIPPED hook and the SHIPPED TabBar, composed exactly as
  // AppRoutes composes them.
  const keyboardOpen = useKeyboardOpen();
  return (
    <div className="app-shell">
      <main className="screen">
        <h1 className="screen-title">Library</h1>
        <div className="library-filter-bar">
          <div className="library-search">
            <input
              id="q"
              type="search"
              className="library-search-input"
              placeholder="SEARCH BY NAME"
              aria-label="Search by name"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </div>
        </div>
        {Array.from({ length: 40 }, (_, i) => (
          <a className="workout-row" href="#" key={i}>
            <div className="workout-row-head">
              <span className="workout-title">Workout {i + 1}</span>
              <span className="workout-duration">2{i % 9}&prime;</span>
            </div>
            <p className="workout-summary">
              4 &times; 1200m @ 6K+10 &middot; 1&prime; REST
            </p>
          </a>
        ))}
      </main>
      {!keyboardOpen && <TabBar />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter initialEntries={["/library"]}>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
);

window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("q")!.focus();
    setTimeout(() => window.scrollTo(0, 1400), 1500);
  }, 500);
});
```
