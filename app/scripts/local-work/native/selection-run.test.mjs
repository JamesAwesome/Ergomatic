import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../selection-run.mjs", import.meta.url));
function fixture(t) {
  const temporary = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-selection-pipeline-")),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, ".worktree");
  fs.mkdirSync(root);
  const app = path.join(root, "app");
  let receipt,
    invocation = 0;
  fs.mkdirSync(app);
  fs.mkdirSync(path.join(root, ".receipts"), { mode: 0o700 });
  const put = (name, data) => {
    fs.mkdirSync(path.dirname(path.join(app, name)), { recursive: true });
    fs.writeFileSync(path.join(app, name), data);
  };
  const git = (...args) => {
    const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    return out.stdout.trim();
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    ".receipts/\napp/bodies\napp/node_modules/\n",
  );
  put(
    "vitest.config.mjs",
    `export default {test:{maxWorkers:1,projects:[{test:{name:'unit',globals:true,include:['scripts/*.test.ts','domain/*.test.ts']}},{test:{name:'client',globals:true,include:['src/*.test.ts']}}]}};`,
  );
  for (const name of ["scripts/script", "src/reader", "domain/a", "domain/aa"])
    put(
      `${name}.test.ts`,
      `import {appendFileSync} from "node:fs"; it('body',()=>appendFileSync(${JSON.stringify(path.join(app, "bodies"))},${JSON.stringify(name + "\n")}));`,
    );
  git("add", ".");
  git("commit", "-m", "fixture");
  return {
    app,
    get receipt() {
      return receipt;
    },
    put,
    git,
    run: (request, intended = request, env = {}) => {
      receipt = path.join(root, ".receipts", String(++invocation));
      fs.mkdirSync(receipt, { mode: 0o700 });
      fs.writeFileSync(
        path.join(receipt, "receipt.json"),
        JSON.stringify({ scope: { selection: intended } }),
      );
      return spawnSync(process.execPath, [runner, JSON.stringify(request)], {
        cwd: app,
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          CI: "",
          ERGOMATIC_SELECTION_DIR: receipt,
          NODE_OPTIONS: "--no-experimental-webstorage",
          ...env,
        },
      });
    },
    bodies: () =>
      fs.existsSync(path.join(app, "bodies"))
        ? fs
            .readFileSync(path.join(app, "bodies"), "utf8")
            .trim()
            .split("\n")
            .sort()
        : [],
  };
}
const request = {
  mode: "files",
  projects: ["unit"],
  files: ["domain/a.test.ts"],
  testNamePattern: null,
  maxWorkers: 1,
  minWorkers: null,
  inspect: false,
  base: null,
};

test("disposed discovery precedes exact execution; retained manifest matches body witness", (t) => {
  const f = fixture(t),
    result = f.run({ request });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(f.bodies(), ["domain/a"]);
  const record = JSON.parse(
    fs.readFileSync(path.join(f.receipt, "selection.json"), "utf8"),
  );
  assert.equal(record.status, "passed");
  assert.deepEqual(record.executed, [
    { project: "unit", file: path.join(f.app, "domain/a.test.ts") },
  ]);
  assert.ok(
    Date.parse(record.discoveryClosedAt) <=
      Date.parse(record.batches[0].startedAt),
  );
});

test("inspection and failed selection run no test bodies", (t) => {
  const f = fixture(t);
  assert.equal(f.run({ request: { ...request, inspect: true } }).status, 0);
  assert.deepEqual(f.bodies(), []);
  assert.notEqual(
    f.run({ request: { ...request, files: ["missing.test.ts"] } }).status,
    0,
  );
  assert.deepEqual(f.bodies(), []);
});

test("a wrapper dropping a name filter refuses before native bodies", (t) => {
  const f = fixture(t);
  const result = f.run(
    { request },
    { request: { ...request, testNamePattern: "^body$" } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requested selection/);
  assert.deepEqual(f.bodies(), []);
});

test("a test changing a tracked input invalidates otherwise passing execution", (t) => {
  const f = fixture(t);
  f.put(
    "domain/a.test.ts",
    `import fs from 'node:fs';it('mutates input',()=>fs.appendFileSync('domain/aa.test.ts','\\n// changed'));`,
  );
  f.git("add", ".");
  f.git("commit", "-m", "mutation fixture");
  const result = f.run({ request });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /evidence is stale/);
});

test("empty related set still executes mandatory union once; missing base does not fall back", (t) => {
  const f = fixture(t),
    head = f.git("rev-parse", "HEAD");
  const input = `refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`;
  const prePush = { input, full: false, base: "HEAD" };
  const result = f.run({ prePush });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(f.bodies(), ["scripts/script", "src/reader"]);
  const failed = f.run({ prePush: { ...prePush, base: "no-such-ref" } });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /push:full/);
  assert.deepEqual(f.bodies(), ["scripts/script", "src/reader"]);
});

test("explicit full push runs the entire named population exactly once", (t) => {
  const f = fixture(t),
    head = f.git("rev-parse", "HEAD");
  const result = f.run({
    prePush: {
      full: true,
      input: `refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`,
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(f.bodies(), [
    "domain/a",
    "domain/aa",
    "scripts/script",
    "src/reader",
  ]);
});

for (const name of [
  "package.json",
  "vitest.config.mjs",
  "pnpm-lock.yaml",
  "tsconfig.json",
])
  test(`related selection requires explicit full verification for changed global input ${name}`, (t) => {
    const f = fixture(t),
      base = f.git("rev-parse", "HEAD");
    if (name === "vitest.config.mjs")
      fs.appendFileSync(path.join(f.app, name), "\n// changed configuration\n");
    else
      f.put(name, name.endsWith("json") ? "{}\n" : "lockfileVersion: '9.0'\n");
    f.git("add", ".");
    f.git("commit", "-m", "global input");
    const result = f.run({
      request: { ...request, mode: "related", files: [], base, inspect: true },
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /Global test input changed/);
    assert.match(result.stderr, /test:full/);
    assert.deepEqual(f.bodies(), []);
  });

test("pre-push rejects a source change between clean status and source identity mint", (t) => {
  const f = fixture(t),
    root = path.dirname(f.app),
    head = f.git("rev-parse", "HEAD");
  const realGit = spawnSync("which", ["git"], {
    encoding: "utf8",
  }).stdout.trim();
  assert.ok(path.isAbsolute(realGit));
  const shimDir = path.join(root, ".git", "shim");
  fs.mkdirSync(shimDir);
  fs.writeFileSync(
    path.join(shimDir, "git"),
    `#!${process.execPath}
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const args=process.argv.slice(2), result=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'});
if(args[0]==='status' && result.status===0) fs.appendFileSync(${JSON.stringify(path.join(f.app, "domain/a.test.ts"))},'\\n// concurrent source edit\\n');
process.exitCode=result.status ?? 1;
`,
    { mode: 0o700 },
  );
  const input = {
    prePush: {
      full: true,
      input: `refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`,
    },
  };
  const result = f.run(input, input, {
    PATH: `${shimDir}${path.delimiter}${process.env.PATH}`,
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /evidence is stale/);
  assert.deepEqual(f.bodies(), []);
});

for (const input of [
  "src/index.css",
  "test/captures/workout.json",
  "ios/Bridge.swift",
])
  test(`pre-push mandatory readers catch a changed non-imported input: ${input}`, (t) => {
    const f = fixture(t);
    f.put(input, "baseline");
    f.put(
      "src/reader.test.ts",
      `import { readFileSync } from "node:fs";it('protects non-imported input',()=>expect(readFileSync(${JSON.stringify(input)},'utf8')).toBe('baseline'));`,
    );
    f.git("add", ".");
    f.git("commit", "-m", "reader fixture");
    const base = f.git("rev-parse", "HEAD");
    f.put(input, "broken");
    f.git("add", ".");
    f.git("commit", "-m", "broken input");
    const head = f.git("rev-parse", "HEAD");
    const result = f.run({
      prePush: {
        full: false,
        base,
        input: `refs/heads/main ${head} refs/heads/main ${base}\n`,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /protects non-imported input/);
    assert.match(result.stdout + result.stderr, /baseline/);
    const selection = JSON.parse(
      fs.readFileSync(path.join(f.receipt, "selection.json"), "utf8"),
    );
    assert.ok(
      selection.selected.some(
        (item) =>
          item.project === "client" &&
          item.file === path.join(f.app, "src/reader.test.ts"),
      ),
    );
    assert.ok(
      selection.selected.some(
        (item) =>
          item.project === "unit" &&
          item.file === path.join(f.app, "scripts/script.test.ts"),
      ),
    );
  });

for (const name of ["domain/space ü.test.ts", "domain/line\nbreak.test.ts"])
  test(`related discovery preserves the actual changed Git path ${JSON.stringify(name)}`, (t) => {
    const f = fixture(t);
    f.put(name, "it('changed test',()=>expect(1).toBe(1));");
    f.git("add", ".");
    f.git("commit", "-m", "related baseline");
    const base = f.git("rev-parse", "HEAD");
    f.put(name, "it('changed test',()=>expect(2).toBe(2));");
    f.git("add", ".");
    f.git("commit", "-m", "related input");
    const result = f.run({
      request: { ...request, mode: "related", files: [], base, inspect: true },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const record = JSON.parse(
      fs.readFileSync(path.join(f.receipt, "selection.json"), "utf8"),
    );
    assert.deepEqual(record.selected, [
      { project: "unit", file: path.join(f.app, name) },
    ]);
    assert.deepEqual(f.bodies(), []);
  });
