/**
 * House utility for the driver's DEFERRED STATUS SUBSCRIPTIONS
 * (connect-latency design spec 2026-09-03, Part 1).
 *
 * `createPm5Driver` used to subscribe its nine status characteristics
 * inside the constructor. It now enqueues them once the first completed
 * CSAFE sequence is acked — or once a fallback timer on
 * `DriverOptions.schedule` fires, whichever comes first — so that the
 * program write reaches the erg at the front of the transport's queue
 * instead of behind ten calls of our own.
 *
 * Every test written before that change assumes the old timing: connect,
 * then notify. Rather than teaching ~90 of them about a seam whose subject
 * is somebody else's, they release the subscriptions at construction
 * through this helper, and the deferral itself is pinned by the dedicated
 * tests in `driver.test.ts` ("the deferred status subscriptions") plus the
 * hook's own free-row gates.
 *
 * The release works by firing the FIRST timer each driver schedules: that
 * timer is the fallback, armed as the last statement of the constructor,
 * so firing it synchronously puts the subscriptions exactly where they
 * used to be.
 */

import type { Transport } from "../../domain/monitor/types.js";
import { createPm5Driver } from "../monitor/driver";

type Schedule = (cb: () => void, ms: number) => () => void;

/**
 * Wraps a `schedule` seam so the driver's status-subscription fallback
 * fires synchronously and every LATER timer goes to `inner` — or, when a
 * caller passes none, to `setTimeout`, which is the driver's own default
 * and what those callers were already getting.
 */
export function releasingSchedule(inner?: Schedule): Schedule {
  let released = false;
  return (cb: () => void, ms: number): (() => void) => {
    if (!released) {
      released = true;
      cb();
      return (): void => undefined;
    }
    if (inner) return inner(cb, ms);
    const id = setTimeout(cb, ms);
    return (): void => {
      clearTimeout(id);
    };
  };
}

/** `createPm5Driver` with its status subscriptions released at
 *  construction — see this file's header. A caller's own `schedule` still
 *  receives every timer after the fallback. */
export function createSubscribedDriver(
  t: Transport,
  log: Parameters<typeof createPm5Driver>[1],
  options: Parameters<typeof createPm5Driver>[2] = {},
): ReturnType<typeof createPm5Driver> {
  return createPm5Driver(t, log, {
    ...options,
    schedule: releasingSchedule(options.schedule),
  });
}
