import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appSource = fileURLToPath(new URL("../../../", import.meta.url));

function fixture(t) {
  const app = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-mutation-")),
  );
  t.after(() => fs.rmSync(app, { recursive: true, force: true }));
  fs.mkdirSync(path.join(app, "domain"));
  fs.symlinkSync(
    path.join(appSource, "node_modules"),
    path.join(app, "node_modules"),
  );
  const sentinel = path.join(app, "body");
  fs.writeFileSync(
    path.join(app, "domain/witness.test.ts"),
    `import {test} from 'vitest';
import {writeFileSync} from 'node:fs';
test('body witness',()=>writeFileSync(${JSON.stringify(sentinel)},'executed'));`,
  );
  return { app, sentinel };
}

function runInner(f, overrides = {}, extraEnv = {}) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
import {createVitest} from ${JSON.stringify(import.meta.resolve("vitest/node"))};
const ctx=await createVitest('test', {
  root:${JSON.stringify(f.app)},
  config:${JSON.stringify(path.join(appSource, "vitest.stryker.config.ts"))},
  watch:false,run:true,pool:'threads',maxWorkers:1,maxConcurrency:1,isolate:true,
  ...${JSON.stringify(overrides)}
});
try { await ctx.start(); } finally { await ctx.close(); }
`,
    ],
    {
      cwd: f.app,
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        NODE_OPTIONS: "--no-experimental-webstorage",
        ...extraEnv,
      },
    },
  );
}

// Removing the production onInit guard must execute the sentinel and fail
// this assertion. The real config and installed Vitest start path stay real.
test("native mutation config refuses excessive inner workers before bodies", (t) => {
  const f = fixture(t),
    result = runInner(f, { maxWorkers: 2 });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr + result.stdout, /Mutation inner budget/);
  assert.equal(fs.existsSync(f.sentinel), false);
});

test("native mutation config preserves one isolated thread and executes bodies", (t) => {
  const f = fixture(t),
    result = runInner(f);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(f.sentinel, "utf8"), "executed");
});

test("native mutation config rejects changed isolation, pool and inner concurrency", (t) => {
  for (const overrides of [
    { isolate: false },
    { pool: "forks" },
    { maxConcurrency: 2 },
  ]) {
    const f = fixture(t),
      result = runInner(f, overrides);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr + result.stdout, /Mutation inner budget/);
    assert.equal(fs.existsSync(f.sentinel), false);
  }
});

test("native mutation witness guard refuses a widened include before bodies", (t) => {
  const f = fixture(t),
    directory = path.join(f.app, "receipt");
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(
    path.join(directory, "stryker.config.json"),
    JSON.stringify({ testFiles: ["domain/witness.test.ts"] }),
  );
  const result = runInner(
    f,
    { include: ["domain/**/*.test.ts"] },
    { ERGOMATIC_ARTIFACT_DIR: directory },
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /witness membership/);
  assert.equal(fs.existsSync(f.sentinel), false);
});

function publicFixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-owned-mutation-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const put = (name, data) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  for (const file of [
    "stryker.config.json",
    "vitest.stryker.config.ts",
    "scripts/local-work.mjs",
    "scripts/test-evidence-record.mjs",
  ])
    put(`app/${file}`, fs.readFileSync(path.join(appSource, file)));
  for (const file of fs.readdirSync(path.join(appSource, "scripts/local-work")))
    if (/\.(?:mjs|ts)$/.test(file) && !file.endsWith(".test.mjs"))
      put(
        `app/scripts/local-work/${file}`,
        fs.readFileSync(path.join(appSource, "scripts/local-work", file)),
      );
  const script = JSON.parse(
    fs.readFileSync(path.join(appSource, "package.json")),
  ).scripts.mutate;
  put(
    "app/package.json",
    JSON.stringify({
      private: true,
      type: "module",
      scripts: { mutate: script },
    }),
  );
  put(".gitignore", "node_modules/\nbody\nreports/\n.stryker-tmp/\n");
  put(
    "app/domain/space ü,comma.ts",
    "export function positive(n: number) { return n > 0; }\n",
  );
  const sentinel = path.join(root, "body");
  put(
    "app/domain/witness.test.ts",
    `import {test,expect} from 'vitest';
import {appendFileSync} from 'node:fs'; import {positive} from './space ü,comma';
test('sign',()=>{appendFileSync(${JSON.stringify(sentinel)},'body\\n');
expect(positive(-1)).toBe(false);expect(positive(0)).toBe(false);expect(positive(1)).toBe(true)});`,
  );
  put(
    "app/domain/unselected.test.ts",
    `import {positive} from './space ü,comma';throw new Error('unselected body '+positive(1));`,
  );
  put(
    "app/domain/witness.test.ts.extra.test.ts",
    `import {test} from 'vitest';import {positive} from './space ü,comma';
test('substring sibling must stay unselected',()=>{throw new Error('unexpected sibling '+positive(1))});`,
  );
  // Stryker enumerates real node_modules directories before linking a sandbox;
  // a symlink at that directory itself is skipped by its installed finder.
  fs.mkdirSync(path.join(app, "node_modules"));
  for (const entry of fs.readdirSync(path.join(appSource, "node_modules")))
    fs.symlinkSync(
      path.join(appSource, "node_modules", entry),
      path.join(app, "node_modules", entry),
    );
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  put(
    "driver.mjs",
    `import {main} from './app/scripts/local-work.mjs';import {readHost} from './app/scripts/local-work/host.mjs';
process.exitCode=await main(process.argv.slice(2),{env:{...process.env,ERGOMATIC_HOSTED_CI:'0'},observe:()=>{const host=readHost();return {...host,pressure:process.env.FIXTURE_PRESSURE?{state:process.env.FIXTURE_PRESSURE}:process.platform==='darwin'?host.pressure:{state:'normal'}}}});`,
  );
  put(
    "bin/node",
    `#!/bin/sh
case "$1" in *local-work.mjs) shift;exec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(root, "driver.mjs"))} "$@";; esac
exec ${JSON.stringify(process.execPath)} "$@"
`,
  );
  fs.chmodSync(path.join(root, "bin/node"), 0o755);
  git("add", ".");
  git("commit", "-qm", "fixture");
  const env = {
    ...process.env,
    ERGOMATIC_HOSTED_CI: "0",
    pnpm_config_verify_deps_before_run: "false",
    PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`,
  };
  const args = [
    "--concurrency",
    "1",
    "--mutate",
    "domain/space ü,comma.ts",
    "--test-file",
    "domain/witness.test.ts",
  ];
  const run = (extra = {}) =>
    spawnSync("pnpm", ["mutate", ...args], {
      cwd: app,
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 2 ** 20,
    });
  const receipts = () => {
    const directory = path.join(root, ".git/ergomatic-local-work/receipts");
    return fs.existsSync(directory)
      ? fs.readdirSync(directory).map((id) => path.join(directory, id))
      : [];
  };
  return { root, app, put, sentinel, env, args, run, receipts, git };
}

test("public mutation owns one bounded real Stryker run and keeps native evidence private", (t) => {
  const f = publicFixture(t),
    inherited = path.join(f.root, "foreign-artifacts");
  fs.mkdirSync(inherited);
  fs.writeFileSync(path.join(inherited, "sentinel"), "preserve");
  const result = f.run({ ERGOMATIC_ARTIFACT_DIR: inherited });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const dirs = f.receipts();
  assert.equal(dirs.length, 1);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dirs[0], "receipt.json")),
  );
  assert.equal(receipt.classification, "passed");
  assert.equal(receipt.cleanup, "verified");
  assert.equal(receipt.phases.length, 1);
  assert.equal(receipt.phases[0].workers.max, 1);
  const options = JSON.parse(
    fs.readFileSync(path.join(dirs[0], "stryker.config.json")),
  );
  assert.equal(options.concurrency, 1);
  assert.equal(options.inPlace, false);
  assert.equal(options.tempDirName, path.join(dirs[0], "sandbox"));
  const record = JSON.parse(
    fs.readFileSync(path.join(dirs[0], "mutation.json")),
  );
  assert.deepEqual(record.files, ["domain/space ü,comma.ts"]);
  assert.deepEqual(record.testFiles, ["domain/witness.test.ts"]);
  const report = JSON.parse(
    fs.readFileSync(path.join(dirs[0], "mutation-report.json")),
  );
  assert.deepEqual(Object.keys(report.files), ["domain/space ü,comma.ts"]);
  const mutants = report.files["domain/space ü,comma.ts"].mutants;
  assert.ok(mutants.length > 0);
  assert.ok(
    mutants.every((mutant) => mutant.status === "Killed"),
    JSON.stringify(mutants),
  );
  assert.ok(fs.existsSync(f.sentinel));
  assert.ok(fs.existsSync(path.join(dirs[0], "mutation.html")));
  assert.deepEqual(fs.readdirSync(inherited), ["sentinel"]);
  assert.equal(
    fs.existsSync(path.join(f.root, ".git/ergomatic-local-work/owner")),
    false,
  );
});

test("public mutation pressure refusal executes no test body", (t) => {
  const f = publicFixture(t),
    result = f.run({ FIXTURE_PRESSURE: "warning" });
  assert.equal(result.status, 75, result.stdout + result.stderr);
  assert.equal(fs.existsSync(f.sentinel), false);
});

test("public mutation refuses a selector dropped inside the handoff before native preparation", (t) => {
  const f = publicFixture(t);
  const file = "app/scripts/local-work/workloads.mjs";
  const original = fs.readFileSync(path.join(f.root, file), "utf8");
  const broken = original.replace(
    "const request = parseMutation(args);",
    "const request = parseMutation(args); request.testFiles = [];",
  );
  assert.notEqual(
    broken,
    original,
    "fixture must actually corrupt the handoff",
  );
  f.put(file, broken);
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /original request/);
  assert.equal(fs.existsSync(f.sentinel), false);
  assert.equal(
    fs.existsSync(path.join(f.receipts()[0], "mutation.json")),
    false,
  );
});

test("public mutation busy refusal cannot borrow an existing owner", (t) => {
  const f = publicFixture(t),
    owner = path.join(f.root, ".git/ergomatic-local-work/owner");
  fs.mkdirSync(path.dirname(owner), { mode: 0o700 });
  fs.mkdirSync(owner, { mode: 0o700 });
  const result = f.run();
  assert.equal(result.status, 75, result.stdout + result.stderr);
  assert.equal(fs.existsSync(f.sentinel), false);
  assert.deepEqual(fs.readdirSync(owner), []);
});

test("public mutation keeps initial assertion failure nonzero with verified cleanup", (t) => {
  const f = publicFixture(t);
  f.put(
    "app/domain/witness.test.ts",
    "import {test,expect} from 'vitest';import {positive} from './space ü,comma';test('fails',()=>expect(positive(1)).toBe(false));",
  );
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  const directory = f.receipts()[0],
    receipt = JSON.parse(fs.readFileSync(path.join(directory, "receipt.json")));
  assert.equal(receipt.classification, "failed");
  assert.equal(receipt.cleanup, "verified");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(directory, "mutation.json"))).status,
    "failed",
  );
  assert.ok(
    fs.existsSync(path.join(directory, "sandbox")),
    "native failure sandbox retained",
  );
});

test("public mutation invalidates a result when original source changes during native execution", (t) => {
  const f = publicFixture(t);
  f.put(
    "app/domain/witness.test.ts",
    `import {test,expect} from 'vitest';import {writeFileSync} from 'node:fs';import {positive} from './space ü,comma';
test('changes original source',()=>{writeFileSync(${JSON.stringify(path.join(f.app, "domain/space ü,comma.ts"))},'export function positive(n:number){return n>=0;}');expect(positive(-1)).toBe(false);expect(positive(0)).toBe(false);expect(positive(1)).toBe(true)});`,
  );
  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /evidence is stale/i);
  const record = JSON.parse(
    fs.readFileSync(path.join(f.receipts()[0], "mutation.json")),
  );
  assert.equal(record.status, "failed");
  assert.notEqual(record.source.fingerprint, record.sourceAfter.fingerprint);
});

test("interrupted native mutation retains the signal and closes its owned group", async (t) => {
  const f = publicFixture(t);
  f.put(
    "app/domain/witness.test.ts",
    `import {test,expect} from 'vitest';import {writeFileSync} from 'node:fs';import {positive} from './space ü,comma';
test('interrupt witness',async()=>{writeFileSync(${JSON.stringify(f.sentinel)},'ready');await new Promise(resolve=>setTimeout(resolve,2000));expect(positive(1)).toBe(true)});`,
  );
  // The live handle is the real public owner CLI, never a PID from its census.
  const child = spawn(
    process.execPath,
    [path.join(f.root, "driver.mjs"), "run", "mutate", ...f.args],
    { cwd: f.app, env: f.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const ended = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await ended;
    }
  });
  const deadline = Date.now() + 15000;
  while (!fs.existsSync(f.sentinel)) {
    assert.equal(child.exitCode, null, output);
    assert.ok(
      Date.now() < deadline,
      "native body did not become ready: " + output,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  child.kill("SIGINT");
  const outcome = await ended;
  assert.notEqual(outcome.code, 0, output);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(f.receipts()[0], "receipt.json")),
  );
  assert.equal(receipt.classification, "resource-aborted");
  // Stryker's own UnexpectedExitHandler turns INT into process.exit(130).
  // Keep that actual wait status and the owner's original cancellation cause.
  assert.equal(receipt.phases[0].exitCode, 130);
  assert.equal(receipt.phases[0].signal, null);
  assert.equal(receipt.reason, "SIGINT");
  assert.equal(receipt.cleanup, "verified");
  assert.equal(
    fs.existsSync(path.join(f.root, ".git/ergomatic-local-work/owner")),
    false,
  );
});
