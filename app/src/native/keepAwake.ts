/* v8 ignore start -- thin plugin wrapper; proven on device via TestFlight. */
import { KeepAwake } from "@capacitor-community/keep-awake";

export async function nativeKeepAwakeOn(): Promise<void> {
  await KeepAwake.keepAwake();
}

export async function nativeKeepAwakeOff(): Promise<void> {
  await KeepAwake.allowSleep();
}
/* v8 ignore stop */
