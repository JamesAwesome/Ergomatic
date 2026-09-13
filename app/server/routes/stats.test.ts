import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { requireUser } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { makeFakeStores } from "../testing/fakes.js";
import {
  rowContribution,
  statsRowInput,
  type StatsRowSource,
} from "../../domain/stats/rowContribution.js";
import type { StatsRowsResponse } from "../../domain/stats/statsRow.js";
import { createDataRouter } from "./data.js";
import { createStatsRouter } from "./stats.js";

const userA: SessionUser = { id: "user-a", email: "a@x.com", name: "A" };
const userB: SessionUser = { id: "user-b", email: "b@x.com", name: "B" };

function fakeSessionStore(): SessionStore {
  const users: Record<string, SessionUser> = {
    "token-a": userA,
    "token-b": userB,
  };
  return {
    resolveSession: async (token: string) => {
      const user = users[token];
      if (!user) return null;
      return {
        user,
        expiresAt: new Date(Date.now() + 100_000),
        refreshed: false,
      };
    },
  } as unknown as SessionStore;
}

function appFor() {
  const stores = makeFakeStores();
  const app = express();
  app.use(express.json());
  const guard = requireUser(fakeSessionStore());
  // The data router seeds through the REAL `POST /api/logs` validator, so
  // every row here is one the supported save path could produce (RF24).
  app.use(createDataRouter({ stores, requireUser: guard }));
  app.use(createStatsRouter({ logs: stores.logs, requireUser: guard }));
  return app;
}

const asA = (req: request.Test) => req.set("Authorization", "Bearer token-a");
const asB = (req: request.Test) => req.set("Authorization", "Bearer token-b");

function logBody(overrides: Record<string, unknown> = {}) {
  return {
    workoutId: null,
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    held: null,
    effort: null,
    notes: null,
    steps: [{ label: "Work" }],
    source: "manual",
    advancesPlan: false,
    ...overrides,
  };
}

// The ten keys of spec §4.3, typed out INDEPENDENTLY of `StatsRow` (RF21).
const STATS_ROW_KEYS = [
  "id",
  "loggedAt",
  "source",
  "workoutType",
  "tier",
  "workMeters",
  "workSeconds",
  "restMeters",
  "restSeconds",
  "calories",
];

describe("GET /api/stats/rows (Phase PS PR 1, spec §4.3)", () => {
  it("401s without a session", async () => {
    const res = await request(appFor()).get("/api/stats/rows");
    expect(res.status).toBe(401);
  });

  it("returns only the caller's rows, each with exactly the ten §4.3 keys and no Concept2 field", async () => {
    const app = appFor();
    await asA(request(app).post("/api/logs")).send(logBody()).expect(201);
    await asB(request(app).post("/api/logs")).send(logBody()).expect(201);
    const res = await asA(request(app).get("/api/stats/rows"));
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(Object.keys(res.body.rows[0]).sort()).toStrictEqual(
      [...STATS_ROW_KEYS].sort(),
    );
  });

  it("projects a machine-tier row as its machine totals, not its fused distance, with loggedAt as an ISO instant and calories as the stored integer", async () => {
    const app = appFor();
    await asA(request(app).post("/api/logs"))
      .send(
        logBody({
          source: "pm5",
          deviceName: "PM5 432331249",
          endedBy: "finished",
          machineWorkSeconds: 124,
          machineWorkMeters: 500,
          workSeconds: 124,
          workMeters: 500,
          restSeconds: 120,
          restMeters: 242,
          distanceMeters: 620,
          timeSeconds: 244,
          machineSummary: { totalCalories: 37 },
        }),
      )
      .expect(201);
    const res = await asA(request(app).get("/api/stats/rows"));
    const row = res.body.rows[0];
    expect(row).toMatchObject({
      source: "pm5",
      workoutType: "O2",
      tier: "machine",
      workMeters: 500,
      workSeconds: 124,
      restMeters: 242,
      restSeconds: 120,
      calories: 37,
    });
    expect(new Date(row.loggedAt).toISOString()).toBe(row.loggedAt);
  });

  // RF24: the seam. The client's detail hero and the route's projection are
  // TWO call paths into one rule; this starts upstream of both (the POST),
  // reads the row back the way each side does, and holds the six figures
  // equal. A mapping wrong on either side — a renamed step key, a dropped
  // `?? null` — makes one path's tier differ from the other's here.
  it.each([
    [
      "machine tier",
      logBody({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "finished",
        steps: [{ label: "Work", actualMeters: 500, actualSeconds: 124 }],
        machineWorkSeconds: 124,
        machineWorkMeters: 500,
        workSeconds: 124,
        workMeters: 500,
        restSeconds: 120,
        restMeters: 242,
        distanceMeters: 620,
        timeSeconds: 244,
        machineSummary: { totalCalories: 37 },
      }),
    ],
    [
      "steps tier, metres only",
      logBody({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "finished",
        steps: [
          { label: "distance only", actualSource: "pm5", actualMeters: 500 },
        ],
      }),
    ],
    [
      "steps tier, hand-logged",
      logBody({
        endedBy: "finished",
        steps: [{ label: "6k", actualMeters: 6000, actualSeconds: 1550 }],
      }),
    ],
    [
      "stored tier, declined steps",
      logBody({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "link-lost",
        steps: [{ label: "Work", actualMeters: 250, actualSeconds: 67.9 }],
        distanceMeters: 560,
        timeSeconds: 150,
      }),
    ],
  ])(
    "the client's buildHeroes path and the route's toStatsRow path agree on the same saved row: %s",
    async (_name, body) => {
      const app = appFor();
      const created = await asA(request(app).post("/api/logs"))
        .send(body)
        .expect(201);
      const id = (created.body as { id: string }).id;
      const detail = await asA(request(app).get(`/api/logs/${id}`)).expect(200);
      // The CLIENT's path, without importing src/ into a server test: the
      // detail body through the domain's one builder with the two fields
      // src/log/storedSummary.ts's toStatsRowInput maps (endedBy ?? null,
      // machineSummary?.totalCalories) mapped the same way here.
      const detailBody = detail.body as StatsRowSource & {
        machineSummary?: { totalCalories?: unknown };
      };
      const client = rowContribution(
        statsRowInput({
          ...detailBody,
          endedBy: detailBody.endedBy ?? null,
          totalCalories: detailBody.machineSummary?.totalCalories,
        }),
      );
      const stats = await asA(request(app).get("/api/stats/rows")).expect(200);
      const server = (stats.body as StatsRowsResponse).rows.find(
        (r) => r.id === id,
      )!;
      const six = (c: {
        tier: unknown;
        workMeters: unknown;
        workSeconds: unknown;
        restMeters: unknown;
        restSeconds: unknown;
        calories: unknown;
      }) => ({
        tier: c.tier,
        workMeters: c.workMeters,
        workSeconds: c.workSeconds,
        restMeters: c.restMeters,
        restSeconds: c.restSeconds,
        calories: c.calories,
      });
      expect(six(server)).toStrictEqual(six(client));
      // And the figure is the one the row actually earns — not two paths
      // agreeing on null.
      expect(client.workMeters).not.toBeNull();
    },
  );

  it("a free row (null type) is NO TYPE — workoutType null — and a row with nothing to sum is tier stored with null figures", async () => {
    const app = appFor();
    await asA(request(app).post("/api/logs"))
      .send(logBody({ workoutType: null, steps: [], source: "manual" }))
      .expect(201);
    const res = await asA(request(app).get("/api/stats/rows"));
    expect(res.body.rows[0]).toMatchObject({
      workoutType: null,
      tier: "stored",
      workMeters: null,
      workSeconds: null,
      calories: null,
    });
  });
});
