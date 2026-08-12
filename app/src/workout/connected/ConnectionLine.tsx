// The connection indicator (handoff §3): an 8px square plus the device's
// own advertised name in mono 11 `--ink-3`. Filled while the link is up,
// hollow once it is lost. "It is the same caption family as every other
// label, deliberately unremarkable."
//
// The right-hand slot differs per pane (pane B puts the interval count
// there, pane C the whole session's own time left), so the caller supplies
// it.

import type { SurfaceModel } from "./surfaceModel";

export default function ConnectionLine({
  model,
  trailing = null,
}: {
  model: SurfaceModel;
  trailing?: string | null;
}) {
  return (
    <div className="connected-line">
      <span
        className={
          model.linked
            ? "connected-line-mark"
            : "connected-line-mark connected-line-mark-hollow"
        }
        aria-hidden="true"
      />
      <span className="connected-line-device">{model.deviceCaption}</span>
      {trailing !== null && (
        <span className="connected-line-trailing">{trailing}</span>
      )}
    </div>
  );
}
