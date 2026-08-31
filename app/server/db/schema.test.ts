import { describe, expect, it } from "vitest";
import { endedByEnum } from "./schema.js";
import type { EndedBy } from "../stores/logs.js";

// Whole-branch review nit: five independent copies of the "what can
// `endedBy` be" list exist across this codebase (the pgEnum here, the
// `MonitorRun.endedBy?` TS union, that field's own runtime validator,
// `server/stores/logs.ts`'s `EndedBy` type, and `server/routes/data.ts`'s
// `ENDED_BY_VALUES` request-validation array) — nothing ties them
// together, so a widened union that forgets one silently drifts.
//
// This pin ties the DB's own source of truth (the pgEnum) to the
// SERVER-SIDE TS union (`EndedBy`, `server/stores/logs.ts`) — the copy
// every other server-side list (`server/routes/data.ts`'s
// `ENDED_BY_VALUES`, cast against `EndedBy` at every use site) is already
// typed against, so pinning this one link is the cheapest single check
// that also indirectly guards those.
//
// `EXHAUSTIVE` is typed as `Record<EndedBy, true>` — TypeScript itself
// rejects a missing OR an extra key, so this object literal can only
// compile when its keys are EXACTLY `EndedBy`'s members. `Object.keys`
// then turns that COMPILE-TIME guarantee into a RUNTIME array comparable
// against the pgEnum's own `enumValues`. Widen `EndedBy` without updating
// this object: a compile error, not a silent drift. Widen the pgEnum
// without updating `EndedBy`: this test reds.
const EXHAUSTIVE: Record<EndedBy, true> = {
  finished: true,
  rower: true,
  "link-lost": true,
  "program-failed": true,
  "program-dropped": true,
  interrupted: true,
};

describe("endedByEnum (server/db/schema.ts) matches the EndedBy TS union (server/stores/logs.ts) exactly", () => {
  it("the pgEnum's own runtime values are exactly EndedBy's members — no more, no fewer", () => {
    expect(new Set(endedByEnum.enumValues)).toStrictEqual(
      new Set(Object.keys(EXHAUSTIVE)),
    );
  });
});
