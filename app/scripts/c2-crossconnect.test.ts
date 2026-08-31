import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the vi.mock factories below (hoisted above imports by vitest)
// can close over shared, per-test-configurable mock fns.
const readlineMocks = vi.hoisted(() => ({
  question: vi.fn<() => Promise<string>>(),
  close: vi.fn(),
}));
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => readlineMocks),
}));

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  chmod: vi.fn(),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: fsMocks.readFile,
    writeFile: fsMocks.writeFile,
    chmod: fsMocks.chmod,
  };
});

const cryptoMocks = vi.hoisted(() => ({
  randomBytes: vi.fn(),
}));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: cryptoMocks.randomBytes };
});

import {
  buildAuthorizeUrl,
  buildResultPost,
  c2Tenths,
  cmdAuth,
  cmdProbeRed,
  diffRowVsResult,
  evaluateFreshPost,
  exchangeCode,
  fetchResult,
  type FieldDiff,
  formatC2Date,
  parseCallbackUrl,
  readConfig,
  redProofVerdict,
  verifyState,
} from "./c2-crossconnect.js";

const cfg = {
  baseUrl: "https://log-dev.concept2.com",
  clientId: "cid",
  clientSecret: "sec",
  redirectUri: "http://localhost:8199/c2-callback",
};

describe("readConfig", () => {
  it("builds config from env and defaults baseUrl to log-dev", () => {
    const c = readConfig({
      C2_CLIENT_ID: "cid",
      C2_CLIENT_SECRET: "sec",
      C2_REDIRECT_URI: "http://localhost:8199/c2-callback",
    });
    expect(c.baseUrl).toBe("https://log-dev.concept2.com");
    expect(c.clientId).toBe("cid");
  });
  it("refuses to run with a missing credential, naming it", () => {
    expect(() => readConfig({ C2_CLIENT_ID: "cid" })).toThrow(
      /C2_CLIENT_SECRET/,
    );
  });
});

describe("buildAuthorizeUrl", () => {
  it("carries the four documented params plus the state probe, scope explicit", () => {
    const u = new URL(buildAuthorizeUrl(cfg, "nonce123"));
    expect(u.origin).toBe("https://log-dev.concept2.com");
    expect(u.pathname).toBe("/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("scope")).toBe("user:read,results:write");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(u.searchParams.get("state")).toBe("nonce123");
  });
});

describe("parseCallbackUrl", () => {
  it("extracts code and echoed state", () => {
    expect(
      parseCallbackUrl(
        "http://localhost:8199/c2-callback?code=abc&state=nonce123",
      ),
    ).toStrictEqual({ code: "abc", state: "nonce123" });
  });
  it("reports state null when C2 did not echo it — the probe's negative arm", () => {
    expect(
      parseCallbackUrl("http://localhost:8199/c2-callback?code=abc"),
    ).toStrictEqual({ code: "abc", state: null });
  });
  it("throws on a pasted URL with no code", () => {
    expect(() => parseCallbackUrl("http://localhost:8199/c2-callback")).toThrow(
      /code/,
    );
  });
});

// The fixture mirrors a real stored row's shape (spec §Mapping): work/rest
// split per RC-1, machine avgStrokeRate flat on the summary blob. Values are
// realistic wire-shaped numbers (tenths-precision seconds, whole meters).
const row = {
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 180,
  restMeters: 64,
  avgStrokeRate: 24,
};
const opts = {
  weightClass: "H" as const,
  date: new Date("2026-08-26T13:40:00Z"),
  tz: "America/Los_Angeles",
};

describe("c2Tenths", () => {
  it("matches C2's own documented example: one minute is 600", () => {
    expect(c2Tenths(60)).toBe(600); // independent literal, not derived (RF21)
  });
  it("rounds tenths-precision sums exactly", () => {
    expect(c2Tenths(254.8)).toBe(2548);
    expect(c2Tenths(12 * 32.7)).toBe(3924); // anchor V8's probe value
  });
});

describe("formatC2Date", () => {
  it("renders LOCAL wall clock in the given zone, yyyy-mm-dd hh:mm:ss", () => {
    // 13:40Z on 2026-08-26 is 06:40 in Los Angeles (PDT, UTC-7).
    expect(
      formatC2Date(new Date("2026-08-26T13:40:00Z"), "America/Los_Angeles"),
    ).toBe("2026-08-26 06:40:00");
  });
  it("crosses the calendar-day boundary the spec warns about (anchor K3)", () => {
    // 02:30Z on 2026-08-27 is 19:30 the PREVIOUS day in Los Angeles.
    expect(
      formatC2Date(new Date("2026-08-27T02:30:00Z"), "America/Los_Angeles"),
    ).toBe("2026-08-26 19:30:00");
  });
});

describe("buildResultPost", () => {
  it("builds the spec's summary-level post: work-only distance/time, rest split out, tz first-class", () => {
    const p = buildResultPost(row, opts);
    expect(p).toStrictEqual({
      type: "rower",
      date: "2026-08-26 06:40:00",
      timezone: "America/Los_Angeles",
      distance: 935,
      time: 2548,
      weight_class: "H",
      rest_time: 1800,
      rest_distance: 64,
      stroke_rate: 24,
    });
  });
  it("omits rest fields on a zero-rest row and workout_type when absent", () => {
    const p = buildResultPost({ ...row, restSeconds: 0, restMeters: 0 }, opts);
    expect(p).not.toHaveProperty("rest_time");
    expect(p).not.toHaveProperty("rest_distance");
    expect(p).not.toHaveProperty("workout_type");
  });
  it("carries workout_type when supplied (the zero-rest probe needs it)", () => {
    const p = buildResultPost(row, {
      ...opts,
      workoutType: "VariableInterval",
    });
    expect(p.workout_type).toBe("VariableInterval");
  });
  it("honours timeOverrideTenths — the red-proof's deliberate wrong encoding", () => {
    const p = buildResultPost(row, { ...opts, timeOverrideTenths: 255 });
    expect(p.time).toBe(255);
  });
});

describe("diffRowVsResult", () => {
  const result = {
    id: 339,
    date: "2026-08-26 06:40:00",
    timezone: "America/Los_Angeles",
    distance: 935,
    time: 2548,
    weight_class: "H",
  };
  it("COMPARES a field the result carries — measured live 2026-08-31: C2 returns rest/stroke fields, the blind-list research claim was wrong", () => {
    const diffs = diffRowVsResult(row, opts, {
      ...result,
      rest_time: 1800,
      rest_distance: 64,
      stroke_rate: 24,
    });
    expect(diffs.find((d) => d.field === "rest_time")?.verdict).toBe("match");
    expect(diffs.find((d) => d.field === "stroke_rate")?.verdict).toBe("match");
  });
  it("goes RED on a present-but-wrong rest field", () => {
    const diffs = diffRowVsResult(row, opts, { ...result, rest_time: 999 });
    expect(diffs.find((d) => d.field === "rest_time")?.verdict).toBe(
      "MISMATCH",
    );
  });
  it("marks a field genuinely absent from the response invisible, not matched", () => {
    const diffs = diffRowVsResult(row, opts, result);
    expect(diffs.find((d) => d.field === "distance")?.verdict).toBe("match");
    expect(diffs.find((d) => d.field === "rest_time")?.verdict).toBe(
      "invisible-to-result-object",
    );
  });
  it("goes RED when C2's copy disagrees with the stored row (the gate can fail)", () => {
    const diffs = diffRowVsResult(row, opts, { ...result, time: 255 });
    expect(diffs.find((d) => d.field === "time")?.verdict).toBe("MISMATCH");
  });
});

// Review #2: scope is required at token exchange, not just at authorize.
describe("exchangeCode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("posts the exact six token-exchange params — client_id, client_secret, grant_type, code, redirect_uri, scope", async () => {
    let capturedBody: URLSearchParams | undefined;
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = init?.body as URLSearchParams;
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          access_token: "tok-abc",
          refresh_token: "ref-xyz",
          expires_in: 3600,
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const tokens = await exchangeCode(cfg, "the-code-999");

    expect(tokens.access_token).toBe("tok-abc");
    expect(capturedBody).toBeInstanceOf(URLSearchParams);
    expect([...(capturedBody?.keys() ?? [])].sort()).toStrictEqual(
      [
        "client_id",
        "client_secret",
        "code",
        "grant_type",
        "redirect_uri",
        "scope",
      ].sort(),
    );
    expect(capturedBody?.get("client_id")).toBe("cid");
    expect(capturedBody?.get("client_secret")).toBe("sec");
    expect(capturedBody?.get("grant_type")).toBe("authorization_code");
    expect(capturedBody?.get("code")).toBe("the-code-999");
    expect(capturedBody?.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(capturedBody?.get("scope")).toBe("user:read,results:write");
  });
});

// Review #1: cmdAuth must enforce state before any token exchange. verifyState
// is the pure enforcement predicate cmdAuth wires up.
describe("verifyState", () => {
  it("rejects when the callback carries no state (Branch A requires it)", () => {
    expect(verifyState("nonce-1", null)).toStrictEqual({
      ok: false,
      reason: "state missing from callback",
    });
  });
  it("rejects when the echoed state does not match the nonce", () => {
    expect(verifyState("nonce-1", "someone-elses-value")).toStrictEqual({
      ok: false,
      reason: "state mismatch: got someone-elses-value",
    });
  });
  it("on a match, returns a receipt carrying independently-verifiable sha256 hex of both sides — FIPS 180-4's own published test vector, sha256('abc')", () => {
    const fixedNow = new Date("2026-08-31T12:00:00.000Z");
    const result = verifyState("abc", "abc", () => fixedNow);
    expect(result).toStrictEqual({
      ok: true,
      receipt: {
        nonceSha256:
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        echoedSha256:
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        equal: true,
        at: "2026-08-31T12:00:00.000Z",
      },
    });
  });
});

// Review #5a: a 409 (dedup) body can still carry an id, but it is not FRESH
// evidence for the red-proof — only a genuine 201 is.
describe("evaluateFreshPost", () => {
  it("accepts a fresh 201 carrying an id", () => {
    expect(evaluateFreshPost(201, 445566)).toStrictEqual({
      ok: true,
      id: "445566",
    });
  });
  it("rejects a 409 even though the dedup body carries an id", () => {
    expect(evaluateFreshPost(409, 998877)).toStrictEqual({
      ok: false,
      message: "RED-PROOF ABORTED: expected fresh 201, got 409",
    });
  });
  it("rejects a 201 with no id in the body", () => {
    expect(evaluateFreshPost(201, undefined)).toStrictEqual({
      ok: false,
      message: "RED-PROOF ABORTED: expected fresh 201, got 201",
    });
  });
});

// Review #5b: fetchResult must not launder a bad response into an
// "invisible" verdict.
describe("fetchResult", () => {
  const sessionJson = JSON.stringify({
    tokens: { access_token: "session-tok", refresh_token: "r", expires_in: 1 },
    obtainedAt: "2026-08-31T00:00:00.000Z",
    stateEchoed: true,
    stateReceipt: {
      nonceSha256: "x",
      echoedSha256: "x",
      equal: true,
      at: "2026-08-31T00:00:00.000Z",
    },
  });

  beforeEach(() => {
    fsMocks.readFile.mockReset().mockResolvedValue(sessionJson);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws with the status and body on a non-2xx response — no laundered invisible verdict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: "invalid_token" }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchResult(cfg, "778899")).rejects.toThrow(
      /fetchResult failed: 401.*invalid_token/,
    );
  });

  it("throws 'malformed result response' on a 2xx body with no data object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "{}",
      })) as unknown as typeof fetch,
    );
    await expect(fetchResult(cfg, "778899")).rejects.toThrow(
      "malformed result response",
    );
  });

  it("throws 'malformed result response' when data is present but carries no id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { distance: 935 } }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchResult(cfg, "778899")).rejects.toThrow(
      "malformed result response",
    );
  });

  // P1 fix (PR0 re-review, James): this test used to accept response id
  // 445566 for a fetchResult("778899") call — a stale/wrong row could
  // therefore supply the red-proof's "evidence". It now pins the opposite:
  // a mismatched id must throw, naming both ids.
  it("throws on an id mismatch — a stale/wrong row must not stand in for the requested one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: { id: 445566, distance: 935 } }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchResult(cfg, "778899")).rejects.toThrow(
      "fetchResult id mismatch: requested 778899, got 445566",
    );
  });

  it("returns data on a well-formed 2xx body whose id matches the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: { id: 445566, distance: 935 } }),
      })) as unknown as typeof fetch,
    );
    await expect(fetchResult(cfg, "445566")).resolves.toStrictEqual({
      id: 445566,
      distance: 935,
    });
  });
});

// P1 fix (PR0 re-review, James): cmdProbeRed used to log `match` or
// `UNPROVEN` and still exit 0. redProofVerdict is the pure decision it now
// wires up — anything but a MISMATCH on the "time" field must stop the
// evidence sequence.
describe("redProofVerdict", () => {
  it("rejects when the time field is missing from the diff entirely", () => {
    expect(redProofVerdict([])).toStrictEqual({
      ok: false,
      reason: "no 'time' field in the diff — nothing to prove red",
    });
  });
  it("rejects when cameBack is undefined — invisible-to-result-object, the UNPROVEN arm", () => {
    const diffs: FieldDiff[] = [
      {
        field: "time",
        expected: 100,
        cameBack: undefined,
        verdict: "invisible-to-result-object",
      },
    ];
    expect(redProofVerdict(diffs)).toStrictEqual({
      ok: false,
      reason:
        "time verdict is invisible-to-result-object (cameBack=undefined), required MISMATCH",
    });
  });
  it("rejects on a match — the red-proof exists to prove MISMATCH, not agreement", () => {
    const diffs: FieldDiff[] = [
      { field: "time", expected: 100, cameBack: 100, verdict: "match" },
    ];
    expect(redProofVerdict(diffs)).toStrictEqual({
      ok: false,
      reason: "time verdict is match (cameBack=100), required MISMATCH",
    });
  });
  it("accepts a MISMATCH — independent literals, not derived from the fixture (RF21)", () => {
    const diffs: FieldDiff[] = [
      { field: "time", expected: 700, cameBack: 701, verdict: "MISMATCH" },
    ];
    expect(redProofVerdict(diffs)).toStrictEqual({ ok: true });
  });
});

// Review #1 (integration): cmdAuth wires verifyState in — abort before any
// token exchange on failure, store+print a receipt on success.
describe("cmdAuth", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    readlineMocks.question.mockReset();
    readlineMocks.close.mockReset();
    fsMocks.writeFile.mockReset().mockResolvedValue(undefined);
    fsMocks.chmod.mockReset().mockResolvedValue(undefined);
    cryptoMocks.randomBytes.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts BEFORE any token exchange when the callback carries no state", async () => {
    cryptoMocks.randomBytes.mockReturnValue(Buffer.alloc(16, 0x11));
    readlineMocks.question.mockResolvedValue(`${cfg.redirectUri}?code=abc123`);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await cmdAuth(cfg);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      logSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes("AUTH ABORTED: state missing from callback"),
      ),
    ).toBe(true);
  });

  it("aborts BEFORE any token exchange when the echoed state does not match the nonce", async () => {
    cryptoMocks.randomBytes.mockReturnValue(Buffer.alloc(16, 0x22));
    readlineMocks.question.mockResolvedValue(
      `${cfg.redirectUri}?code=abc123&state=not-the-nonce`,
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await cmdAuth(cfg);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      logSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes(
          "AUTH ABORTED: state mismatch: got not-the-nonce",
        ),
      ),
    ).toBe(true);
  });

  it("on a matching state: exchanges the code, writes a 0600 session with a state receipt, chmods it, and prints the receipt", async () => {
    const nonceBuf = Buffer.alloc(16, 0x33);
    const nonceHex = nonceBuf.toString("hex");
    cryptoMocks.randomBytes.mockReturnValue(nonceBuf);
    readlineMocks.question.mockResolvedValue(
      `${cfg.redirectUri}?code=abc123&state=${nonceHex}`,
    );
    let call = 0;
    const fetchSpy = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => "",
          json: async () => ({
            access_token: "tok-1",
            refresh_token: "ref-1",
            expires_in: 3600,
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 909 } }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    await cmdAuth(cfg);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(1);
    const [path, contents, writeOpts] = fsMocks.writeFile.mock.calls[0] as [
      unknown,
      string,
      { mode: number },
    ];
    expect(String(path)).toContain(".ergomatic-c2-dev.json");
    expect(writeOpts).toStrictEqual({ mode: 0o600 });
    const saved = JSON.parse(contents) as {
      stateEchoed: boolean;
      stateReceipt: {
        equal: boolean;
        nonceSha256: string;
        echoedSha256: string;
      };
    };
    expect(saved.stateEchoed).toBe(true);
    expect(saved.stateReceipt.equal).toBe(true);
    expect(saved.stateReceipt.nonceSha256).toBe(
      saved.stateReceipt.echoedSha256,
    );
    expect(fsMocks.chmod).toHaveBeenCalledWith(
      expect.stringContaining(".ergomatic-c2-dev.json"),
      0o600,
    );
    expect(
      logSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes("State receipt"),
      ),
    ).toBe(true);
  });
});

// P1 fix (PR0 re-review, James, verbatim): "Production now correctly calls
// redProofVerdict and exits for a non-MISMATCH … but every new test invokes
// only the extracted helper. Deleting or negating the command's
// `if (!verdict.ok)` branch leaves all 37 tests green and lets
// match/UNPROVEN reach the success log." These drive cmdProbeRed itself end
// to end — a fresh 201 post plus an id-matching GET — so that branch at the
// command's own call site is what is under test, not only redProofVerdict.
describe("cmdProbeRed", () => {
  const sessionJson = JSON.stringify({
    tokens: { access_token: "session-tok", refresh_token: "r", expires_in: 1 },
    obtainedAt: "2026-08-31T00:00:00.000Z",
    stateEchoed: true,
    stateReceipt: {
      nonceSha256: "x",
      echoedSha256: "x",
      equal: true,
      at: "2026-08-31T00:00:00.000Z",
    },
  });

  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fsMocks.readFile.mockReset().mockResolvedValue(sessionJson);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const sawSuccessLine = (calls: unknown[][]) =>
    calls.some((c) => String(c[0]).includes("MISMATCH confirmed"));

  // The POST always succeeds fresh (201, an id) in every case below — only
  // the GET-back diff's "time" verdict varies, which is exactly what
  // redProofVerdict (and the command branch reading it) decides on.
  const stubPostThenGet = (getTimeField: { time?: number }) => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            status: 201,
            text: async () => JSON.stringify({ data: { id: 90909 } }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ data: { id: 90909, ...getTimeField } }),
        };
      }) as unknown as typeof fetch,
    );
  };

  it("time MATCHES on the fresh GET: exits 1, no success line — a deleted/negated command guard would let this through", async () => {
    stubPostThenGet({ time: 2548 }); // c2Tenths(FIXTURE.workSeconds) — independent literal, not derived (RF21)

    await cmdProbeRed(cfg);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(sawSuccessLine(logSpy.mock.calls)).toBe(false);
    expect(
      errorSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes(
          "RED-PROOF FAILED: time verdict is match (cameBack=2548), required MISMATCH",
        ),
      ),
    ).toBe(true);
  });

  it("time is invisible/missing on the fresh GET: exits 1, no success line", async () => {
    stubPostThenGet({}); // no "time" key at all in the GET body

    await cmdProbeRed(cfg);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(sawSuccessLine(logSpy.mock.calls)).toBe(false);
    expect(
      errorSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes(
          "RED-PROOF FAILED: time verdict is invisible-to-result-object (cameBack=undefined), required MISMATCH",
        ),
      ),
    ).toBe(true);
  });

  it("time MISMATCHES on the fresh GET: succeeds, no exit(1)", async () => {
    stubPostThenGet({ time: 255 }); // the classic wrong-encoding value (raw seconds, not tenths) — independent literal (RF21)

    await cmdProbeRed(cfg);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(sawSuccessLine(logSpy.mock.calls)).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
