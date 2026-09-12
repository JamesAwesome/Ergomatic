// THE ONE PLACE A TEST FIXTURE GETS ITS AXES (Phase MD PR 2).
//
// `MonitorSession.axes`/`linkLoss` are derived by the hook from four fields
// the same object carries, so a hand-built fixture that sets them
// independently can say `phase: "disconnected"` and `axes.link: "up"` in one
// breath — a session no production code can produce. Every `session()`
// builder under `src/` runs its own defaults through this helper instead, so
// the two halves cannot drift; a test that genuinely wants an impossible
// pairing passes BOTH explicitly and says why.
//
// "Every builder goes through this" is a CONVENTION, not something this
// module can enforce — nothing stops a new fixture writing `axes:` by hand.
// What IS enforced is that a caller cannot override HALF the pair: the two
// fields are one answer about one session, and a hand-written `axes` beside a
// derived `linkLoss` is a combination the hook cannot publish.
import { deriveAxes, deriveLinkLoss } from "../monitor/connectedAxes";
import type { MonitorSession } from "../monitor/useMonitorSession";

export type SessionWithoutAxes = Omit<MonitorSession, "axes" | "linkLoss">;

export function withDerivedAxes(
  session: SessionWithoutAxes,
  overrides: Partial<Pick<MonitorSession, "axes" | "linkLoss">> = {},
): MonitorSession {
  if ((overrides.axes === undefined) !== (overrides.linkLoss === undefined)) {
    throw new Error(
      "withDerivedAxes: override axes and linkLoss together or neither — a half-override is a pair the hook cannot publish",
    );
  }
  const input = {
    phase: session.phase,
    frozen: session.frozen,
    runOpen: session.runOpen,
    frameSilence: session.frameSilence,
  };
  return {
    ...session,
    axes: overrides.axes ?? deriveAxes(input),
    linkLoss: overrides.linkLoss ?? deriveLinkLoss(input),
  };
}
