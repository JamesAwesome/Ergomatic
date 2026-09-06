import { useState } from "react";
import BackLink from "../shell/BackLink";
import BaselineEditor from "./BaselineEditor";
import ResetBaselineSetup from "./ResetBaselineSetup";
import RetestShortcut from "./RetestShortcut";

/**
 * `/you/baselines` — the screen behind You's BASELINES row (Gate 0,
 * 2026-09-05). Diagnostics' shape: `screen overlay-screen`, a BackLink
 * falling back to `/you`, a title.
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
    <main className="screen overlay-screen" tabIndex={0}>
      <BackLink fallback="/you" />
      <h1 className="screen-title">Baselines</h1>
      <BaselineEditor key={resetGeneration} />
      <RetestShortcut />
      <ResetBaselineSetup onReset={() => setResetGeneration((g) => g + 1)} />
    </main>
  );
}
