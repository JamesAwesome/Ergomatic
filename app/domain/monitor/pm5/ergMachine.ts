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

/**
 * THE VENDOR'S OWN TOKEN FOR A VALUE, or `undefined` when the vendor names
 * none (James, 2026-09-15: "I want to be specific when we can identify the
 * erg").
 *
 * WHY THE VENDOR'S TOKEN AND NOT A PRODUCT WORD. The enum names no value
 * "row" or "rowerg". `0` is `ERGMACHINE_TYPE_STATIC_D` — a MODEL (A-E) and a
 * RIG (static, slides, linked-dynamic) — and the enum distinguishes eleven
 * rowing configurations. Collapsing them into one invented word would be
 * LESS specific than the byte it replaces, which is the opposite of the ask.
 * A token also carries no support semantics: `STATIC_D` reads as "the enum
 * calls this STATIC_D", never as "we decided this is a rower". Whether a
 * value is ALLOWED is `unsupportedErgMachine`'s judgement, and judgements
 * belong in the `unsupported-machine` event where they already live.
 *
 * AN UNNAMED VALUE IS `undefined`, NEVER A FALLBACK. Naming an unnamed value
 * as rowing would build exactly the allowlist this module's denylist exists
 * to refuse — a RowErg model Concept2 adds after rev 1.30 must read as
 * unnamed rather than be asserted to be a rower. The gaps are real: 4, 6,
 * 9-15, 21-31, 33-63, 65-127, 129-142, 144-191, 195-206 and 208-223 are all
 * absent from the enum.
 *
 * TRANSCRIBED FROM THE DOCUMENT THAT DEFINES THE FIELD: PM5 Bluetooth Smart
 * Communication Interface Definition **rev 1.30**, Appendix A "Erg Machine
 * Type" — the same source `ergMachine.test.ts`'s own table already uses, and
 * the one whose revision history reads "Added Erg Machine Type parameter to
 * characteristic 0x0032/0x0080/" and "…to characteristic 0x0038". Implicit
 * values are expanded by C enum rules.
 *
 * **CONCEPT2 SHIPS TWO ENUMS AND THEY DISAGREE ON EXACTLY ONE NAME.** The
 * CSAFE Communication Definition rev 0.27 in this repo
 * (`docs/monitor/PM5_CSAFECommunicationDefinition.pdf`) carries the same 23
 * values and 22 of the same 23 names — but calls `32` `LINKED_DYNAMIC`,
 * where rev 1.30 calls it **`SLIDES_DYNAMIC`**. Rev 1.30 wins because it
 * defines this field; CSAFE merely also contains the type. The first draft
 * of this map was transcribed from CSAFE and pinned the one divergent value,
 * while the test file sixty lines away already had rev 1.30's name — the
 * file asserted two vendor names for one value. **Diff the two enums
 * mechanically before changing any name here; one divergence in
 * twenty-three is invisible to spot-checking.**
 *
 * A related trap, in the CSAFE document only: its
 * `ERGMACHINE_TYPE_STATIC_DYNO = 64` carries a comment reading
 * "Dynomometer, static type (32)", and 32 is a different machine entirely.
 * Rev 1.30 carries no comment on that member at all. Read assignments, never
 * parentheticals. (`UNSUPPORTED` above records a sibling oddity: 192 and 194
 * are both described as "no arms".)
 *
 * `ERGMACHINE_TYPE_NUM` (227) is a COUNT SENTINEL, not a machine, and is
 * deliberately absent.
 *
 * A MULTIERG VALUE CAN CHANGE MID-SESSION — footnote 23 on 0x003C: the value
 * names what the CURRENT INTERVAL is on. A single scalar in an export header
 * cannot say "it changed"; it reports the latest reading the log floor
 * accepted. Said here rather than left for a reader to assume stability.
 */
export type ErgMachineToken =
  | "STATIC_D"
  | "STATIC_C"
  | "STATIC_A"
  | "STATIC_B"
  | "STATIC_E"
  | "STATIC_SIMULATOR"
  | "STATIC_DYNAMIC"
  | "SLIDES_A"
  | "SLIDES_B"
  | "SLIDES_C"
  | "SLIDES_D"
  | "SLIDES_E"
  | "SLIDES_DYNAMIC"
  | "STATIC_DYNO"
  | "STATIC_SKI"
  | "STATIC_SKI_SIMULATOR"
  | "BIKE"
  | "BIKE_ARMS"
  | "BIKE_NOARMS"
  | "BIKE_SIMULATOR"
  | "MULTIERG_ROW"
  | "MULTIERG_SKI"
  | "MULTIERG_BIKE";

/** Typed as the union above, not `string`, so a mistyped token cannot
 *  compile — `"MULTIERG_SKl"` for `"MULTIERG_SKI"` is a capital-I/lowercase-l
 *  swap no reviewer sees and no spot-check catches. The compiler names it and
 *  suggests the fix. It does NOT catch a DROPPED row; the exhaustive table in
 *  `ergMachine.test.ts` does. */
const VENDOR_TOKENS: ReadonlyMap<number, ErgMachineToken> = new Map([
  [0, "STATIC_D"],
  [1, "STATIC_C"],
  [2, "STATIC_A"],
  [3, "STATIC_B"],
  [5, "STATIC_E"],
  [7, "STATIC_SIMULATOR"],
  [8, "STATIC_DYNAMIC"],
  [16, "SLIDES_A"],
  [17, "SLIDES_B"],
  [18, "SLIDES_C"],
  [19, "SLIDES_D"],
  [20, "SLIDES_E"],
  [32, "SLIDES_DYNAMIC"],
  [64, "STATIC_DYNO"],
  [128, "STATIC_SKI"],
  [143, "STATIC_SKI_SIMULATOR"],
  [192, "BIKE"],
  [193, "BIKE_ARMS"],
  [194, "BIKE_NOARMS"],
  [207, "BIKE_SIMULATOR"],
  [224, "MULTIERG_ROW"],
  [225, "MULTIERG_SKI"],
  [226, "MULTIERG_BIKE"],
]);

export function ergMachineToken(value: number): ErgMachineToken | undefined {
  return VENDOR_TOKENS.get(value);
}
