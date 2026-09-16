import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const cli = resolve("scripts/test-evidence.mjs");
const fixture = resolve("scripts/test-evidence-fixture.mjs");
const base = realpathSync(mkdtempSync(join(tmpdir(), "erg-evidence-")));
function invoke(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTIONS: "false",
      GITHUB_OUTPUT: "",
      GITHUB_STEP_SUMMARY: "",
      ...env,
    },
    timeout: 10000,
  });
}
function capture(mode, runner = "playwright", rootName = mode) {
  const root = join(base, rootName);
  const run = invoke([
    "run",
    runner,
    "--root",
    root,
    "--",
    process.execPath,
    fixture,
    mode,
  ]);
  assert.notEqual(run.status, 2, `capture must launch: ${run.stderr}`);
  const dirs = readdirSync(root);
  assert.equal(dirs.length, 1);
  const dir = join(root, dirs[0]);
  const receipt = JSON.parse(readFileSync(join(dir, "receipt.json")));
  const summary = invoke(["summary", dir]);
  const check = invoke(["check", dir]);
  return { run, dir, receipt, summary, check };
}

for (const [mode, code, signal] of [
  ["signal-before-reporters", 143, "SIGTERM"],
  ["allocation-before-reporters", 1, null],
]) {
  test(`receipt termination count survives missing HTML and raw output: ${mode}`, () => {
    const r = capture(mode);
    assert.equal(r.run.status, code);
    assert.equal(r.receipt.terminal, true);
    assert.equal(r.receipt.signal, signal);
    assert.equal(r.receipt.resourceAbort, true);
    assert.equal(existsSync(join(r.dir, "html/index.html")), false);
    assert.equal(existsSync(join(r.dir, "report.json")), false);
    assert.equal(r.check.status, 1);
    assert.match(r.summary.stdout, /evidence: incomplete/);
    assert.match(r.summary.stdout, /termination\/resource events: 1/);
    unlinkSync(join(r.dir, "stdout.log"));
    assert.match(
      invoke(["summary", r.dir]).stdout,
      /termination\/resource events: 1/,
    );
  });
}

for (const [mode, failures, initialInterrupted, retryInterrupted] of [
  ["initial-interrupted", 0, 1, 0],
  ["retry-interrupted", 1, 0, 1],
]) {
  test(`native interrupted attempts stay separate from assertion failures: ${mode}`, () => {
    const r = capture(mode);
    assert.equal(r.run.status, 130);
    assert.equal(r.receipt.exitCode, 130);
    assert.equal(r.receipt.terminal, true);
    assert.equal(r.receipt.resourceAbort, true);
    assert.equal(r.check.status, 0);
    assert.match(r.summary.stdout, /initial executions: 1/);
    assert.match(r.summary.stdout, /termination\/resource events: 1/);
    assert.match(
      r.summary.stdout,
      new RegExp(`first-attempt failures: ${failures}`),
    );
    assert.match(
      r.summary.stdout,
      new RegExp(`execution incidence: ${failures}/1`),
    );
    assert.match(
      r.summary.stdout,
      new RegExp(`interrupted initial attempts: ${initialInterrupted}`),
    );
    assert.match(
      r.summary.stdout,
      new RegExp(`interrupted retry attempts: ${retryInterrupted}`),
    );
    assert.match(r.summary.stdout, /retry recoveries: 0/);
    assert.match(r.summary.stdout, /exhausted executions: 0/);
    assert.match(r.summary.stdout, /suite errors: 0/);
    if (mode === "initial-interrupted")
      assert.doesNotMatch(r.summary.stdout, /- case.spec.ts: case/);
    else assert.match(r.summary.stdout, /- case.spec.ts: case/);
  });
}

test("native attempts, observer status and evidence remain independent through the CLI", () => {
  for (const [mode, code, evidence, expected] of [
    ["pass", 0, 0, "initial executions: 1"],
    ["fail", 1, 0, "first-attempt failures: 1"],
    ["recovery", 0, 0, "retry recoveries: 1"],
    ["repeats", 0, 0, "execution incidence: 1/2"],
    ["setup", 1, 0, "suite errors: 1"],
    ["coverage", 1, 0, "first-attempt failures: 0"],
    ["allocation", 1, 0, "termination/resource events: 1"],
    ["missing", 0, 1, "evidence: incomplete"],
    ["unreadable", 0, 1, "evidence: incomplete"],
    ["unwritable", 0, 1, "evidence: incomplete"],
    ["stale", 0, 1, "evidence: incomplete"],
    ["empty", 0, 1, "evidence: incomplete"],
    ["expected-failure", 0, 0, "first-attempt failures: 0"],
    ["signal", 143, 1, "termination/resource events: 1"],
  ]) {
    const result = capture(mode);
    assert.equal(result.run.status, code, `${mode}: ${result.run.stderr}`);
    assert.equal(result.check.status, evidence, mode);
    assert.match(result.summary.stdout, new RegExp(expected), mode);
    assert.match(result.summary.stdout, /\[stdout\]\(stdout.log\)/);
    assert.equal(result.receipt.terminal, true);
    assert.equal(result.receipt.argv[2], mode);
    assert.equal(result.receipt.cwd, process.cwd());
    assert.match(
      readFileSync(join(result.dir, "stdout.log"), "utf8"),
      /fixture started/,
    );
    assert.equal(result.receipt.signal, mode === "signal" ? "SIGTERM" : null);
    if (mode === "repeats")
      assert.match(result.summary.stdout, /job incidence: 1\/1/);
  }
});

test("Vitest suite errors and passing assertions never overwrite command failure", () => {
  const r = capture("vitest", "vitest");
  assert.equal(r.run.status, 1);
  assert.equal(r.check.status, 0);
  assert.match(r.summary.stdout, /initial executions: 1/);
  assert.match(r.summary.stdout, /suite errors: 1/);
});

test("native repeat-specific IDs preserve executions without inventing numeric repeat indices", () => {
  const r = capture("repeats", "playwright", "native-repeats");
  assert.equal(r.check.status, 0);
  const report = JSON.parse(readFileSync(join(r.dir, "report.json")));
  assert.deepEqual(
    report.suites[0].specs.map((spec) => spec.id),
    ["case-repeat-a", "case-repeat-b"],
  );
  assert.match(r.summary.stdout, /initial executions: 2/);
  assert.match(r.summary.stdout, /execution incidence: 1\/2/);
  assert.match(r.summary.stdout, /job incidence: 1\/1/);
  assert.match(
    r.summary.stdout,
    /chromium, id case-repeat-a, repeat index unknown, flaky/,
  );
  assert.doesNotMatch(r.summary.stdout, /repeat undefined/);
});

test("required raw artifacts and report binding cannot disappear behind a pass", () => {
  for (const file of [
    "stdout.log",
    "stderr.log",
    "resources.jsonl",
    "report.json",
    "html/index.html",
  ]) {
    const r = capture(`remove-${file}`);
    unlinkSync(join(r.dir, file));
    assert.equal(invoke(["check", r.dir]).status, 1, file);
  }
  const r = capture("replaced");
  writeFileSync(join(r.dir, "report.json"), '{"suites":[],"errors":[]}');
  assert.equal(invoke(["check", r.dir]).status, 1);
});

test("omitted root is invocation-scoped and explicit traversal IDs are refused", () => {
  const run = invoke([
    "run",
    "playwright",
    "--",
    process.execPath,
    fixture,
    "pass",
  ]);
  assert.equal(run.status, 0);
  const dir = run.stdout.match(/Evidence: (.+)/)[1];
  assert.equal(dirname(dir), realpathSync(".test-evidence"));
  assert.equal(invoke(["check", dir]).status, 0);
  assert.equal(
    invoke(["run", "playwright", "--id", "../escape", "--", "false"]).status,
    2,
  );
});

test("interrupt keeps the observer alive and marks detached survivors without touching a sentinel", async () => {
  const root = join(base, "tree");
  const sentinel = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
  });
  const observer = spawn(
    process.execPath,
    [
      cli,
      "run",
      "playwright",
      "--root",
      root,
      "--",
      process.execPath,
      fixture,
      "tree",
    ],
    { stdio: "ignore" },
  );
  const ended = new Promise((resolve) =>
    observer.once("exit", (code, signal) => resolve({ code, signal })),
  );
  let detached, ordinary, leader, deadline;
  try {
    let dir;
    for (let n = 0; n < 100; n++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (!existsSync(root)) continue;
      dir = join(root, readdirSync(root)[0]);
      if (existsSync(join(dir, "receipt.json")))
        leader = JSON.parse(readFileSync(join(dir, "receipt.json"))).pid;
      if (!existsSync(join(dir, "tree.json"))) continue;
      const pids = JSON.parse(readFileSync(join(dir, "tree.json")));
      detached = pids.detached;
      ordinary = pids.ordinary;
      const samples = readFileSync(join(dir, "resources.jsonl"), "utf8");
      if (samples.includes(`"pid":${detached}`)) break;
    }
    assert.ok(detached, "fixture descendant ready");
    observer.kill("SIGTERM");
    const outcome = await Promise.race([
      ended,
      new Promise((resolve) => {
        deadline = setTimeout(() => resolve("observer did not stop"), 4000);
      }),
    ]);
    assert.deepEqual(outcome, { code: 143, signal: null });
    let ordinaryAlive = true;
    for (let n = 0; n < 20 && ordinaryAlive; n++) {
      try {
        process.kill(ordinary, 0);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
        ordinaryAlive = false;
      }
      if (ordinaryAlive)
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(
      ordinaryAlive,
      false,
      "ordinary descendant must stop with its owned group",
    );
    const receipt = JSON.parse(readFileSync(join(dir, "receipt.json")));
    assert.equal(receipt.terminal, true);
    assert.equal(receipt.interrupted, "SIGTERM");
    assert.equal(receipt.cleanup.status, "incomplete");
    assert.ok(receipt.cleanup.survivors.some((p) => p.pid === detached));
    assert.equal(invoke(["check", dir]).status, 1);
    assert.equal(process.kill(sentinel.pid, 0), true);
  } finally {
    clearTimeout(deadline);
    // Exact fixture PIDs only, including the ordinary child if forwarding broke.
    observer.kill("SIGKILL");
    for (const pid of [ordinary, detached, leader, sentinel.pid]) {
      if (!pid) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
});

test("empty roots, symlink roots and reused invocation identities are refused", () => {
  assert.equal(
    invoke(["run", "playwright", "--root", "", "--", "false"]).status,
    2,
  );
  const link = join(base, "link");
  symlinkSync(base, link);
  assert.equal(
    invoke(["run", "playwright", "--root", link, "--", "false"]).status,
    2,
  );
  const r = capture("identity");
  const originalArtifacts = [
    "receipt.json",
    "report.json",
    "stdout.log",
    "stderr.log",
    "resources.jsonl",
    "html/index.html",
  ].map((name) => [name, readFileSync(join(r.dir, name))]);
  assert.equal(
    invoke([
      "run",
      "playwright",
      "--root",
      join(base, "identity"),
      "--id",
      r.receipt.id,
      "--",
      "false",
    ]).status,
    2,
  );
  for (const [name, bytes] of originalArtifacts)
    assert.deepEqual(
      readFileSync(join(r.dir, name)),
      bytes,
      `rejected reuse must preserve ${name}`,
    );
  const receiptPath = join(r.dir, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify({ ...r.receipt, directory: base }));
  assert.equal(invoke(["check", r.dir]).status, 1);
  writeFileSync(receiptPath, JSON.stringify({ ...r.receipt, terminal: false }));
  assert.equal(invoke(["check", r.dir]).status, 1);
});

test("CI publication is checked after summary and links the uploaded archive", () => {
  const r = capture("publication");
  const summaryPath = join(base, "github-summary.md");
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_STEP_SUMMARY: summaryPath,
    EVIDENCE_UPLOAD_URL: "",
  };
  assert.equal(invoke(["summary", r.dir], env).status, 0);
  assert.equal(invoke(["check", r.dir], env).status, 1);
  assert.equal(
    invoke(["check", r.dir], {
      ...env,
      EVIDENCE_UPLOAD_URL: "https://github.com/example/artifacts/123",
    }).status,
    0,
  );
  const output = readFileSync(summaryPath, "utf8");
  assert.match(
    output,
    /\[download archive\]\(https:\/\/github.com\/example\/artifacts\/123\)/,
  );
  assert.doesNotMatch(output, /\]\(stdout.log\)/);
});

test("allocation detection retains an early needle in a long chunk and across chunks", () => {
  for (const mode of ["allocation-long", "allocation-split"]) {
    const r = capture(mode);
    assert.equal(r.run.status, 1);
    assert.equal(r.receipt.allocationFailure, true, mode);
    assert.match(r.summary.stdout, /termination\/resource events: 1/);
  }
});

test("post-spawn receipt write failure still waits for the child and preserves its exit", () => {
  const root = join(base, "write-fault");
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      resolve("scripts/test-evidence-write-fault.mjs"),
      cli,
      "run",
      "playwright",
      "--root",
      root,
      "--",
      process.execPath,
      fixture,
      "write-fault",
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(r.status, 7, r.stderr);
  const dir = join(root, readdirSync(root)[0]);
  assert.equal(readFileSync(join(dir, "finished"), "utf8"), "child completed");
  const receipt = JSON.parse(readFileSync(join(dir, "receipt.json")));
  assert.equal(receipt.terminal, true);
  assert.equal(receipt.exitCode, 7);
  assert.match(
    receipt.diagnosticErrors.join("\n"),
    /fabricated post-spawn receipt write failure/,
  );
  assert.equal(invoke(["check", dir]).status, 1);
});

test("inherited pipes cannot hide leader exit or indefinitely retain the observer", async () => {
  const root = join(base, "inherited-pipes");
  const sentinel = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
  });
  const observer = spawn(
    process.execPath,
    [
      cli,
      "run",
      "playwright",
      "--root",
      root,
      "--",
      process.execPath,
      fixture,
      "inherited-pipes",
    ],
    { stdio: "ignore" },
  );
  let deadline, dir;
  const ended = new Promise((resolve) =>
    observer.once("exit", (code) => resolve(code)),
  );
  try {
    const code = await Promise.race([
      ended,
      new Promise((resolve) => {
        deadline = setTimeout(
          () => resolve("observer still waiting for inherited pipes"),
          5000,
        );
      }),
    ]);
    assert.equal(code, 7);
    dir = join(root, readdirSync(root)[0]);
    const receipt = JSON.parse(readFileSync(join(dir, "receipt.json")));
    const descendant = JSON.parse(readFileSync(join(dir, "descendant.json")));
    assert.equal(receipt.terminal, true);
    assert.equal(receipt.exitCode, 7);
    assert.match(
      receipt.diagnosticErrors.join("\n"),
      /stdio drain exceeded 2000 ms/,
    );
    assert.ok(receipt.cleanup.survivors.some((p) => p.pid === descendant.pid));
    assert.equal(invoke(["check", dir]).status, 1);
    assert.equal(process.kill(sentinel.pid, 0), true);
  } finally {
    clearTimeout(deadline);
    if (existsSync(root)) {
      dir = join(root, readdirSync(root)[0]);
      if (existsSync(join(dir, "descendant.json")))
        process.kill(
          JSON.parse(readFileSync(join(dir, "descendant.json"))).pid,
          "SIGTERM",
        );
    }
    observer.kill("SIGTERM");
    sentinel.kill("SIGTERM");
    await ended;
  }
});
