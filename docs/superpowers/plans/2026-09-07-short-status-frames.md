# Short status frames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a PM5 on pre-2018 firmware usable, by accepting the 16-byte
`0x0032` and 18-byte `0x0038` frames it sends instead of discarding them over a
trailing byte no consumer reads.

**Architecture:** Two parsers lower their length floor to the highest byte they
actually consume, and read the trailing `Erg Machine Type` only when it is
present, OMITTING the property otherwise. The encoders gain an explicit
short-form flag so the fake can drive a whole pre-2018 session, which is what
lets one test start upstream of the break. Nothing else moves: the driver's
frame gate, the other seven parsers, and every consumer stay exactly as they
are.

**Tech Stack:** TypeScript 6 (strict), Vitest, pnpm. All commands run in `app/`.

**Spec:** `docs/superpowers/specs/2026-09-07-short-status-frames-design.md` (rev 2)

## Global Constraints

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-as1`,
  branch `as1-short-frame`. Run `git rev-parse --show-toplevel` before EVERY
  commit and confirm it prints that path.
- **`app/domain/**` imports nothing from `src/`.** These parsers are domain code.
- **Failing test first, every task.** Run it and see it fail before implementing.
- **Commit the real change BEFORE any mutation probe** (recurring failure 22),
  confirm the commit landed with `git log -1`, and confirm each mutation anchor
  string is unique with `grep -c` before editing it.
- **Scoped test command.** `pnpm test --project unit` for domain work.
  For a single file:
  `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit <file>`
  — the bare `pnpm exec vitest` form drops the flag `package.json` sets and
  produces mass false failures.
- **Do not run `prettier --write` on root markdown.** `ROADMAP.md` and
  `CLAUDE.md` are not Prettier-managed; it reflows the whole file.
- **The two floors, exact:** `0x0032` = 16 bytes, `0x0038` = 18 bytes. Derived
  from the highest byte each parser consumes (15 and 17 respectively).

---

### Task 1: The parsers accept a short frame

**Files:**
- Modify: `app/domain/monitor/pm5/parse.ts:142-172` (0x0032), `:245-283` (0x0038)
- Modify: `app/domain/monitor/pm5/statusFrames.ts:208`, `:258` (keep typecheck green)
- Test: `app/domain/monitor/pm5/parse.test.ts:529-586`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AdditionalStatus1.ergMachineType?: number` and
  `AdditionalSplitIntervalData.ergMachineType?: number`, both optional.
  `parseAdditionalStatus1(bytes: Uint8Array)` and
  `parseAdditionalSplitIntervalData(bytes: Uint8Array)` keep their signatures
  and their `| { error: Pm5ParseError }` return.

- [ ] **Step 1: Write the failing tests**

Add to `parse.test.ts`, inside the existing
`describe("length guards (M3) …")` block:

```ts
  it("0x0032: a 16-byte pre-V1.26 frame decodes, with ergMachineType ABSENT (not undefined)", () => {
    const long = buildAdditionalStatus1Bytes({
      elapsedSeconds: 12.34,
      speedMetersPerSecond: 3.456,
      spm: 22,
      heartRateBpm: 142,
      currentSplit: 111.5,
      averageSplit: 113.25,
      restDistanceMeters: 64,
      restSeconds: 59.5,
      ergMachineType: 0,
    });
    expect(long.length).toBe(17);
    const short = long.slice(0, 16);

    const decoded = parseAdditionalStatus1(short);
    expect("error" in decoded).toBe(false);
    const ok = decoded as AdditionalStatus1;

    // Every CONSUMED field is identical to the long form's decode.
    const fromLong = parseAdditionalStatus1(long) as AdditionalStatus1;
    for (const k of [
      "elapsedSeconds",
      "speedMetersPerSecond",
      "spm",
      "heartRateBpm",
      "currentSplit",
      "averageSplit",
      "restDistanceMeters",
      "restSeconds",
    ] as const) {
      expect(ok[k]).toStrictEqual(fromLong[k]);
    }

    // KEY ABSENCE, not `undefined`. `readU8` is `bytes[offset]!` and neither
    // noUncheckedIndexedAccess nor exactOptionalPropertyTypes is set, so a
    // half-fix that lowers the floor and leaves the read UNGUARDED also
    // yields `undefined` here. Only absence tells the two apart.
    expect(Object.hasOwn(ok, "ergMachineType")).toBe(false);
  });

  it("0x0038: an 18-byte pre-V1.27 frame decodes, with ergMachineType ABSENT (not undefined)", () => {
    const long = buildAdditionalSplitIntervalDataBytes({
      elapsedSeconds: 20.5,
      splitIntervalAvgStrokeRate: 24,
      splitIntervalWorkHeartRateBpm: 150,
      splitIntervalRestHeartRateBpm: 120,
      splitIntervalAvgPace: 113.4,
      splitIntervalTotalCalories: 73,
      splitIntervalAvgCalories: 840,
      splitIntervalSpeedMetersPerSecond: 4.321,
      splitIntervalPowerWatts: 157,
      splitAvgDragFactor: 121,
      splitIntervalNumber: 1,
      ergMachineType: 0,
    });
    expect(long.length).toBe(19);
    const short = long.slice(0, 18);

    const decoded = parseAdditionalSplitIntervalData(short);
    expect("error" in decoded).toBe(false);
    const ok = decoded as AdditionalSplitIntervalData;
    const fromLong = parseAdditionalSplitIntervalData(
      long,
    ) as AdditionalSplitIntervalData;
    for (const k of [
      "elapsedSeconds",
      "splitIntervalAvgStrokeRate",
      "splitIntervalWorkHeartRateBpm",
      "splitIntervalRestHeartRateBpm",
      "splitIntervalAvgPace",
      "splitIntervalTotalCalories",
      "splitIntervalAvgCalories",
      "splitIntervalSpeedMetersPerSecond",
      "splitIntervalPowerWatts",
      "splitAvgDragFactor",
      "splitIntervalNumber",
    ] as const) {
      expect(ok[k]).toStrictEqual(fromLong[k]);
    }
    expect(Object.hasOwn(ok, "ergMachineType")).toBe(false);
  });

  it("below the pre-addition floor is STILL a typed error, naming the new floor", () => {
    expect(parseAdditionalStatus1(new Uint8Array(15))).toStrictEqual({
      error: { characteristic: "0x0032", expected: 16, actual: 15 },
    });
    expect(parseAdditionalSplitIntervalData(new Uint8Array(17))).toStrictEqual({
      error: { characteristic: "0x0038", expected: 18, actual: 17 },
    });
  });
```

Add whatever of `AdditionalStatus1`, `AdditionalSplitIntervalData`,
`buildAdditionalStatus1Bytes`, `buildAdditionalSplitIntervalDataBytes` the file
does not already import.

- [ ] **Step 2: Run the tests and watch them fail**

```
cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/monitor/pm5/parse.test.ts
```

Expected: the two decode tests FAIL with the parser returning
`{ error: { characteristic: "0x0032", expected: 17, actual: 16 } }`, and the
floor test FAILS on `expected: 17` vs `16`.

- [ ] **Step 3: Lower the two floors and guard the trailing reads**

In `parse.ts`, above `parseAdditionalStatus1`:

```ts
/** The pre-V1.26 length of 0x0032. `Erg Machine Type` was APPENDED to this
 *  characteristic in interface-definition revision V1.26 (2018-11-02, rev 1.30
 *  Table 1, verbatim: "Added Erg Machine Type parameter to characteristic
 *  0x0032/0x0080/ V1.26."), so a monitor on older firmware sends a clean
 *  16-byte prefix. Every field we CONSUME ends at byte 15 (`restSeconds`, a
 *  u24 at offset 13), so rejecting those frames discarded a whole session's
 *  readings over a byte with no consumer — and because `driver.ts`'s
 *  `seen.as1` is a one-way latch set only on a successful parse, it cost every
 *  frame, not just this field. */
const ADDITIONAL_STATUS_1_MIN_BYTES = 16;
```

Change the interface field and the parser body:

```ts
export interface AdditionalStatus1 {
  elapsedSeconds: number;
  speedMetersPerSecond: number;
  spm: number;
  heartRateBpm: number | null;
  currentSplit: number;
  averageSplit: number;
  restDistanceMeters: number;
  restSeconds: number;
  /** ABSENT on pre-V1.26 firmware — see `ADDITIONAL_STATUS_1_MIN_BYTES`. The
   *  property is OMITTED rather than set to `undefined`, which is what
   *  `parse.test.ts`'s `Object.hasOwn` assertion pins: an unguarded
   *  `readU8(bytes, 16)` on a short frame also yields `undefined`, so absence
   *  is the only observable that tells a correct decode from that half-fix.
   *  No consumer anywhere in `app/src` or `app/domain`. */
  ergMachineType?: number;
}

export function parseAdditionalStatus1(
  bytes: Uint8Array,
): AdditionalStatus1 | { error: Pm5ParseError } {
  const lengthError = checkLength(
    bytes,
    ADDITIONAL_STATUS_1_MIN_BYTES,
    "0x0032",
  );
  if (lengthError) return lengthError;
  const decoded: AdditionalStatus1 = {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    speedMetersPerSecond: readU16LE(bytes, 3) / 1000,
    spm: readU8(bytes, 5),
    heartRateBpm: heartRate(readU8(bytes, 6)),
    currentSplit: readU16LE(bytes, 7) / 100,
    averageSplit: readU16LE(bytes, 9) / 100,
    restDistanceMeters: readU16LE(bytes, 11),
    restSeconds: readU24LE(bytes, 13) / 100,
  };
  if (bytes.length > ADDITIONAL_STATUS_1_MIN_BYTES) {
    decoded.ergMachineType = readU8(bytes, 16);
  }
  return decoded;
}
```

Do the same for `0x0038`, above `parseAdditionalSplitIntervalData`:

```ts
/** The pre-V1.27 length of 0x0038 — same mechanism as
 *  `ADDITIONAL_STATUS_1_MIN_BYTES`, one revision later (rev 1.30 Table 1:
 *  "Added Erg Machine Type parameter to characteristic 0x0038."). Every
 *  consumed field ends at byte 17 (`splitIntervalNumber`). Losing this
 *  characteristic costs more than one field: `driver.ts`'s `noteBoundaryHalf`
 *  emits `intervalComplete` only when BOTH 0x0037 and 0x0038 arrive for the
 *  same split number, so a dead 0x0038 means no `IntervalActual` is ever
 *  recorded. */
const ADDITIONAL_SPLIT_INTERVAL_MIN_BYTES = 18;
```

```ts
  ergMachineType?: number;
```

```ts
  const lengthError = checkLength(
    bytes,
    ADDITIONAL_SPLIT_INTERVAL_MIN_BYTES,
    "0x0038",
  );
  if (lengthError) return lengthError;
  const decoded: AdditionalSplitIntervalData = {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    splitIntervalAvgStrokeRate: readU8(bytes, 3),
    splitIntervalWorkHeartRateBpm: heartRate(readU8(bytes, 4)),
    splitIntervalRestHeartRateBpm: heartRate(readU8(bytes, 5)),
    splitIntervalAvgPace: readU16LE(bytes, 6) / 10,
    splitIntervalTotalCalories: readU16LE(bytes, 8),
    splitIntervalAvgCalories: readU16LE(bytes, 10),
    splitIntervalSpeedMetersPerSecond: readU16LE(bytes, 12) / 1000,
    splitIntervalPowerWatts: readU16LE(bytes, 14),
    splitAvgDragFactor: readU8(bytes, 16),
    splitIntervalNumber: readU8(bytes, 17),
  };
  if (bytes.length > ADDITIONAL_SPLIT_INTERVAL_MIN_BYTES) {
    decoded.ergMachineType = readU8(bytes, 18);
  }
  return decoded;
```

**BOTH interfaces must change together.** `RawPm5Status` is an intersection of
`AdditionalStatus1 & AdditionalSplitIntervalData`; making only one optional
leaves the intersection required (`number & (number | undefined)` = `number`)
and changes nothing observable.

- [ ] **Step 4: Keep the encoders compiling**

`writeU8` takes `value: number` and `strict` is on, so an optional property
reads as `number | undefined` and `statusFrames.ts` will not typecheck.
Change line 208 and line 258:

```ts
  writeU8(bytes, 16, s.ergMachineType ?? 0);
```

```ts
  writeU8(bytes, 18, s.ergMachineType ?? 0);
```

- [ ] **Step 5: Reconcile the THREE existing `it.each` tables**

`parse.test.ts:529-586` holds three tables over the same five characteristics.
Change exactly this much:

- **Empty-input block (`:541`)** — change the two expected values only:
  `["parseAdditionalStatus1", parseAdditionalStatus1, 16, "0x0032"]` and
  `["parseAdditionalSplitIntervalData", parseAdditionalSplitIntervalData, 18, "0x0038"]`.
- **One-byte-short block (`:562`)** — DELETE the `0x0032` and `0x0038` rows.
  One byte short of the documented length is now a legitimate frame for those
  two, and Step 1's tests cover it. Leave `0x0031`, `0x0033` and `0x0037`
  exactly as they are, and retitle the block so the narrowing is deliberate
  rather than silent:
  `"%s: one byte short still errors — these three have no optional trailing field (0x0032/0x0038 do; see the pre-V1.26 cases above)"`.
- **Exact-length block (`:573`)** — UNCHANGED. 17 and 19 still decode.

- [ ] **Step 6: Run the full unit project**

```
cd app && pnpm test --project unit
```

Expected: PASS. Check the **"Test Files"** line as well as "Tests" — a file
that fails to load reports zero tests while the Tests line still reads green.

- [ ] **Step 7: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-as1
git rev-parse --show-toplevel   # must print the worktree path
git add app/domain/monitor/pm5/parse.ts app/domain/monitor/pm5/parse.test.ts app/domain/monitor/pm5/statusFrames.ts
git commit -m "0x0032 and 0x0038 accept the pre-2018 short frame

Erg Machine Type was appended to 0x0032 in interface spec V1.26 and to
0x0038 in V1.27. Both parsers demanded the longer form, so a monitor on
older firmware had every one of those frames discarded over a byte with
no consumer. Floors drop to the highest byte each parser consumes, 16
and 18, and the trailing field is read only when present.

The property is OMITTED rather than set undefined: an unguarded read on
a short frame also yields undefined, so key absence is the only thing
that distinguishes the fix from that half-fix.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UEXqdgDid4Qjd8D5uoRZ3H"
```

---

### Task 2: The fake can drive a whole pre-2018 session

**Files:**
- Modify: `app/domain/monitor/pm5/statusFrames.ts:197-211`, `:243-277`
- Modify: `app/src/monitor/transports/fake.ts:416` (`FakeScript`), `:1830`, `:1849`
- Test: `app/domain/monitor/pm5/statusFrames.test.ts`

**Interfaces:**
- Consumes: the optional `ergMachineType` from Task 1.
- Produces:
  `buildAdditionalStatus1Bytes(s: AdditionalStatus1, form?: "v126" | "pre-v126"): Uint8Array`
  and
  `buildAdditionalSplitIntervalDataBytes(s: AdditionalSplitIntervalData, form?: "v126" | "pre-v126"): Uint8Array`,
  both defaulting to `"v126"`. `FakeScript.preV126Firmware?: boolean`.

- [ ] **Step 1: Write the failing test**

In `statusFrames.test.ts`:

```ts
it("the pre-v126 form omits the trailing Erg Machine Type byte and round-trips through the parser", () => {
  const status: AdditionalStatus1 = {
    elapsedSeconds: 12.34,
    speedMetersPerSecond: 3.456,
    spm: 22,
    heartRateBpm: 142,
    currentSplit: 111.5,
    averageSplit: 113.25,
    restDistanceMeters: 64,
    restSeconds: 59.5,
    ergMachineType: 0,
  };
  const long = buildAdditionalStatus1Bytes(status);
  const short = buildAdditionalStatus1Bytes(status, "pre-v126");

  expect(long.length).toBe(17);
  expect(short.length).toBe(16);
  // The short form is a strict PREFIX of the long one — the whole premise.
  expect([...short]).toStrictEqual([...long.slice(0, 16)]);

  const decoded = parseAdditionalStatus1(short) as AdditionalStatus1;
  expect(decoded.spm).toBe(22);
  expect(decoded.restSeconds).toBeCloseTo(59.5, 2);
  expect(Object.hasOwn(decoded, "ergMachineType")).toBe(false);
});

it("0x0038's pre-v126 form is likewise an 18-byte prefix", () => {
  const status: AdditionalSplitIntervalData = {
    elapsedSeconds: 20.5,
    splitIntervalAvgStrokeRate: 24,
    splitIntervalWorkHeartRateBpm: 150,
    splitIntervalRestHeartRateBpm: 120,
    splitIntervalAvgPace: 113.4,
    splitIntervalTotalCalories: 73,
    splitIntervalAvgCalories: 840,
    splitIntervalSpeedMetersPerSecond: 4.321,
    splitIntervalPowerWatts: 157,
    splitAvgDragFactor: 121,
    splitIntervalNumber: 1,
    ergMachineType: 0,
  };
  const long = buildAdditionalSplitIntervalDataBytes(status);
  const short = buildAdditionalSplitIntervalDataBytes(status, "pre-v126");
  expect(long.length).toBe(19);
  expect(short.length).toBe(18);
  expect([...short]).toStrictEqual([...long.slice(0, 18)]);
  expect(
    Object.hasOwn(
      parseAdditionalSplitIntervalData(short) as AdditionalSplitIntervalData,
      "ergMachineType",
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

```
cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/monitor/pm5/statusFrames.test.ts
```

Expected: FAIL — `buildAdditionalStatus1Bytes` takes one argument, so the
`"pre-v126"` call is a TypeScript error and `short.length` is 17.

- [ ] **Step 3: Give the encoders the flag**

```ts
/** The wire form to emit. `"v126"` is the current 17-byte layout;
 *  `"pre-v126"` is the 16-byte one a monitor older than interface revision
 *  V1.26 (2018-11-02) sends, which omits the trailing `Erg Machine Type`.
 *  A FLAG rather than an optional input field on purpose: a caller that
 *  simply forgets to set `ergMachineType` still gets the long frame and
 *  cannot produce a short one by accident. */
export type StatusFrameForm = "v126" | "pre-v126";

export function buildAdditionalStatus1Bytes(
  s: AdditionalStatus1,
  form: StatusFrameForm = "v126",
): Uint8Array {
  const bytes = new Uint8Array(form === "pre-v126" ? 16 : 17);
  writeU24LE(bytes, 0, Math.round(s.elapsedSeconds * 100));
  writeU16LE(bytes, 3, Math.round(s.speedMetersPerSecond * 1000));
  writeU8(bytes, 5, s.spm);
  writeHeartRate(bytes, 6, s.heartRateBpm);
  writeU16LE(bytes, 7, Math.round(s.currentSplit * 100));
  writeU16LE(bytes, 9, Math.round(s.averageSplit * 100));
  writeU16LE(bytes, 11, s.restDistanceMeters);
  writeU24LE(bytes, 13, Math.round(s.restSeconds * 100));
  if (form === "v126") writeU8(bytes, 16, s.ergMachineType ?? 0);
  return bytes;
}
```

Apply the identical shape to `buildAdditionalSplitIntervalDataBytes`: size
`form === "pre-v126" ? 18 : 19`, and guard only the final
`writeU8(bytes, 18, s.ergMachineType ?? 0)`.

- [ ] **Step 4: Thread one switch through the fake**

In `FakeScript` (`fake.ts:416`):

```ts
  /** Emit the PRE-V1.26 wire forms of 0x0032 (16 bytes) and 0x0038 (18
   *  bytes) for the WHOLE session, arming included — what a monitor older
   *  than 2018 sends. One switch rather than two, because `driver.ts`'s
   *  `seen.as1` is a one-way latch: a single well-formed 0x0032 anywhere,
   *  including during the arm sequence, opens it permanently and any test
   *  relying on this would go green while proving nothing. */
  preV126Firmware?: boolean;
```

At `fake.ts:1830`:

```ts
    notify(
      ADDITIONAL_STATUS_1_UUID,
      buildAdditionalStatus1Bytes(as1, script.preV126Firmware ? "pre-v126" : "v126"),
    );
```

At `fake.ts:1849`:

```ts
      ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
      buildAdditionalSplitIntervalDataBytes(
        asSplit,
        script.preV126Firmware ? "pre-v126" : "v126",
      ),
```

- [ ] **Step 5: Run unit and client**

```
cd app && pnpm test --project unit --project client
```

Expected: PASS, and no existing test changes behaviour — the flag defaults off.

- [ ] **Step 6: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-as1
git rev-parse --show-toplevel
git add app/domain/monitor/pm5/statusFrames.ts app/domain/monitor/pm5/statusFrames.test.ts app/src/monitor/transports/fake.ts
git commit -m "The fake can emit the pre-2018 wire forms

An explicit form flag on both encoders, and one FakeScript switch that
drives the whole session including arming. One switch and not two because
seen.as1 is a one-way latch: a single long 0x0032 during the arm sequence
opens it permanently, which is exactly how a seam test goes green while
proving nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UEXqdgDid4Qjd8D5uoRZ3H"
```

---

### Task 3: The seam test, upstream of the producer, and two mutation probes

**Files:**
- Test: `app/src/monitor/driver.test.ts`

**Interfaces:**
- Consumes: `FakeScript.preV126Firmware` from Task 2, the lowered floors from
  Task 1.
- Produces: nothing later tasks rely on.

This is the task recurring failure 24 exists for. Every current gate enters the
pipe BELOW the break: the existing garbled-frame test at `driver.test.ts:4165`
calls `programAndArm` first, so the latch is already open when it runs, which is
why it stayed green through this defect.

- [ ] **Step 1: Write the failing test**

Add to `driver.test.ts`. This uses the file's own existing helpers —
`harness`, `programAndArm`, `MINIMAL_PROGRAM` — so nothing new is introduced:

```ts
it("a monitor that only ever sends the 16-byte 0x0032 still produces frames — whole session, arming included (RF24: the only test that starts upstream of the parse)", async () => {
  const timeline: FakeTimelineEvent[] = [
    {
      atMs: 100,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 30,
      distanceMeters: 120,
      spm: 24,
      currentSplit: 120,
      heartRateBpm: 140,
      programIntervalIndex: 0,
    },
    {
      atMs: 200,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 60,
      distanceMeters: 240,
      spm: 26,
      currentSplit: 118,
      heartRateBpm: 145,
      programIntervalIndex: 0,
    },
  ];

  // `preV126Firmware` makes the fake emit the 16-byte 0x0032 for the WHOLE
  // session — `programAndArm` below included. That matters: `seen.as1` is a
  // one-way latch, so one well-formed 0x0032 during arming would open it and
  // this test would pass with the bug still present.
  const { fake, driver, events } = harness({
    program: MINIMAL_PROGRAM,
    events: timeline,
    preV126Firmware: true,
  });

  await programAndArm(driver, fake, MINIMAL_PROGRAM);
  fake.tick(300);

  const frames = events.filter((e) => e.kind === "frame");

  // The defect is not "wrong numbers", it is NO frames at all: the parse
  // fails, seen.as1 never latches, maybeEmitFrame returns early forever.
  expect(frames.length).toBeGreaterThan(0);

  // And the readings this characteristic carries are real, not zeroed — a
  // bare count would pass if frames were emitted with an empty as1 merge.
  expect(
    frames.some((e) => e.kind === "frame" && e.frame.spm > 0),
  ).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

```
cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/driver.test.ts
```

Expected on a tree WITHOUT Task 1: FAIL, `expected 0 to be greater than 0`.
Since Task 1 is already committed, this test should PASS immediately — which is
exactly why Step 4's probes are mandatory rather than optional.

- [ ] **Step 3: Commit the test before probing**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-as1
git rev-parse --show-toplevel
git add app/src/monitor/driver.test.ts
git commit -m "Seam test: a pre-2018 monitor still produces frames

Starts at the transport with short 0x0032 for the whole session, arming
included, and asserts the driver emits frames at all. Every other gate
enters the pipe below the parse, which is why none could go red on this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UEXqdgDid4Qjd8D5uoRZ3H"
```

Confirm it landed: `git log -1 --oneline`. The working tree must be clean
before any probe, so a probe's revert can never take uncommitted work with it.

- [ ] **Step 4: Probe A — revert the floor**

Confirm the anchor is unique first:

```bash
grep -c "ADDITIONAL_STATUS_1_MIN_BYTES = 16" app/domain/monitor/pm5/parse.ts   # must print 1
```

Set it to `17`, run the seam test, and RECORD THE EXACT FAILURE TEXT in the PR
body. Expected: `expected 0 to be greater than 0`. Then:

```bash
git checkout -- app/domain/monitor/pm5/parse.ts
git status --porcelain   # must be empty
```

- [ ] **Step 5: Probe B — the half-fix**

This is the probe that justifies `Object.hasOwn`. Leave the floor at 16 and make
the trailing read unconditional:

```ts
  decoded.ergMachineType = readU8(bytes, 16);
```

Run `parse.test.ts`. Expected: the two Task 1 decode tests FAIL on
`Object.hasOwn(...)` being `true`, while the seam test still PASSES — proving
the seam test alone cannot catch this and the absence assertion is doing real
work. Record both outcomes. Then revert and confirm a clean tree as above.

- [ ] **Step 6: Full gate**

```bash
cd app && pnpm test && pnpm lint && pnpm typecheck && pnpm build && pnpm dist:grep
```

`pnpm e2e` is NOT required: no file under `app/src/` that renders anything
changed. State that reasoning in the PR body rather than leaving it unsaid.

---

### Task 4: Reconcile the wire record

**Files:**
- Modify: `docs/monitor/pm5-interface-notes.md:476-488` (the 0x0032 table), and
  the 0x0038 table in the same section
- Modify: `docs/monitor/fake-vs-parser-audit.md` (the two `ergMachineType` rows)

The interface notes are this repo's transcription of the wire and are cited as
PRIMARY throughout the codebase. They currently state a flat 17 and 19 bytes
with no mention that the trailing field is firmware-dependent, which is the
belief that produced this bug.

- [ ] **Step 1: Annotate both byte-layout tables**

Under the `0x0032` table, add:

```markdown
**FIRMWARE-DEPENDENT TRAILING FIELD (2026-09-07).** `Erg Machine Type` (offset
16) was APPENDED in interface-definition revision V1.26 — rev 1.30 Table 1,
verbatim: "Added Erg Machine Type parameter to characteristic 0x0032/0x0080/
V1.26.", dated 11/2/2018. A monitor on older firmware sends a 16-byte prefix
ending at Rest Time. `parse.ts` therefore floors this characteristic at 16, not
17. Reported by a rower on 2026-09-07 whose session recorded NOTHING: the
rejected frames meant `driver.ts`'s one-way `seen.as1` latch never opened and
`maybeEmitFrame` published no frame all session. The same applies to 0x0038 one
revision later (V1.27). MEASURED against our own corpus: every committed
recording is post-V1.26 — 0x0032 is 17 bytes in 8248 of 8248 notifications and
0x0038 is 19 in 42 of 42 — so no capture we hold exercises the short form.
```

[Superseded during execution: the vendor row above establishes ADDED only,
not LAST — that comes from rev 1.30 Table 3's field ordering, and the
16-byte pre-2018 prefix is an INFERENCE, since no such capture exists. The
prose as prescribed conflated the three; the corrected wording actually
committed is `docs/monitor/pm5-interface-notes.md:490-500`.]

Add the matching two-sentence note under the `0x0038` table pointing back to
this one.

- [ ] **Step 2: Update the fake-vs-parser audit rows**

Both `ergMachineType` rows say the field is UNCONSUMED with a constant fake
value. That is still true; add to each: `now OPTIONAL on the type — absent
entirely when the fake runs with FakeScript.preV126Firmware`.

- [ ] **Step 3: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-as1
git rev-parse --show-toplevel
git add docs/monitor/pm5-interface-notes.md docs/monitor/fake-vs-parser-audit.md
git commit -m "Wire record: the trailing Erg Machine Type is firmware-dependent

The interface notes stated a flat 17 and 19 bytes with no mention that
the last field was a 2018 addition, which is the belief that produced
this bug.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UEXqdgDid4Qjd8D5uoRZ3H"
```

---

## What this plan deliberately does NOT do

- **Does not touch the frame gate.** `seen.general && seen.as1 && seen.as2`
  stays. Relaxing it would hand consumers zeros for rate and pace.
- **Does not add a rower-facing warning.** That is a follow-on with a Gate 0.
- **Does not touch `0x0031`, `0x0033`, `0x0037`, `0x0039` or `0x003A`.** The
  slack audit in the spec shows they have no unconsumed trailing byte.
