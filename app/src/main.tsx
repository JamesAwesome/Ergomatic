import "@fontsource/newsreader/500.css";
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./theme/tokens.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { restoreKeyboardAccessoryBar } from "./adapters/keyboard";
import { applyJudgeColors, loadJudgeColors } from "./you/judgeColors";

// Native only (a no-op on the web): `@capacitor/keyboard` hides the ‹ › ✓
// tray at load, and the numeric keypad has no other dismiss — see the
// adapter. Fire-and-forget; nothing on screen waits for it.
void restoreKeyboardAccessoryBar();

// The rower's judged-colour choice, painted onto the root as four resolved
// custom properties BEFORE the first render (Phase JC, spec
// 2026-09-08-judge-colours-design.md) — module scope, not a component and
// not an effect, so no judged surface can paint a default it is about to
// replace. `loadJudgeColors` never throws (its catch is bare, on the
// research's own instruction): a throw HERE would be a white screen rather
// than a lost preference, because nothing has mounted yet.
//
// `vitest.config.ts` excludes this file from coverage entirely, so this
// line has no client instrument at all. Its only gate is the e2e reload
// leg (the seam test's leg B), which is why that leg is not optional.
applyJudgeColors(loadJudgeColors());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
