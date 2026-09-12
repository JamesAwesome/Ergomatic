/** A value as JSON can carry it.
 *
 *  `Sample.r` is a REQUIRED key whose value may be `undefined` (Phase MD PR
 *  3), which is what makes a sample built without spelling the rest flag a
 *  compile error while costing zero stored bytes: `JSON.stringify` drops an
 *  `undefined`-valued key. So an in-memory sample carries `r: undefined` and
 *  the SAME sample, after a trip through `localStorage` or a POST body,
 *  carries no `r` at all — and vitest's `toStrictEqual` distinguishes the
 *  two (`Object.keys`, `"r" in s` and `hasOwnProperty` all do; only
 *  `toEqual` does not).
 *
 *  Wrap the IN-MEMORY side of any assertion that compares a constructed
 *  value against one that has been through JSON. It weakens nothing a
 *  consumer can see — everything downstream of a serializer re-reads the
 *  JSON — and a missing field, a changed number or a renamed key all still
 *  red. `server/stores/contracts/storeContracts.ts` declares its own copy
 *  under the same name, because server code never imports from `src/`.
 *
 *  `undefined` passes through UNTOUCHED rather than round-tripping:
 *  `JSON.stringify(undefined)` is `undefined`, and `JSON.parse` of that
 *  throws `SyntaxError: "undefined" is not valid JSON`. `MonitorRun.series`
 *  is optional, so a caller wrapping `run.series` would otherwise crash on
 *  every run that has no trace.
 *
 *  WRAP A `series`, NEVER A WHOLE ROW. A round trip turns every `Date` into
 *  a string, so an assertion over a value carrying one fails for a reason
 *  that has nothing to do with the rest flag.
 *
 *  And NEVER use it in `handoffStoreBytes.test.ts`. That gate compares
 *  STRINGS against captured bytes, so it is already immune to the
 *  present-vs-absent distinction — and putting a JSON round-trip anywhere
 *  near it would be a way to make a byte assertion stop being about bytes. */
export function asSerialized<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
