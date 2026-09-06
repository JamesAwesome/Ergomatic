/* v8 ignore start -- thin plugin wrapper; `haptics.test.ts` beside the
 * adapter mocks the plugin and pins the call shape. */
import { Haptics, NotificationType } from "@capacitor/haptics";

export async function nativeSuccessHaptic(): Promise<void> {
  await Haptics.notification({ type: NotificationType.Success });
}
/* v8 ignore stop */
