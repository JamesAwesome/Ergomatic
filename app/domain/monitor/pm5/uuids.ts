// C2 PM Bluetooth Smart service/characteristic UUIDs.
//
// Every UUID is derived from the documented base-UUID formula
// (interface-notes.md §9, BLE doc p.7):
//   "The PM's UUID is CE06xxxx-43E5-11E4-916C-0800200C9A66, where xxxx is a
//    16-bit value used to identify the specific service or characteristic."
// `xxxx` below is each service/characteristic's GATT handle, cited per
// constant against the attribute table (BLE doc pp.11-20).
//
// domain/monitor/** imports nothing from src/.

/** Builds a full 128-bit C2 PM UUID from its 16-bit handle
 *  (interface-notes.md §9). Lowercase: UUIDs are case-insensitive
 *  (RFC 4122; the doc itself prints them uppercase), and lowercase matches
 *  the `navigator.bluetooth`/`@capacitor-community/bluetooth-le` examples
 *  a later task's transports are written against. */
function pm5Uuid(handle: number): string {
  const hex = handle.toString(16).padStart(4, "0");
  return `ce06${hex}-43e5-11e4-916c-0800200c9a66`;
}

/** C2 PM Control primary service (BLE doc p.12). */
export const CONTROL_SERVICE_UUID = pm5Uuid(0x0020);
/** C2 PM receive characteristic — WRITE, control command as a CSAFE frame,
 *  up to 20 bytes (interface-notes.md §4, BLE doc p.12). */
export const RECEIVE_CHARACTERISTIC_UUID = pm5Uuid(0x0021);
/** C2 PM transmit characteristic — READ/NOTIFY, response as a CSAFE frame,
 *  up to 20 bytes (interface-notes.md §4, BLE doc p.12). */
export const TRANSMIT_CHARACTERISTIC_UUID = pm5Uuid(0x0022);

/** C2 Rowing primary service (BLE doc p.12). */
export const ROWING_SERVICE_UUID = pm5Uuid(0x0030);
/** C2 rowing general status characteristic, 19 bytes (interface-notes.md
 *  §10, BLE doc p.13). */
export const GENERAL_STATUS_UUID = pm5Uuid(0x0031);
/** C2 rowing additional status 1 characteristic, 17 bytes
 *  (interface-notes.md §10, BLE doc p.14). */
export const ADDITIONAL_STATUS_1_UUID = pm5Uuid(0x0032);
/** C2 rowing additional status 2 characteristic, 20 bytes
 *  (interface-notes.md §10, BLE doc p.14-15). */
export const ADDITIONAL_STATUS_2_UUID = pm5Uuid(0x0033);
/** C2 rowing general/additional status sample rate characteristic, 1 byte,
 *  WRITE/READ (interface-notes.md §4, BLE doc p.16). Not a CSAFE
 *  characteristic — `pm5/commands.ts`'s `buildSampleRateConfig()` writes
 *  directly to this UUID, bypassing `RECEIVE_CHARACTERISTIC_UUID`
 *  entirely. */
export const SAMPLE_RATE_UUID = pm5Uuid(0x0034);
/** C2 rowing split/interval data characteristic, 18 bytes
 *  (interface-notes.md §10, BLE doc p.19). */
export const SPLIT_INTERVAL_DATA_UUID = pm5Uuid(0x0037);
/** C2 rowing additional split/interval data characteristic, 19 bytes
 *  (interface-notes.md §10, BLE doc p.19-20). */
export const ADDITIONAL_SPLIT_INTERVAL_DATA_UUID = pm5Uuid(0x0038);
