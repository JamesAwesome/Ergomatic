/** RC-18 (door spec §3): the neutral caption every `?? "PM5"` fallback in
 *  this codebase used to invent — a real Concept2 monitor always advertises
 *  a `"PM5 <serial>"` name, so this literal only ever surfaces for a
 *  monitor whose advertised name was nameless (never given) or unusable
 *  (`LogSession.tsx`'s deviceName-band guard, its eighth consumer).
 *
 *  **A LEAF MODULE on purpose** (door PR A's whole-branch review, M-3).
 *  This constant used to live in `driver.ts`, beside the driver whose
 *  `capabilities.deviceName` is the fallback that actually reaches storage.
 *  That put the entire PM5 driver — CSAFE framing, the transport seam, the
 *  ring buffer — in the module graph of every READ-side consumer that only
 *  ever wanted one word: `log/storedSummary.ts` (and so `log/LogRow.tsx`,
 *  which imports `historyChipWord` from it), `session/LogSession.tsx`,
 *  `justrow/JustRow.tsx`, `workout/connected/surfaceModel.ts`. This file
 *  imports NOTHING, so it can never grow that edge back; `driver.ts`
 *  re-exports the name so its own consumers and the transports are
 *  unaffected. */
export const NAMELESS_MONITOR_CAPTION = "MONITOR";
