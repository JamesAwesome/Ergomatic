import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseSelection } from "../selection.mjs";
import {
  discoverSpecifications,
  executeSpecifications,
} from "../selection-vitest.mjs";

function fixture(t) {
  const app = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-exact-native-")),
  );
  t.after(() => fs.rmSync(app, { recursive: true, force: true }));
  const bodies = path.join(app, "bodies");
  fs.writeFileSync(
    path.join(app, "vitest.config.mjs"),
    `export default {test:{maxWorkers:1,projects:[{test:{name:'unit',globals:true,include:['*.test.js']}}]}};`,
  );
  for (const name of ["a", "aa", "space ü"])
    fs.writeFileSync(
      path.join(app, `${name}.test.js`),
      `import {appendFileSync} from 'node:fs';
it('selected name',()=>appendFileSync(${JSON.stringify(bodies)},${JSON.stringify(name + "\n")}));
it('another name',()=>appendFileSync(${JSON.stringify(bodies)},'other\\n'));
`,
    );
  return {
    app,
    bodies,
    request: (args = ["a.test.js"]) =>
      parseSelection(
        ["--project", "unit", "--maxWorkers", "1", ...args],
        "files",
      ),
  };
}

test("native discovery executes no bodies and exact objects never substring-match", async (t) => {
  const f = fixture(t),
    request = f.request([
      "a.test.js",
      "space ü.test.js",
      "-t",
      "^selected name$",
    ]);
  const discovered = await discoverSpecifications({ app: f.app, request });
  assert.deepEqual(discovered.selected, [
    { project: "unit", file: path.join(f.app, "a.test.js") },
    { project: "unit", file: path.join(f.app, "space ü.test.js") },
  ]);
  assert.equal(fs.existsSync(f.bodies), false);
  const result = await executeSpecifications({
    app: f.app,
    request,
    selected: discovered.selected,
  });
  assert.equal(result.failed, false);
  assert.deepEqual(
    fs.readFileSync(f.bodies, "utf8").trim().split("\n").sort(),
    ["a", "space ü"],
  );
});

test("unknown exact path refuses before bodies; a wrong project cannot execute", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    discoverSpecifications({ app: f.app, request: f.request(["*.test.js"]) }),
  );
  await assert.rejects(
    executeSpecifications({
      app: f.app,
      request: f.request(),
      selected: [{ project: "client", file: path.join(f.app, "a.test.js") }],
    }),
    /membership/,
  );
  assert.equal(fs.existsSync(f.bodies), false);
});

test("unmatched names refuse instead of crediting an all-skipped pass", async (t) => {
  const f = fixture(t),
    request = f.request(["a.test.js", "-t", "^missing$"]);
  const { selected } = await discoverSpecifications({ app: f.app, request });
  await assert.rejects(
    executeSpecifications({ app: f.app, request, selected }),
    /matched no runnable tests/,
  );
  assert.equal(fs.existsSync(f.bodies), false);
});

test("native ordinary failures and module-load errors remain failures", async (t) => {
  const beforeExit = process.exitCode;
  t.after(() => {
    process.exitCode = beforeExit;
  });
  const f = fixture(t),
    request = f.request();
  const { selected } = await discoverSpecifications({ app: f.app, request });
  fs.writeFileSync(
    path.join(f.app, "a.test.js"),
    "it('fails',()=>{throw new Error('assertion witness')});",
  );
  assert.equal(
    (await executeSpecifications({ app: f.app, request, selected })).failed,
    true,
  );
  process.exitCode = beforeExit;
  fs.writeFileSync(
    path.join(f.app, "a.test.js"),
    "throw new Error('load witness');",
  );
  assert.equal(
    (await executeSpecifications({ app: f.app, request, selected })).failed,
    true,
  );
});

test("native unhandled rejections cannot credit otherwise passing assertions", async (t) => {
  const beforeExit = process.exitCode;
  t.after(() => {
    process.exitCode = beforeExit;
  });
  const f = fixture(t),
    request = f.request();
  fs.writeFileSync(
    path.join(f.app, "a.test.js"),
    "it('assertion passes',async()=>{Promise.reject(new Error('unhandled witness'));await new Promise(resolve=>setTimeout(resolve,20));expect(1).toBe(1)});",
  );
  const { selected } = await discoverSpecifications({ app: f.app, request });
  assert.equal(
    (await executeSpecifications({ app: f.app, request, selected })).failed,
    true,
  );
});

test("native discovery preserves preexisting process signal listeners", async (t) => {
  const f = fixture(t);
  const events = ["SIGINT", "SIGTERM"];
  let calls = 0;
  const sentinel = () => {
    calls++;
  };
  for (const event of events) process.on(event, sentinel);
  t.after(() => {
    for (const event of events) process.off(event, sentinel);
  });
  await discoverSpecifications({ app: f.app, request: f.request() });
  for (const event of events) {
    assert.ok(process.listeners(event).includes(sentinel));
    assert.equal(
      process.listeners(event).filter((listener) => listener === sentinel)
        .length,
      1,
    );
  }
  assert.equal(calls, 0);
});

test("already-cancelled selection starts no native bodies", async (t) => {
  const f = fixture(t),
    request = f.request();
  const { selected } = await discoverSpecifications({ app: f.app, request });
  const controller = new AbortController();
  controller.abort(new Error("cancellation witness"));
  await assert.rejects(
    executeSpecifications({
      app: f.app,
      request,
      selected,
      signal: controller.signal,
    }),
    /cancellation witness/,
  );
  assert.equal(fs.existsSync(f.bodies), false);
});

test("native teardown errors cannot turn passing assertions into command success", async (t) => {
  const f = fixture(t),
    request = f.request();
  fs.writeFileSync(
    path.join(f.app, "vitest.config.mjs"),
    `export default {test:{maxWorkers:1,projects:[{test:{name:'unit',globals:true,include:['*.test.js'],globalSetup:'./setup.mjs'}}]}};`,
  );
  fs.writeFileSync(
    path.join(f.app, "setup.mjs"),
    "export default ()=>()=>{throw new Error('teardown witness')};",
  );
  const { selected } = await discoverSpecifications({ app: f.app, request });
  await assert.rejects(
    executeSpecifications({ app: f.app, request, selected }),
    /teardown/,
  );
});

test("SIGINT through the native child preserves cancellation and finishes owned fork teardown", async (t) => {
  const f = fixture(t),
    request = f.request();
  const ready = path.join(f.app, "ready"),
    release = path.join(f.app, "release"),
    closed = path.join(f.app, "closed");
  fs.writeFileSync(
    path.join(f.app, "a.test.js"),
    `import fs from 'node:fs';
afterAll(()=>fs.writeFileSync(${JSON.stringify(closed)},'closed'));
it('controlled cancellation',async()=>{fs.writeFileSync(${JSON.stringify(ready)},'ready');
const deadline=Date.now()+5000;while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>deadline)throw new Error('fixture release deadline');await new Promise(resolve=>setTimeout(resolve,10));}});`,
  );
  const input = path.join(f.app, "input.json"),
    output = path.join(f.app, "output.json");
  fs.writeFileSync(
    input,
    JSON.stringify({
      app: f.app,
      request,
      selected: [{ project: "unit", file: path.join(f.app, "a.test.js") }],
    }),
  );
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../selection-child.mjs", import.meta.url)),
      "execute",
      input,
      output,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(child.exitCode === null && child.signalCode === null, stderr);
      assert.ok(Date.now() < deadline, "fixture readiness deadline");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  await waitFor(() => fs.existsSync(ready));
  child.kill("SIGINT");
  await waitFor(() => stderr.includes("cancelling native runner on SIGINT"));
  fs.writeFileSync(release, "release");
  assert.deepEqual(await done, { code: 130, signal: null }, stderr);
  assert.equal(fs.readFileSync(closed, "utf8"), "closed");
  assert.equal(
    fs.existsSync(output),
    false,
    "cancelled execution must not publish a successful result",
  );
});

test("SIGINT cannot exit the native child while its global teardown is still held", async (t) => {
  const f = fixture(t),
    request = f.request();
  const closing = path.join(f.app, "closing"),
    release = path.join(f.app, "release"),
    closed = path.join(f.app, "closed");
  fs.writeFileSync(
    path.join(f.app, "vitest.config.mjs"),
    `export default {test:{maxWorkers:1,projects:[{test:{name:'unit',globals:true,include:['*.test.js'],globalSetup:'./setup.mjs'}}]}};`,
  );
  fs.writeFileSync(
    path.join(f.app, "setup.mjs"),
    `import fs from 'node:fs'; export default ()=>async()=>{
    fs.writeFileSync(${JSON.stringify(closing)},'closing');
    const deadline=Date.now()+5000;
    while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>deadline)throw new Error('teardown release deadline');await new Promise(resolve=>setTimeout(resolve,10));}
    fs.writeFileSync(${JSON.stringify(closed)},'closed');
  };`,
  );
  const input = path.join(f.app, "input.json"),
    output = path.join(f.app, "output.json");
  fs.writeFileSync(
    input,
    JSON.stringify({
      app: f.app,
      request,
      selected: [{ project: "unit", file: path.join(f.app, "a.test.js") }],
    }),
  );
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../selection-child.mjs", import.meta.url)),
      "execute",
      input,
      output,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(closing)) {
      assert.ok(child.exitCode === null && child.signalCode === null, stderr);
      assert.ok(Date.now() < deadline, "global teardown readiness deadline");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    child.kill("SIGINT");
    while (!stderr.includes("cancelling native runner on SIGINT")) {
      assert.ok(Date.now() < deadline, "signal acknowledgement deadline");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // The readiness barrier above has started teardown, and only this parent
    // can release it. The installed logger's 1ms forced exit must not win.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      child.exitCode,
      null,
      "native child exited before teardown release",
    );
    fs.writeFileSync(release, "release");
    assert.deepEqual(await done, { code: 130, signal: null }, stderr);
    assert.equal(fs.readFileSync(closed, "utf8"), "closed");
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.writeFileSync(release, "release");
    await done;
  }
});
