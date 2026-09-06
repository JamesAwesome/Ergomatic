import { describe, it, expect, vi, afterEach } from "vitest";

// Wave E auto-send, spec 2026-09-05 §3.3: `autoSendAfterSave`'s decision
// table, one row per clause, each asserted on the WIRE (the parsed body the
// send route would receive) rather than on a call count — delta F1 was a
// send call that did not typecheck behind a green count.
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../api");
});

const LINKED_AUTO = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
  autoSend: true,
};

function mockApi(
  linkAnswer: () => Response | Promise<Response>,
  sendAnswer: () => Response | Promise<Response> = () =>
    new Response(JSON.stringify({ resultId: 1 }), { status: 200 }),
) {
  const api = vi.fn(async (path: string, _init?: RequestInit) =>
    path === "/api/concept2/link" ? linkAnswer() : sendAnswer(),
  );
  vi.doMock("../api", () => ({ api }));
  return api;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function run(logId: string) {
  const { autoSendAfterSave } = await import("./concept2Send");
  await autoSendAfterSave(logId);
}

function sends(api: ReturnType<typeof mockApi>) {
  return api.mock.calls.filter(([p]) => p.startsWith("/api/concept2/results/"));
}

describe("autoSendAfterSave (Wave E auto-send §3.3)", () => {
  it("AUTOMATIC: POSTs the manual site's exact shape to the saved row's route", async () => {
    const api = mockApi(() => json(LINKED_AUTO));
    await run("log-77");
    expect(sends(api)).toHaveLength(1);
    const [path, init] = sends(api)[0]!;
    expect(path).toBe("/api/concept2/results/log-77");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toStrictEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toStrictEqual(["tz"]);
    expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("AUTOMATIC under needsReauth still sends — the server is the authority and answers 409", async () => {
    // The client checks only available/linked/autoSend (spec §3.3, F3); a
    // dead grant is the route's 409 `needs_reauth`, swallowed here, and the
    // card's mode line reads paused. Pinned so a client-side "helpful"
    // guard cannot creep in and hide a server outcome.
    const api = mockApi(
      () => json({ ...LINKED_AUTO, needsReauth: true }),
      () => json({ error: "needs_reauth" }, 409),
    );
    await expect(run("log-77")).resolves.toBeUndefined();
    expect(sends(api)).toHaveLength(1);
  });

  it("reads the link FRESH, once, before deciding", async () => {
    const api = mockApi(() => json(LINKED_AUTO));
    await run("log-77");
    expect(api.mock.calls.map(([p]) => p)).toStrictEqual([
      "/api/concept2/link",
      "/api/concept2/results/log-77",
    ]);
  });

  it.each([
    ["MANUAL", { ...LINKED_AUTO, autoSend: false }],
    ["autoSend absent (older server)", { ...LINKED_AUTO, autoSend: undefined }],
    ['autoSend the string "true"', { ...LINKED_AUTO, autoSend: "true" }],
    ["unlinked", { available: true, linked: false }],
    ["unavailable", { available: false }],
    ["a non-object body", "nope"],
  ])("%s: no send", async (_l, link) => {
    const api = mockApi(() => json(link));
    await run("log-77");
    expect(sends(api)).toHaveLength(0);
  });

  it.each([
    ["a 502", () => new Response("<html>502</html>", { status: 502 })],
    ["a 401", () => new Response("", { status: 401 })],
    ["unparseable JSON", () => new Response("{", { status: 200 })],
    ["a thrown request", () => Promise.reject(new Error("offline"))],
  ])(
    "a link read that fails with %s: no send, and it resolves",
    async (_l, answer) => {
      const api = mockApi(answer);
      await expect(run("log-77")).resolves.toBeUndefined();
      expect(sends(api)).toHaveLength(0);
    },
  );

  it.each([
    [
      "a 422 (not eligible: a timer row)",
      () => json({ error: "not_eligible" }, 422),
    ],
    ["a 409 (duplicate)", () => json({ error: "duplicate" }, 409)],
    ["a 500", () => new Response("", { status: 500 })],
    ["a thrown send", () => Promise.reject(new Error("offline"))],
  ])(
    "a send answered by %s resolves without throwing — the row and the link carry the outcome",
    async (_l, answer) => {
      const api = mockApi(() => json(LINKED_AUTO), answer);
      await expect(run("log-77")).resolves.toBeUndefined();
      expect(sends(api)).toHaveLength(1);
    },
  );
});
