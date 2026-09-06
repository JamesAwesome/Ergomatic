// Phase NF: the attempt-ID mint behind the shared connection-entry owner
// (`ConnectAction.tsx`). Its own module so the component file exports only
// components (react-refresh) and so the routed Scan-NFC test can inject a
// fixed literal and assert it, unchanged, at the transport seam.
import type { ConnectionAttemptId } from "../../../domain/monitor/types.js";
import { newUuidV4 } from "../uuidV4";

let mint: () => ConnectionAttemptId = newUuidV4;

/** The same generator the logical session id uses (`uuidV4.ts`): a v4 UUID
 *  with the iOS < 15.4 fallback. */
export function mintAttemptId(): ConnectionAttemptId {
  return mint();
}

/** Test seam, behind the SAME build-time-foldable gate as the fake PM5 and
 *  the scripted NFC reader — a real deploy's build folds the body to a
 *  no-op (hardening lens 2: an ungated mutator of the real mint shipped). */
export function setAttemptIdMintForTests(
  override: (() => ConnectionAttemptId) | null,
): void {
  if (!(
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1"
  )) {
    return;
  }
  mint = override ?? newUuidV4;
}
