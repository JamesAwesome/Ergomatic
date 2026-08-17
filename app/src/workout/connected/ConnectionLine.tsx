// The connection indicator (design spec §2A): an 8px square plus the
// device's own advertised name, mono `--c-size-control` (13px both
// orientations) at 0.10em tracking, `--ink-2`. Filled while the link is up,
// hollow once it is lost. "It is the same caption family as every other
// label, deliberately unremarkable." (CR2 spec 3 Task 6: this used to read
// "mono 11 `--ink-3`" — the pre-redesign size this span shipped with —
// `index.css`'s own rule comment has the wiring that closed the gap.)
//
// The right-hand slot differs per pane (LIVE puts the phase status there,
// GRID composes the ordinal with the session's own time left, CR2 spec 3
// Task 5), so the caller supplies it — as a full `ReactNode`, not a plain
// string, because GRID's own composition wraps its countdown half in a
// `--marker`-gold span (`ConnectedSurface.tsx`'s own header comment has the
// reasoning for why that composition lives at the CALLER, not here: this
// component stays a dumb slot, same as `TokenRow`'s own `trailing` prop
// takes a node rather than growing a second, string-only sibling prop).
// The trailing status itself is `--c-size-status` (22/21), 0.04em, `--ink`
// — design spec §2A: "status `3 OF 12 · WORK` (mono 22, 0.04em, ink)".

import type { ReactNode } from "react";
import type { SurfaceModel } from "./surfaceModel";

export default function ConnectionLine({
  model,
  trailing = null,
}: {
  model: SurfaceModel;
  trailing?: ReactNode;
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
