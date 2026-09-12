import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requireUser } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { makeFakeConcept2Store, makeFakeStores } from "../testing/fakes.js";
import { SERIES_SAMPLE_FIELDS, type LogSeries } from "../stores/logs.js";
import type { C2Client } from "../concept2/client.js";
import { createDataRouter, type Stores } from "./data.js";
import { createConcept2Router } from "./concept2.js";
import {
  parseAdditionalStatus1,
  parseGeneralStatus,
  toMonitorState,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  GENERAL_STATUS_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import { deriveAverageHeartRate } from "../../domain/monitor/derivedHeartRate.js";
import {
  fromHexString,
  parseRecording,
} from "../../src/monitor/transports/recording.js";
import { createSeriesRecorder } from "../../src/monitor/seriesRecorder.js";

// ---------------------------------------------------------------------------
// RF24: every gate on the SERVER half of the series shape — the validator, the
// store, the Concept2 mapping — starts from a hand-typed sample literal, and
// none of them starts at the producer. Phase MD PR 3 gave the shape a compiler
// edge (the store's types are mapped from `domain/monitor/types.ts`), which
// catches a RENAMED field. It cannot catch a field the validator's rebuild
// list quietly drops, or a value that fails to survive the POST. So this file
// is the RUNTIME gate over that chain: it drives the real
// `createSeriesRecorder` over a committed capture, POSTs what the recorder
// built through the real route, and reads the Concept2 payload back out the
// far end.
//
// It can go red on exactly the defect RF33 recorded, one layer up: rename `r`
// in `toMappingRow`'s cast and the rest samples stop being excluded, so the
// posted heart-rate average changes. Both mutations are in the PR body.
//
// Cross-tree import (this file reaches into `src/` for the recorder itself),
// and the precedent for it: `server/routes/data.test.ts` already imports
// `../../src/session/partialGateFixture.js` in this same `unit` project. This file is NOT `*.integration.test.ts` — that suffix
// routes to the Docker-only `integration` project; nothing here needs a
// database. `seriesRecorder.ts` is DOM-free (it imports one type from
// `domain/`), so it runs in the node environment.
// ---------------------------------------------------------------------------

const CAPTURE = "walk-2026-08-16/session-2-wu-4unequal.jsonl";
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /app\/server\/routes\/seriesSeam\.test\.ts$/,
    "docs/monitor/sessions/",
  );

/** The recorder's real input, decoded from a committed capture through the
 *  real parsers. Re-declared rather than imported from
 *  `derivedHeartRate.replay.test.ts`: no test file imports another here. */
function framesFrom(file: string): MonitorFrame[] {
  const { events } = parseRecording(
    readFileSync(`${SESSIONS_DIR}${file}`, "utf8"),
  );
  const frames: MonitorFrame[] = [];
  let last: {
    currentSplit: number;
    spm: number;
    heartRateBpm: number | null;
  } | null = null;
  for (const e of events) {
    if (!("dir" in e) || e.dir !== "rx") continue;
    if (e.char === ADDITIONAL_STATUS_1_UUID) {
      const p = parseAdditionalStatus1(fromHexString(e.hex));
      if (!("error" in p)) last = p;
      continue;
    }
    if (e.char !== GENERAL_STATUS_UUID) continue;
    const gs = parseGeneralStatus(fromHexString(e.hex));
    if ("error" in gs) continue;
    frames.push({
      elapsedSeconds: gs.elapsedSeconds,
      distanceMeters: gs.distanceMeters,
      sessionElapsedSeconds: gs.elapsedSeconds,
      sessionDistanceMeters: gs.distanceMeters,
      currentSplit: last?.currentSplit ?? null,
      spm: last?.spm ?? null,
      heartRateBpm: last?.heartRateBpm ?? null,
      rowingActive: gs.rowingState === 1,
      splitAvgPace: null,
      restSeconds: 0,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: toMonitorState(gs.workoutState),
    });
  }
  return frames;
}

function recordedSeries() {
  const recorder = createSeriesRecorder();
  for (const f of framesFrom(CAPTURE)) recorder.onFrame(f);
  const series = recorder.snapshot();
  if (series === undefined) throw new Error("capture produced no samples");
  return series;
}

const userA: SessionUser = { id: "user-a", email: "a@x.com", name: "A" };

function fakeSessionStore(): SessionStore {
  return {
    resolveSession: async (token: string) =>
      token === "token-a"
        ? { user: userA, expiresAt: new Date(Date.now() + 100_000) }
        : null,
  } as unknown as SessionStore;
}

const asA = (req: request.Test) => req.set("Authorization", "Bearer token-a");

function stubClient(): C2Client {
  return {
    authorizeUrl: vi.fn(() => "https://example.test/authorize"),
    exchangeCode: vi.fn(),
    refreshTokens: vi.fn(),
    fetchMe: vi.fn(),
    fetchResults: vi.fn(async () => ({
      ok: true as const,
      rows: [
        {
          id: 90001,
          type: "rower",
          weightClass: "H",
          dateUtc: "2026-09-02 10:00:30",
          date: "2026-09-02 06:00:30",
          verified: null,
        },
      ],
    })),
    postResult: vi.fn(async () => ({
      ok: true as const,
      resultId: 91010,
      verified: false,
    })),
  } as unknown as C2Client;
}

async function harness() {
  const stores = makeFakeStores();
  const c2Store = makeFakeConcept2Store();
  await c2Store.upsertLink(userA.id, {
    c2UserId: 2211,
    accessToken: "at-1",
    refreshToken: "rt-1",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const client = stubClient();
  const app = express();
  app.post("/api/logs", express.json({ limit: "1mb" }));
  app.use(express.json());
  app.use(
    createDataRouter({
      stores: stores as unknown as Stores,
      requireUser: requireUser(fakeSessionStore()),
    }),
  );
  app.use(
    createConcept2Router({
      available: () => true,
      availableFor: () => true,
      store: c2Store,
      logs: stores.logs,
      client,
      requireUser: requireUser(fakeSessionStore()),
      sessions: fakeSessionStore(),
      webRedirectUri: "https://example.test/oauth/callback",
      logbookBaseUrl: "https://log.concept2.com",
    }),
  );
  return { app, stores, client };
}

/** The POST body of a finished monitor row — everything
 *  `eligibilityFailure` needs (`source: "pm5"`, `endedBy: "finished"`, work
 *  totals) plus the ordinary scaffolding. */
function monitorLogBody(series: unknown) {
  return {
    workoutId: null,
    workoutTitle: "Steady State",
    workoutType: "AT",
    held: null,
    effort: null,
    notes: null,
    steps: [
      {
        label: "4 x unequal",
        actualSplit: 118,
        actualSource: "pm5",
      },
    ],
    source: "pm5",
    deviceName: "PM5 432331249 Row",
    endedBy: "finished",
    workSeconds: 254.8,
    workMeters: 935,
    restSeconds: 120,
    restMeters: 274,
    completedAt: "2026-08-25T21:42:03.110Z",
    tz: "America/New_York",
    series,
  };
}

describe("the series seam: the recorder's own samples, across the POST, to the Concept2 payload", () => {
  it("carries the recorder's rest marks through the validator, the store and the mapping", async () => {
    const series = recordedSeries();
    const restCount = series.samples.filter((s) => s.r === true).length;
    expect(restCount).toBeGreaterThan(0);
    // The oracle is computed on the CLIENT side of the seam, over the
    // recorder's own objects, before anything is serialized.
    const expectedAverage = deriveAverageHeartRate(series.samples);
    expect(expectedAverage).not.toBeNull();
    // …and the rests MATTER on this capture: with the mark stripped the same
    // derivation returns a different number. Without this pin, a mutation
    // that silently drops `r` somewhere below could still land on the same
    // average by luck, and the oracle would agree with a broken seam.
    const restIncluded = deriveAverageHeartRate(
      series.samples.map((s) => ({ t: s.t, hr: s.hr, r: undefined })),
    );
    expect(restIncluded).not.toBe(expectedAverage);

    const { app, stores, client } = await harness();
    const created = await asA(request(app).post("/api/logs")).send(
      monitorLogBody(series),
    );
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // D kept every sample and every rest mark. The jsonb column is untyped
    // off `get`, so this names the store's own `LogSeries` — the same cast
    // `routes/concept2.ts`'s `toMappingRow` makes on the production path.
    const stored = await stores.logs.get(userA.id, id);
    const storedSeries = stored!.series as LogSeries;
    expect(storedSeries.samples).toHaveLength(series.samples.length);
    expect(storedSeries.samples.filter((s) => s.r === true)).toHaveLength(
      restCount,
    );

    // The validator REBUILDS each sample from an explicit field list, so a
    // field the list forgets is dropped silently and no band check is left
    // missing to notice. Compare the KEY UNION over every stored sample
    // against the exhaustiveness witness beside `LogSeriesSample` — and the
    // same union over what the CLIENT recorder emitted, which is the only
    // comparison in the repo that crosses the `src/` -> `server/` boundary
    // the mirror cannot cross with a compiler.
    const keyUnion = (samples: readonly object[]) =>
      [...new Set(samples.flatMap((x) => Object.keys(x)))].sort();
    const expectedFields = [...SERIES_SAMPLE_FIELDS].sort();
    expect(keyUnion(storedSeries.samples)).toStrictEqual(expectedFields);
    expect(keyUnion(series.samples)).toStrictEqual(expectedFields);

    // F (`toMappingRow`'s cast) and E (`SessionLogRow.series`) now carry it
    // to the payload, and the derived average matches the one computed over
    // the recorder's own samples upstream of everything above.
    const sent = await asA(
      request(app)
        .post(`/api/concept2/results/${id}`)
        .send({ tz: "America/New_York" }),
    );
    expect(sent.status).toBe(200);
    const posted = vi.mocked(client.postResult).mock.calls[0]![1];
    expect(posted.heart_rate).toStrictEqual({ average: expectedAverage });
  });
});
