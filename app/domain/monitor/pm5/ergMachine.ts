/**
 * WHICH MACHINE IS THIS MONITOR ON, AND MAY WE RECORD IT AS A ROW?
 *
 * The PM5 fits the RowErg, the SkiErg and the BikeErg, and it tells us which
 * over BLE — `ergMachineType`, on 0x0032 (offset 16) and 0x0038 (offset 18).
 * Until Phase MT that field had no consumer anywhere in `app/src` or
 * `app/domain`, so a SkiErg connected, took a programmed workout, and stored
 * its piece as a ROW: every number internally consistent and quietly wrong
 * about what was done. Worse than the local wrongness, `server/concept2/
 * mapping.ts` posts a hardcoded `type: "rower"`, so such a row reached the
 * rower's Concept2 logbook as a rowing result.
 *
 * THE RULE, in one sentence: refuse every value the vendor NAMES as not
 * rowing; allow everything else, named or not.
 *
 * It is a DENYLIST, and the fail direction is the decision (James,
 * 2026-09-08). An allowlist over the named rowing values would also catch a
 * machine Concept2 invents after rev 1.30 — and would REFUSE a RowErg model
 * added after rev 1.30, turning a working erg into an unusable one. A false
 * refusal is total and silent-until-reported; a missed future non-rowing
 * machine leaves us exactly where we were. The asymmetry decides it, so an
 * unnamed value proceeds.
 *
 * Values are transcribed from PM5 Bluetooth Smart Communication Interface
 * Definition rev 1.30, Appendix A "Erg Machine Type" (fetched 2026-09-08 from
 * the concept2.nl mirror this repo's `docs/monitor/pm5-interface-notes.md` §1
 * already names; `pdfinfo` reports `Pages: 39`, matching that table). The
 * design spec quotes the enum verbatim.
 *
 * CORROBORATED AGAINST A FIRST-PARTY DOCUMENT, 2026-09-10. The transcription
 * above came from a MIRROR, which is the sourcing RF16's fourth corollary
 * warns about. James supplied Concept2's own CSAFE definition —
 * `docs/monitor/PM5_CSAFECommunicationDefinition.pdf`, revision 0.27 — and its
 * `OBJ_ERGMACHINETYPE_T` was compared value by value against the list below.
 * **All eight denied values match exactly**, name and number:
 * `ERGMACHINE_TYPE_STATIC_SKI = 128`, `..._STATIC_SKI_SIMULATOR = 143`,
 * `..._BIKE = 192`, `..._BIKE_ARMS` (193), `..._BIKE_NOARMS` (194),
 * `..._BIKE_SIMULATOR = 207`, `..._MULTIERG_SKI` (225), `..._MULTIERG_BIKE`
 * (226) — and `ERGMACHINE_TYPE_MULTIERG_ROW = 224` is a rower, so it proceeds.
 * Two independent documents, no divergence; this is no longer a mirror claim.
 *
 * One oddity in the vendor's own text, recorded so a future reader does not
 * take it for a transcription error of ours: the CSAFE doc's comments describe
 * BOTH 192 and 194 as "Bike, no arms type", while 193 is "Bike, arms type".
 * Immaterial here — all three are refused either way.
 *
 * ABSENCE IS NOT A REFUSAL. The field is omitted entirely below firmware
 * V1.26 (0x0032) and V1.27 (0x0038) — `parse.ts` omits the property rather
 * than setting it `undefined`, which `parse.test.ts` pins with `Object.hasOwn`
 * — and refusing on ignorance would break a working erg.
 */

/** Which unsupported machine this monitor is mounted on. The member names are
 *  what the ROWER is told, not the vendor's enum spelling: the refusal screen
 *  says "This monitor is on a SkiErg", and `dyno` names Concept2's own
 *  strength machine. */
export type UnsupportedMachine = "ski" | "bike" | "dyno";

/**
 * Every value rev 1.30 names as something other than rowing.
 *
 * `64` is the Dyno — a strength machine with no 500 m pace and nothing this
 * app models. It was absent from this map for one revision because the
 * option list that chose the fail direction bundled it with all three
 * `MULTIERG_*` values, `MULTIERG_ROW` included, which IS rowing; that bundle
 * was ours, not the vendor's grouping. Taken on its own the Dyno is named,
 * quoted, and cannot become a RowErg, so the denylist's "don't brick an
 * unnamed future RowErg" justification never applied to it (RF34: a spec that
 * states an invariant and then applies it to two of the three named
 * non-rowing machines in the enum it quoted).
 *
 * THE MULTIERG SUBFAMILY IS SPLIT, and the split is the vendor's own: rev
 * 1.30's footnote 23 on 0x003C reads "For MultiErg workouts, this will be the
 * one of the MultiErg Machine Types, which may not be the same as the
 * connected Machine" — the value names what the CURRENT INTERVAL is on. So
 * `MULTIERG_ROW` (224) is a rower and proceeds, while `MULTIERG_SKI` (225)
 * and `MULTIERG_BIKE` (226) are refused. 224 and 225 are adjacent and
 * disagree; `ergMachine.test.ts` asserts them separately for that reason.
 */
/* PHASE MT TRIGGER: this map is PUBLISHED. The "Which ergs work" section of
 * `src/news/content/bodies/connectTheMonitor.tsx` lists these machines to the
 * rower in the app's own voice, and `articles.tsx` carries a word count that
 * moves when that prose does. Adding or removing a value here reconciles both.
 * Recorded at the map rather than only beside the claim, because a staleness
 * note at the reader never reaches whoever edits the code. */
const UNSUPPORTED: ReadonlyMap<number, UnsupportedMachine> = new Map([
  [64, "dyno"], // ERGMACHINE_TYPE_STATIC_DYNO
  [128, "ski"], // ERGMACHINE_TYPE_STATIC_SKI
  [143, "ski"], // ERGMACHINE_TYPE_STATIC_SKI_SIMULATOR
  [192, "bike"], // ERGMACHINE_TYPE_BIKE
  [193, "bike"], // ERGMACHINE_TYPE_BIKE_ARMS
  [194, "bike"], // ERGMACHINE_TYPE_BIKE_NOARMS
  [207, "bike"], // ERGMACHINE_TYPE_BIKE_SIMULATOR
  [225, "ski"], // ERGMACHINE_TYPE_MULTIERG_SKI
  [226, "bike"], // ERGMACHINE_TYPE_MULTIERG_BIKE
] as const);

/**
 * `null` when this machine may be recorded as a row — including when we do not
 * know what it is.
 *
 * The parameter is REQUIRED with `null` meaning "the frame carried no such
 * field", never optional (RF33). An optional-typed input fails OPEN on
 * absence: a call site that mistypes or forgets the field proceeds silently
 * and no assertion can see it. Requiring it makes the compiler the gate, and
 * the one caller that knows the property may be omitted reads
 * `decoded.ergMachineType ?? null`.
 */
export function unsupportedErgMachine(
  value: number | null,
): UnsupportedMachine | null {
  if (value === null) return null;
  return UNSUPPORTED.get(value) ?? null;
}
