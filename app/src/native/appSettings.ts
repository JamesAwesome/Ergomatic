/* v8 ignore start -- device-only plugin wrapper, same boundary as native/keepAwake */
import { BleClient } from "@capacitor-community/bluetooth-le";

export async function nativeOpenAppSettings(): Promise<void> {
  await BleClient.openAppSettings();
}
/* v8 ignore stop */
