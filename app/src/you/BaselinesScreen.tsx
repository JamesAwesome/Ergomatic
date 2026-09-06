import { useState } from "react";
import BackLink from "../shell/BackLink";
import BaselineEditor from "./BaselineEditor";
import ResetBaselineSetup from "./ResetBaselineSetup";
import RetestShortcut from "./RetestShortcut";

/**
 * `/you/baselines` — the screen behind You's BASELINES row (Gate 0,
 * 2026-09-05). A BackLink falling back to `/you`, a title, then the
 * controls.
 *
 * PLAIN `.screen`, NOT the `.overlay-screen` its two sibling doors
 * (`Diagnostics.tsx`, `Concept2Screen.tsx`) use — a deliberate departure,
 * found at review. `.overlay-screen` is `position: fixed; inset: 0;
 * overflow-y: auto` (index.css), and no `.overlay-screen` in this app has
 * ever contained an `<input>`: Reader, Releases, FromTheLog, MonitorLogs,
 * Diagnostics and Concept2Screen are all read-only. This screen carries the
 * app's only typed split fields, on iOS, where a focused input inside a
 * nested fixed scroller has to be scrolled clear of the software keyboard
 * by the browser — and not one instrument we own could catch it going
 * wrong (e2e is desktop Chromium with no keyboard; jsdom has no layout; the
 * 16px zoom guard is about zoom, not occlusion). The two other screens that
 * carry typed fields, `Builder.tsx` and `LogSession.tsx`, both use plain
 * `.screen`, and so did `/you` when the editor lived there — so this keeps
 * the fields in the arrangement they have always worked in rather than
 * buying an untestable risk for a visual result the Gate 0 capture shows is
 * the same either way.
 *
 * The three controls are the ones that stood on You, in the order they stood
 * in and with their markup unchanged: the editor, then the re-test shortcut
 * (row the 6k / race the 2k), then the staged-confirm Reset baseline setup.
 * `resetGeneration` moved here WITH them — it is the editor's remount key,
 * bumped by a successful clear so the draft re-seeds from the now-empty
 * server state instead of keeping the cleared numbers on screen (Phase BL
 * PR C's reason, unchanged; only its owner moved).
 */
export default function BaselinesScreen() {
  const [resetGeneration, setResetGeneration] = useState(0);

  return (
    <main className="screen">
      <BackLink fallback="/you" />
      <h1 className="screen-title">Baselines</h1>
      <BaselineEditor key={resetGeneration} />
      <RetestShortcut />
      <ResetBaselineSetup onReset={() => setResetGeneration((g) => g + 1)} />
    </main>
  );
}
