import { isNative } from "../platform";

/** Whether this platform has an app-settings door at all (the permission
 *  card's button gates on capability, not on error reason — spec §4). */
export function canOpenAppSettings(): boolean {
  return isNative();
}

/** Native: the BLE plugin's own openAppSettings, reached through the same
 *  dynamic-import idiom keepAwake.ts uses so the plugin never lands in the
 *  web bundle. Web: a no-op (the reason is unreachable there anyway). */
export async function openAppSettings(): Promise<void> {
  if (!isNative()) return;
  const { nativeOpenAppSettings } = await import("../native/appSettings");
  await nativeOpenAppSettings();
}
