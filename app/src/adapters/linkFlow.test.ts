import { afterEach, describe, expect, it, vi } from "vitest";

// Wave E PR1.75b (2026-09-02-concept2-pr175-app-bind-design.md §4 and its
// §Testing "Adapter `linkFlow`" bullet). Same `vi.doMock("../platform")` +
// `vi.resetModules()` idiom `externalBrowser.test.ts`/`appLifecycle.test.ts`
// already establish for a platform branch. The plugin is mocked AT THE SEAM
// (`../native/webAuth`), never below it: `src/native/**` is coverage-exempt
// and unreachable off-device, so the only honest thing to assert here is what
// this adapter SENDS to the plugin and what it does with each answer. The
// plugin's own behaviour is walk-verified (Task 6), and this file's header
// says so rather than implying otherwise.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../platform");
  vi.doUnmock("../api");
  vi.doUnmock("../native/webAuth");
  vi.doUnmock("./externalBrowser");
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mints, then answers `exchange`. **Both are FACTORIES, invoked per request,
 * and that is load-bearing rather than stylistic.**
 *
 * The reason is CROSS-TEST first: `MINT_OK` is ONE module-scope constant and
 * every test in this file passes it to `mockApi`. A `Response` body can be read
 * exactly once, so a single shared `Response` object would be consumed by the
 * first test to run and throw `Body is unusable: Body has already been read` in
 * all the others -- a whole-file failure whose message names nothing about the
 * assertion that broke.
 *
 * It also matters WITHIN the busy test, which mints twice: with a shared
 * `Response`, the third call's `res.json()` throws, `startLink` catches it and
 * returns `{kind:"networkError"}`, `WebAuth.start` is never called, and
 * `vi.waitFor(() => expect(releases).toHaveLength(2))` fails -- so the
 * `linkInFlight` mutation that assertion exists to kill would look like a false
 * alarm. A fresh `Response` per request is what makes both assertions mean what
 * their titles say.
 */
function mockApi(mint: () => Response, exchange?: () => Response) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const api = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path === "/api/concept2/connect") return mint();
    if (path === "/api/concept2/exchange") {
      if (!exchange)
        throw new Error("exchange called but no response was staged");
      return exchange();
    }
    throw new Error(`unexpected api path ${path}`);
  });
  vi.doMock("../api", () => ({ api }));
  return { api, calls };
}

function mockPlugin(start: ReturnType<typeof vi.fn>) {
  vi.doMock("../native/webAuth", () => ({ WebAuth: { start } }));
}

const MINT_OK = () =>
  jsonResponse(200, {
    authorizeUrl:
      "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
    state: "abc",
  });

describe("startLink on native", () => {
  it("mints with linkClient webauth-1, opens an EPHEMERAL session on the bare scheme, exchanges {code, state}, and reports the link", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { calls } = mockApi(MINT_OK, () =>
      jsonResponse(200, { linked: true, c2UserId: 2211, weightClass: "H" }),
    );
    const start = vi.fn(async () => ({
      callbackUrl:
        "haus.waffle.ergomatic://oauth/callback?code=CODE1&state=abc",
    }));
    mockPlugin(start);
    vi.resetModules();
    const { startLink, LINK_CALLBACK_SCHEME, LINK_CLIENT } =
      await import("./linkFlow");

    const outcome = await startLink({ weightClass: "H" });

    expect(JSON.parse(String(calls[0]!.init!.body))).toStrictEqual({
      weightClass: "H",
      linkClient: LINK_CLIENT,
    });
    expect(start).toHaveBeenCalledExactlyOnceWith({
      url: "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
      callbackScheme: LINK_CALLBACK_SCHEME,
      ephemeral: true,
    });
    // Both pinned as INDEPENDENT literals, not read back from the imports the
    // assertions above use. Without these two lines the body assertion is a
    // self-comparison: it agrees with `LINK_CLIENT` whatever `LINK_CLIENT`
    // says, so retyping the constant would leave this file green and every
    // native link dead (the server answers 409 and issues no attempt). The
    // cross-file half -- that the server spells the same two values -- is
    // `scripts/webauth-contract.test.ts`'s job.
    expect(LINK_CALLBACK_SCHEME).toBe("haus.waffle.ergomatic");
    expect(LINK_CLIENT).toBe("webauth-1");
    expect(JSON.parse(String(calls[1]!.init!.body))).toStrictEqual({
      code: "CODE1",
      state: "abc",
    });
    expect(outcome).toStrictEqual({
      kind: "linked",
      c2UserId: 2211,
      weightClass: "H",
      stateEchoed: true,
    });
  });

  it("exchanges the MINT's state, not the callback's, when the callback omits state (the echo-independence case)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { calls } = mockApi(MINT_OK, () =>
      jsonResponse(200, { linked: true, c2UserId: 2211, weightClass: "L" }),
    );
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=CODE2",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "L" });

    expect(JSON.parse(String(calls[1]!.init!.body))).toStrictEqual({
      code: "CODE2",
      state: "abc",
    });
    expect(outcome).toStrictEqual({
      kind: "linked",
      c2UserId: 2211,
      weightClass: "L",
      stateEchoed: false,
    });
  });

  it("refuses to exchange when the callback carries a DIFFERENT state, and says nothing about the two values", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?code=CODE3&state=NOTABC",
      })),
    );
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "H" });

    expect(outcome).toStrictEqual({ kind: "stateMismatch" });
    expect(api).toHaveBeenCalledExactlyOnceWith(
      "/api/concept2/connect",
      expect.anything(),
    );
    const logged = String(error.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("[linkFlow]");
    expect(logged).not.toContain("NOTABC");
    expect(logged).not.toContain("abc");
  });

  it("reports `declined` and never exchanges when Concept2 returns error=access_denied", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?error=access_denied&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "declined",
      stateEchoed: true,
    });
    expect(api).toHaveBeenCalledOnce();
  });

  it("treats an EMPTY `code=` as no code at all, so a decline that carries one still reports `declined`", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK);
    // `params.get("code")` answers `""` here, not `null` (measured, Node 26).
    // Read as a code, that empty string both defeats the `access_denied`
    // branch below it and POSTs `{code:""}`, so a rower's decline comes back
    // as `exchangeFailed 400 "code must be a string"` -- a server error where
    // the truth is a human decision.
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?code=&error=access_denied&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "declined",
      stateEchoed: true,
    });
    // The mint only. Nothing was exchanged, so the attempt is left to expire.
    expect(api).toHaveBeenCalledOnce();
  });

  it("reports `malformed` (never `cancelled`) for a callback with neither a code nor a recognised error", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?error=server_error",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "malformed",
      stateEchoed: false,
    });
  });

  it("the PLUGIN's busy names its own source, so the card can tell it from the JS guard's", async () => {
    // Pulled out of the `it.each` table below: that block shares ONE
    // `toStrictEqual({ kind })` assertion across its rows, which cannot
    // express the extra `source` field without breaking the others.
    // linkFlow.ts's own `case "busy"` comment requires the two sources to
    // render differently; before PR2 the union could not say which was which.
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => {
        const err = new Error("rejected") as Error & { code: string };
        err.code = "busy";
        throw err;
      }),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "busy",
      source: "sheet",
    });
  });

  it.each([
    ["cancelled", "cancelled"],
    ["abandoned", "abandoned"],
    ["noWindow", "noWindow"],
    ["noContext", "noContext"],
    ["contextInvalid", "contextInvalid"],
  ])(
    "maps the plugin's `%s` rejection onto the same typed outcome",
    async (code, kind) => {
      vi.doMock("../platform", () => ({ isNative: () => true }));
      mockApi(MINT_OK);
      mockPlugin(
        vi.fn(async () => {
          const err = new Error("rejected") as Error & { code: string };
          err.code = code;
          throw err;
        }),
      );
      vi.resetModules();
      const { startLink } = await import("./linkFlow");

      expect(await startLink({ weightClass: "H" })).toStrictEqual({ kind });
    },
  );

  it("does NOT fold an unrecognised plugin rejection into `cancelled`", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => {
        const err = new Error("the system will not start one") as Error & {
          code: string;
        };
        err.code = "cannotStart";
        throw err;
      }),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "pluginError",
      code: "cannotStart",
      message: "the system will not start one",
    });
  });

  it("reports `updateRequired` on the mint's 409 and never opens a session", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(() => jsonResponse(409, { error: "update_required" }));
    const start = vi.fn();
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "updateRequired",
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("does NOT open the update door when the 409's `error` is not a string, and reports the raw mint failure instead", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    // `readError` returns `null` for an `error` that is present but not a
    // string, so the `update_required` comparison cannot match on a shape it
    // did not mean. Keying the door on a loose truthiness check instead would
    // send a rower to "update the app" on any malformed 409.
    mockApi(() => jsonResponse(409, { error: ["update_required"] }));
    const start = vi.fn();
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "mintFailed",
      status: 409,
      error: null,
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("reports `pluginError` with an `unknown` code when the plugin rejects with a non-Error that carries no `code`", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    // Nothing in `WebAuthPlugin.swift` produces this today -- every arm there
    // rejects with a message and one of nine codes -- but a bridge-level
    // failure, a foreign plugin, or a future Capacitor change can hand us any
    // value at all. The contract is that such a value still lands on the
    // typed union with a code the caller can render, rather than throwing
    // out of `startLink` or arriving as `code: "undefined"`.
    mockPlugin(
      vi.fn().mockRejectedValue({ errorMessage: "the bridge went away" }),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "pluginError",
      code: "unknown",
      // `String({})`'s answer, asserted rather than avoided: there is no
      // better message available from a value that carries none, and pinning
      // it says the degradation is deliberate.
      message: "[object Object]",
    });
  });

  it("passes the exchange's typed error through so a caller can key on body.error", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK, () => jsonResponse(403, { error: "principal_mismatch" }));
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?code=CODE4&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "exchangeFailed",
      status: 403,
      error: "principal_mismatch",
      stateEchoed: true,
    });
  });

  it("reports `serverError` for a non-2xx whose body is not {error} JSON (an old image's Express 404 HTML mid-deploy)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(
      MINT_OK,
      () =>
        new Response(
          "<!DOCTYPE html><p>Cannot POST /api/concept2/exchange</p>",
          {
            status: 404,
            headers: { "Content-Type": "text/html" },
          },
        ),
    );
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?code=CODE5&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "serverError",
      status: 404,
      stateEchoed: true,
    });
  });

  it("reports `serverError` for a non-2xx whose JSON body carries no `error` key at all", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    // The sibling of the HTML case above, and a DIFFERENT branch: this body
    // parses as JSON perfectly well and simply has no `error` in it (a proxy's
    // own `{message}` envelope). `exchangeFailed` promises a caller a `string`
    // to key on, so a body that names no error must not be dressed as one.
    mockApi(MINT_OK, () =>
      jsonResponse(500, { message: "upstream timed out" }),
    );
    mockPlugin(
      vi.fn(async () => ({
        callbackUrl:
          "haus.waffle.ergomatic://oauth/callback?code=CODE7&state=abc",
      })),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "serverError",
      status: 500,
      stateEchoed: true,
    });
  });

  it("reports `networkError` when the mint request itself throws, and RELEASES the guard so the next tap works", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    // The tunnel drops: `api()` rejects rather than answering. Without the
    // catch this escapes `startLink` as a rejected promise and the probe card
    // shows nothing; without the `finally`, the guard stays set forever.
    let thrownYet = false;
    const api = vi.fn(async (path: string) => {
      if (!thrownYet) {
        thrownYet = true;
        throw new Error("Load failed");
      }
      if (path === "/api/concept2/connect") return MINT_OK();
      return jsonResponse(200, {
        linked: true,
        c2UserId: 2211,
        weightClass: "H",
      });
    });
    vi.doMock("../api", () => ({ api }));
    const start = vi.fn(async () => ({
      callbackUrl:
        "haus.waffle.ergomatic://oauth/callback?code=CODE6&state=abc",
    }));
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "networkError",
      message: "Load failed",
    });
    expect(start).not.toHaveBeenCalled();

    // The guard released: the next tap gets past `linkInFlight` and completes.
    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "linked",
      c2UserId: 2211,
      weightClass: "H",
      stateEchoed: true,
    });
  });

  it("reports `networkError` carrying the stringified value when `api()` rejects with something that is not an Error", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    // `api()`'s own fetch normally rejects with a `TypeError`, but the catch
    // is the module's last line of defence and must not depend on that: a
    // rejected non-Error (a bridge or a polyfill handing back a bare string)
    // still has to reach the probe card as a readable message rather than
    // `undefined` from `err.message` on a value that has no such property.
    const api = vi.fn().mockRejectedValue("the tunnel went away");
    vi.doMock("../api", () => ({ api }));
    const start = vi.fn();
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "networkError",
      message: "the tunnel went away",
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("refuses a SECOND concurrent call with `busy` without minting again (the UX guard; the plugin is the authority)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { api } = mockApi(MINT_OK, () =>
      jsonResponse(200, { linked: true, c2UserId: 1, weightClass: "H" }),
    );
    // ONE RESOLVER PER PLUGIN CALL. Every `WebAuth.start()` returns a fresh
    // never-resolved promise, so a single `release` variable cannot release the
    // first session AND the third one -- the third `await startLink()` would
    // hang on a resolver nobody ever calls.
    const releases: ((r: { callbackUrl: string }) => void)[] = [];
    mockPlugin(
      vi.fn(
        () =>
          new Promise<{ callbackUrl: string }>((resolve) => {
            releases.push(resolve);
          }),
      ),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const first = startLink({ weightClass: "H" });
    const second = await startLink({ weightClass: "H" });

    expect(second).toStrictEqual({ kind: "busy", source: "guard" });
    expect(api).toHaveBeenCalledOnce();

    // `await startLink()` above yields ONE microtask; the first attempt is
    // still inside `await res.json()`, which settles on a LATER task, so a
    // release fired here lands on a resolver that does not exist yet and is
    // dropped silently -- `await first` then never settles (measured, Node 26).
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases[0]!({
      callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=C&state=abc",
    });
    await first;

    // And the guard RELEASES: a third call after the first settles mints again.
    // The wait is on the SECOND resolver being armed, which is the observable
    // that the third attempt got past `linkInFlight` and reached the plugin.
    const third = startLink({ weightClass: "H" });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(
      api.mock.calls.filter((c) => c[0] === "/api/concept2/connect"),
    ).toHaveLength(2);
    releases[1]!({
      callbackUrl: "haus.waffle.ergomatic://oauth/callback?code=C2&state=abc",
    });
    await third;
  });
});

describe("startLink on web", () => {
  it("mints WITHOUT a linkClient declaration and hands off to a full-page navigation", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { calls } = mockApi(MINT_OK);
    const openExternalUrl = vi.fn();
    vi.doMock("./externalBrowser", () => ({ openExternalUrl }));
    const start = vi.fn();
    mockPlugin(start);
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    const outcome = await startLink({ weightClass: "L" });

    expect(JSON.parse(String(calls[0]!.init!.body))).toStrictEqual({
      weightClass: "L",
    });
    expect(openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      "https://log-dev.concept2.com/oauth/authorize?client_id=1&state=abc",
    );
    expect(start).not.toHaveBeenCalled();
    expect(outcome).toStrictEqual({ kind: "navigating" });
  });

  it("reports a failed mint with its status and typed error, and navigates nowhere", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    mockApi(() => jsonResponse(403, { error: "unavailable" }));
    const openExternalUrl = vi.fn();
    vi.doMock("./externalBrowser", () => ({ openExternalUrl }));
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
      kind: "mintFailed",
      status: 403,
      error: "unavailable",
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
  });
});
