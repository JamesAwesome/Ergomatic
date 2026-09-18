import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { runWorkload } from "./run.mjs";
import { acquireOwner, inspectOwner } from "./owner.mjs";
import { readHost } from "./host.mjs";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { provenance } from "../test-evidence-record.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ergo-run-")));
  t.after(async () => {
    try {
      const record = inspectOwner(root).metadata;
      const observed = record?.observed ?? [];
      await until(
        () =>
          !readHost().processes.value.some(
            (p) =>
              p.pid === record?.child?.pid ||
              observed.some(
                (old) => old.pid === p.pid && old.started === p.started,
              ),
          ),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  const current = readHost().processes.value.find((p) => p.pid === process.pid);
  const metadata = {
    id: randomUUID(),
    uid: process.getuid(),
    commonDir: root,
    worktree: root,
    pid: process.pid,
    start: current.started,
    phase: "idle",
  };
  return {
    root,
    metadata,
    observe: () => ({
      ...readHost(),
      pressure: { state: "normal", value: "1" },
    }),
    sampleMs: 10,
  };
}
const phase = (code) => ({
  command: process.execPath,
  // This failsafe is not readiness evidence; it bounds broken cancellation mutants.
  args: ["-e", `setTimeout(()=>process.exit(86),3000).unref();${code}`],
  cwd: process.cwd(),
});
const put = (path, text) =>
  `require('node:fs').writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(text)});`;

test("private phase artifacts replace inherited destinations and never leak to ordinary phases", async (t) => {
  const options = fixture(t),
    observed = join(options.root, "observed");
  const command = phase(
    `require('node:fs').appendFileSync(${JSON.stringify(observed)},JSON.stringify(process.env.ERGOMATIC_ARTIFACT_DIR??null)+'\\n')`,
  );
  const result = await runWorkload({
    ...options,
    phases: [
      {
        ...command,
        artifacts: true,
        env: { ...process.env, ERGOMATIC_ARTIFACT_DIR: "/foreign" },
      },
      {
        ...command,
        env: { ...process.env, ERGOMATIC_ARTIFACT_DIR: "/foreign" },
      },
    ],
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    readFileSync(observed, "utf8").trim().split("\n").map(JSON.parse),
    [result.directory, null],
  );
});

async function until(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("Owned fixture did not finish by its safety deadline");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("test-run resource outcomes survive the shell boundary into the owner receipt", async (t) => {
  for (const [code, stderr, classification, signal] of [
    [130, "", "signal", "SIGINT"],
    [134, "FATAL ERROR: Allocation failed", "memory", "SIGABRT"],
    [137, "FATAL ERROR: Allocation failed", "memory", "SIGKILL"],
    [1, "FATAL ERROR: Allocation failed", "memory", null],
    [137, "", "signal", "SIGKILL"],
    [23, "", "failed", null],
  ]) {
    const options = fixture(t);
    const result = await runWorkload({
      ...options,
      phases: [
        {
          command: "bash",
          args: [
            fileURLToPath(new URL("../test-run.sh", import.meta.url)),
            "--self-test",
          ],
          cwd: options.root,
          outcome: "test-run",
          env: {
            ...process.env,
            FAKE_RC: String(code),
            FAKE_ERR: stderr,
            FAKE_OUT: "Test Files 1 failed (1)",
            ERGOMATIC_TEST_KILLDIR: join(options.root, "kills"),
          },
        },
      ],
    });
    assert.equal(result.exitCode, code);
    assert.equal(result.classification, classification);
    assert.equal(result.signal, signal);
    assert.equal(result.phases[0].exitCode, code);
    assert.equal(result.phases[0].signal, null);
    assert.equal(result.cleanup, "verified");
  }
});

test("ordinary admitted receipts bind source, command, tools and streamed output without claiming observed workers", async (t) => {
  const options = fixture(t);
  const source = join(options.root, "source");
  mkdirSync(source);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: source, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  // Source identity is the actual existing repo commit, supplied through an
  // object alternate; no fixture commit or hook bypass is needed.
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
  }).stdout.trim();
  mkdirSync(join(source, ".git/objects/info"), { recursive: true });
  writeFileSync(
    join(source, ".git/objects/info/alternates"),
    resolve(common, "objects") + "\n",
  );
  const sha = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();
  git("update-ref", "refs/heads/source", sha);
  git("symbolic-ref", "HEAD", "refs/heads/source");
  git("read-tree", "HEAD");
  const files = spawnSync("git", ["ls-files", "-z"], { cwd: source }).stdout;
  const skipped = spawnSync(
    "git",
    ["update-index", "--skip-worktree", "-z", "--stdin"],
    { cwd: source, input: files },
  );
  assert.equal(skipped.status, 0);
  git("update-index", "--no-skip-worktree", "README.md");
  writeFileSync(
    join(source, "README.md"),
    "deliberately dirty tracked fixture\n",
  );
  writeFileSync(
    join(source, "untracked.txt"),
    "not covered by tracked fingerprint\n",
  );
  const command = {
    ...phase("console.log('owned stdout');console.error('owned stderr')"),
    cwd: source,
  };
  const result = await runWorkload({
    ...options,
    metadata: { ...options.metadata, worktree: source },
    phases: [command],
  });
  assert.equal(result.sha.value, sha);
  assert.equal(result.trackedDiff.dirty, true);
  assert.match(result.trackedDiff.sha256, /^[a-f0-9]{64}$/);
  assert.match(
    result.sourceIdentity.scope,
    /untracked files are not fingerprinted/,
  );
  assert.equal(result.sourceIdentity.status, "recorded");
  writeFileSync(join(source, "untracked.txt"), "different untracked bytes\n");
  assert.equal(
    provenance({ cwd: source }).trackedDiff.sha256,
    result.trackedDiff.sha256,
  );
  git("add", "README.md");
  assert.equal(
    provenance({ cwd: source }).trackedDiff.sha256,
    result.trackedDiff.sha256,
  );
  writeFileSync(join(source, "README.md"), "different tracked bytes\n");
  assert.notEqual(
    provenance({ cwd: source }).trackedDiff.sha256,
    result.trackedDiff.sha256,
  );
  assert.equal(result.versions.node, process.version);
  assert.equal(result.versions.vitest, null);
  assert.deepEqual(result.phases[0].argv, [command.command, ...command.args]);
  assert.equal(result.phases[0].workers.actual, null);
  assert.equal(result.phases[0].workers.applicability, "not-applicable");
  assert.match(
    readFileSync(join(result.directory, "stdout.log"), "utf8"),
    /owned stdout/,
  );
  assert.match(
    readFileSync(join(result.directory, "stderr.log"), "utf8"),
    /owned stderr/,
  );
  const resources = readFileSync(
    join(result.directory, "resources.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.ok(resources.every((row) => row.wrapperRssBytes > 0));
  assert.equal(result.cleanup, "verified");
});

test("native evidence reader reports unresolved local cleanup despite a passing native test", async (t) => {
  const options = fixture(t);
  const result = await runWorkload({
    ...options,
    metadata: { ...options.metadata, worktree: resolve("..") },
    phases: [
      {
        ...phase(
          `require('node:fs').writeFileSync(require('node:path').join(process.env.ERGOMATIC_EVIDENCE_DIR,'report.json'),JSON.stringify({testResults:[{name:'fixture',assertionResults:[{fullName:'passes',status:'passed'}]}]}))`,
        ),
        capture: "vitest",
      },
    ],
    observe: ({ phase }) =>
      phase === "cleanup"
        ? {
            pressure: { state: "normal" },
            processes: { unavailable: "fixture cleanup unavailable" },
          }
        : options.observe(),
  });
  assert.equal(result.cleanup, "unresolved");
  assert.equal(result.phases[0].exitCode, 0);
  assert.equal(result.resourceAbort, true);
  const read = (action) =>
    spawnSync(
      process.execPath,
      ["scripts/test-evidence.mjs", action, result.directory],
      {
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          GITHUB_ACTIONS: "false",
          GITHUB_STEP_SUMMARY: "",
        },
      },
    );
  const check = read("check");
  assert.equal(check.status, 1, check.stdout + check.stderr);
  const summary = read("summary");
  assert.match(summary.stdout, /initial executions: 1/);
  assert.match(summary.stdout, /first-attempt failures: 0/);
  assert.match(summary.stdout, /termination\/resource events: 1/);
  assert.match(summary.stdout, /cleanup: unresolved/);
  assert.match(summary.stdout, /evidence: incomplete/);
});

test("local native check cannot certify unavailable source provenance", async (t) => {
  const options = fixture(t);
  const result = await runWorkload({
    ...options,
    phases: [
      {
        ...phase(
          `require('node:fs').writeFileSync(require('node:path').join(process.env.ERGOMATIC_EVIDENCE_DIR,'report.json'),JSON.stringify({testResults:[{name:'fixture',assertionResults:[{fullName:'passes',status:'passed'}]}]}))`,
        ),
        capture: "vitest",
      },
    ],
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.cleanup, "verified");
  assert.equal(result.sourceIdentity.status, "unavailable");
  const check = spawnSync(
    process.execPath,
    ["scripts/test-evidence.mjs", "check", result.directory],
    {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, GITHUB_ACTIONS: "false", GITHUB_STEP_SUMMARY: "" },
    },
  );
  assert.equal(check.status, 1);
  assert.match(check.stdout, /local source provenance unavailable/);
  assert.match(check.stdout, /initial executions: 1/);
});

test("log write and close failures cannot produce a passing admitted receipt", async (t) => {
  for (const [operation, memory] of [
    ["writeSync", false],
    ["closeSync", false],
    ["closeSync", true],
  ]) {
    const options = fixture(t);
    const logFds = new Set();
    const open = fs.openSync,
      write = fs.writeSync,
      close = fs.closeSync;
    t.mock.method(fs, "openSync", (path, ...args) => {
      const fd = open(path, ...args);
      if (/\/(?:stdout|stderr)\.log$/.test(path)) logFds.add(fd);
      return fd;
    });
    t.mock.method(fs, "writeSync", (fd, ...args) => {
      if (operation === "writeSync" && logFds.has(fd))
        throw new Error("fixture writeSync failure");
      return write(fd, ...args);
    });
    t.mock.method(fs, "closeSync", (fd) => {
      const wasLog = logFds.delete(fd);
      close(fd);
      if (operation === "closeSync" && wasLog)
        throw new Error("fixture closeSync failure");
    });
    syncBuiltinESMExports();
    try {
      const selected = memory
        ? {
            command: "bash",
            args: [
              fileURLToPath(new URL("../test-run.sh", import.meta.url)),
              "--self-test",
            ],
            cwd: options.root,
            outcome: "test-run",
            env: {
              ...process.env,
              FAKE_RC: "134",
              FAKE_ERR: "Allocation failed",
              ERGOMATIC_TEST_KILLDIR: join(options.root, "kills"),
            },
          }
        : phase(
            "let n=0;const timer=setInterval(()=>{console.log('still visible');console.error('still visible error');if(++n===8)clearInterval(timer)},10)",
          );
      const result = await runWorkload({ ...options, phases: [selected] });
      assert.equal(result.phases[0].exitCode, memory ? 134 : 0);
      assert.equal(result.phases[0].signal, null);
      assert.equal(result.exitCode, memory ? 134 : 75);
      assert.equal(
        result.classification,
        memory ? "memory" : "evidence-incomplete",
      );
      assert.equal(result.signal, memory ? "SIGABRT" : null);
      assert.equal(result.cleanup, "verified");
      assert.ok(
        result.diagnosticErrors.some((error) => error.includes(operation)),
      );
      assert.ok(
        result.diagnosticErrors.length <= 2,
        "keep only the first failure per stream",
      );
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }
  }
});

test("signals delivered to the real owner stop its live child and release only after cleanup", async (t) => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const options = fixture(t),
      ready = join(options.root, "ready"),
      stopped = join(options.root, "stopped"),
      resultFile = join(options.root, "result");
    const body = phase(
      `process.on('SIGINT',()=>{${put(stopped, "SIGINT")}process.exit(0)});${put(ready, "yes")}setInterval(()=>{},1000)`,
    );
    const script = `import {runWorkload} from ${JSON.stringify(new URL("./run.mjs", import.meta.url).href)};import {readHost} from ${JSON.stringify(new URL("./host.mjs", import.meta.url).href)};import{writeFileSync,existsSync}from'node:fs';const metadata=${JSON.stringify(options.metadata)};metadata.pid=process.pid;metadata.start=readHost().processes.value.find(p=>p.pid===process.pid).started;const ready=setInterval(()=>{if(existsSync(${JSON.stringify(ready)})){clearInterval(ready);process.send('ready');}},5);const result=await runWorkload({root:${JSON.stringify(options.root)},metadata,phases:[${JSON.stringify(body)}],observe:()=>({...readHost(),pressure:{state:'normal'}}),sampleMs:10});writeFileSync(${JSON.stringify(resultFile)},JSON.stringify(result));process.disconnect();process.exitCode=result.exitCode;`;
    const owner = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `setTimeout(()=>process.exit(87),6000).unref();${script}`,
      ],
      { stdio: ["ignore", "inherit", "inherit", "ipc"] },
    );
    let identity;
    t.after(async () => {
      if (owner.exitCode === null && owner.signalCode === null)
        owner.kill("SIGTERM");
      await until(() => owner.exitCode !== null || owner.signalCode !== null);
      if (identity)
        await until(
          () =>
            !readHost().processes.value.some(
              (p) => p.pid === identity.pid && p.started === identity.started,
            ),
        );
    });
    const exit = once(owner, "exit", { signal: AbortSignal.timeout(7000) });
    await once(owner, "message", { signal: AbortSignal.timeout(5000) });
    const childPid = inspectOwner(options.root).metadata.child.pid;
    identity = readHost().processes.value.find((p) => p.pid === childPid);
    owner.kill(signal);
    const [code] = await exit;
    const result = JSON.parse(readFileSync(resultFile, "utf8"));
    assert.equal(code, 75);
    assert.equal(result.classification, "resource-aborted");
    assert.equal(result.reason, signal);
    assert.equal(result.cleanup, "verified");
    assert.equal(readFileSync(stopped, "utf8"), "SIGINT");
    assert.equal(inspectOwner(options.root).status, "free");
  }
});

test("a zero-exit child with a missing or contradictory private outcome cannot pass", async (t) => {
  for (const report of ["", '{"exitCode":23,"verdict":""}']) {
    const options = fixture(t),
      marker = join(options.root, "executed");
    const result = await runWorkload({
      ...options,
      phases: [
        {
          ...phase(
            `${put(marker, "yes")}require('node:fs').writeSync(3,${JSON.stringify(report)});`,
          ),
          outcome: "test-run",
        },
      ],
    });
    assert.equal(readFileSync(marker, "utf8"), "yes");
    assert.equal(result.phases[0].exitCode, 0);
    assert.equal(result.exitCode, 75);
    assert.equal(result.classification, "resource-aborted");
    assert.equal(result.cleanup, "verified");
  }
});

test("preparation runs under admission, and never at unsafe pressure", async (t) => {
  const unsafe = fixture(t);
  let prepared = false;
  const refusal = await runWorkload({
    ...unsafe,
    observe: () => ({ ...readHost(), pressure: { state: "warning" } }),
    phases: () => {
      prepared = true;
      return [phase("process.exit(0)")];
    },
  });
  assert.equal(prepared, false);
  assert.equal(refusal.exitCode, 75);
  const safe = fixture(t);
  const result = await runWorkload({
    ...safe,
    phases: async () => {
      assert.equal(inspectOwner(safe.root).metadata.id, safe.metadata.id);
      return [phase("process.exit(0)")];
    },
  });
  assert.equal(result.exitCode, 0);
});

test("failed or empty preparation refuses and releases no-child ownership", async (t) => {
  for (const phases of [
    [],
    () => [],
    () => {
      throw new Error("missing selection");
    },
  ]) {
    const options = fixture(t);
    const result = await runWorkload({ ...options, phases });
    assert.equal(result.exitCode, 2);
    assert.equal(result.classification, "preparation-failed");
    assert.equal(result.phases.length, 0);
    assert.equal(inspectOwner(options.root).status, "free");
  }
});

test("pressure rising after selection refuses the phase before any child launch", async (t) => {
  const options = fixture(t),
    marker = join(options.root, "body");
  let state = "normal";
  const result = await runWorkload({
    ...options,
    observe: () => ({ ...readHost(), pressure: { state } }),
    phases: () => {
      state = "warning";
      return [phase(put(marker, "ran"))];
    },
  });
  assert.equal(result.exitCode, 75);
  assert.equal(result.classification, "resource-refused");
  assert.equal(result.phases.length, 0);
  assert.equal(existsSync(marker), false);
  assert.equal(inspectOwner(options.root).status, "free");
});

test("a symlinked receipt parent cannot redirect evidence into another directory", async (t) => {
  const options = fixture(t),
    outside = join(options.root, "outside");
  mkdirSync(outside, { mode: 0o700 });
  symlinkSync(outside, join(options.root, "receipts"));
  await assert.rejects(
    runWorkload({ ...options, phases: [phase("process.exit(0)")] }),
    /receipt/i,
  );
  assert.deepEqual(readdirSync(outside), []);
});

test("unsafe preflight refuses without starting a test body and releases empty ownership", async (t) => {
  for (const state of ["warning", "critical", "unknown"]) {
    const options = fixture(t),
      marker = join(options.root, "body");
    const result = await runWorkload({
      ...options,
      observe: () => ({ ...readHost(), pressure: { state } }),
      phases: [phase(put(marker, "ran"))],
    });
    assert.equal(result.exitCode, 75);
    assert.equal(result.classification, "resource-refused");
    assert.equal(existsSync(marker), false);
    assert.equal(inspectOwner(options.root).status, "free");
  }
});

test("a failed phase keeps its exact status and prevents later work", async (t) => {
  const options = fixture(t),
    marker = join(options.root, "second");
  const result = await runWorkload({
    ...options,
    phases: [phase("process.exit(23)"), phase(put(marker, "ran"))],
  });
  assert.equal(result.exitCode, 23);
  assert.equal(result.cleanup, "verified");
  assert.equal(existsSync(marker), false);
  assert.equal(inspectOwner(options.root).status, "free");
  const receipt = JSON.parse(
    readFileSync(join(result.directory, "receipt.json"), "utf8"),
  );
  assert.equal(receipt.terminal, true);
  assert.equal(receipt.exitCode, 23);
  assert.equal(receipt.phases.length, 1);
});

test("successful phases preserve cwd, argv and required environment in sequence", async (t) => {
  const options = fixture(t),
    marker = join(options.root, "first"),
    resultFile = join(options.root, "result");
  const result = await runWorkload({
    ...options,
    phases: [
      phase(put(marker, "ready")),
      {
        command: process.execPath,
        args: [
          "-e",
          `const fs=require('node:fs'); fs.writeFileSync('result', fs.readFileSync('first','utf8')+':'+process.argv[1]+':'+process.env.OWNED_PROBE);`,
          "a b",
        ],
        cwd: options.root,
        env: { ...process.env, OWNED_PROBE: "yes" },
      },
    ],
  });
  assert.equal(result.exitCode, 0);
  assert.equal(readFileSync(resultFile, "utf8"), "ready:a b:yes");
  assert.equal(inspectOwner(options.root).status, "free");
});

test("a vanished executable is a launch failure, not a passed phase", async (t) => {
  const options = fixture(t);
  const result = await runWorkload({
    ...options,
    phases: [
      { command: join(options.root, "missing"), args: [], cwd: options.root },
    ],
  });
  assert.equal(result.exitCode, 127);
  assert.equal(result.classification, "launch-failed");
  assert.equal(inspectOwner(options.root).status, "free");
});

test("signal termination is preserved without asserting an OOM cause", async (t) => {
  const options = fixture(t);
  const result = await runWorkload({
    ...options,
    phases: [phase("process.kill(process.pid, 'SIGTERM')")],
  });
  assert.equal(result.exitCode, 143);
  assert.equal(result.signal, "SIGTERM");
  assert.equal(result.classification, "signal");
  assert.equal(inspectOwner(options.root).status, "free");
});

test("live child generation and observed descendants are durable before release", async (t) => {
  const options = fixture(t),
    saved = join(options.root, "saved");
  const ownerPath = join(options.root, "owner", "owner.json");
  const code = `const fs=require('node:fs'); const timeout=setTimeout(()=>process.exit(55),2000); const timer=setInterval(()=>{const m=JSON.parse(fs.readFileSync(${JSON.stringify(ownerPath)},'utf8')); if(m.child?.start && m.observed.some(p=>p.pid===process.pid)){fs.writeFileSync(${JSON.stringify(saved)},JSON.stringify(m));clearInterval(timer);clearTimeout(timeout);}},5);`;
  const result = await runWorkload({ ...options, phases: [phase(code)] });
  assert.equal(result.exitCode, 0);
  const metadata = JSON.parse(readFileSync(saved, "utf8"));
  assert.equal(metadata.phase, "active");
  assert.equal(metadata.child.pid, result.phases[0].pid);
  assert.equal(
    metadata.child.start,
    metadata.observed.find((p) => p.pid === metadata.child.pid).started,
  );
  assert.ok(metadata.observed.every((p) => p.uid === process.getuid()));
});

test("cleanup waits for an observed descendant that outlives its reaped parent", async (t) => {
  const options = fixture(t),
    ready = join(options.root, "leaf-pid"),
    release = join(options.root, "leaf-release"),
    done = join(options.root, "leaf-done"),
    ownerPath = join(options.root, "owner", "owner.json");
  const leaf = `const fs=require('node:fs');
fs.writeFileSync(${JSON.stringify(ready)},String(process.pid));
setTimeout(()=>process.exit(86),3000).unref();
setInterval(()=>{if(!fs.existsSync(${JSON.stringify(release)}))return;let phase;try{phase=JSON.parse(fs.readFileSync(${JSON.stringify(ownerPath)},'utf8')).phase}catch{phase='missing'}fs.writeFileSync(${JSON.stringify(done)},phase);process.exit(0)},5);`;
  const parent = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'});child.unref();const timer=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(ready)}))clearInterval(timer)},5);`;
  const originalKill = process.kill.bind(process);
  const signals = t.mock.method(process, "kill", originalKill);
  let blockedCompetitors = 0;
  const result = await runWorkload({
    ...options,
    observe: ({ phase: stage, childPid }) => {
      const host = options.observe();
      if (
        stage === "cleanup" &&
        host.processes.value.some((p) => p.pgid === childPid)
      ) {
        assert.throws(
          () =>
            acquireOwner(options.root, {
              ...options.metadata,
              id: randomUUID(),
            }),
          { code: "RESOURCE_REFUSED" },
        );
        blockedCompetitors++;
        writeFileSync(release, "positively observed after leader exit");
      }
      return host;
    },
    phases: [phase(parent)],
  });
  // Finish our harmless fixture even when the production gate fails first.
  // This wait does not change the already-returned receipt under assertion.
  writeFileSync(release, "fixture cleanup");
  await until(() => existsSync(done));
  const leafPid = Number(readFileSync(ready, "utf8"));
  await until(() => !readHost().processes.value.some((p) => p.pid === leafPid));
  assert.equal(readFileSync(done, "utf8"), "active");
  assert.equal(result.cleanup, "verified", JSON.stringify(result.phases));
  assert.ok(result.phases[0].cleanupSamples > 1);
  assert.ok(blockedCompetitors > 0);
  assert.equal(signals.mock.callCount(), 0);
  assert.equal(result.exitCode, 0);
  assert.equal(inspectOwner(options.root).status, "free");
});

test("cleanup settlement never upgrades an unavailable census, pressure change or surviving deadline", async (t) => {
  for (const condition of [
    "initial-census",
    "lost-census",
    "pressure",
    "deadline",
  ]) {
    const options = fixture(t);
    let samples = 0;
    const result = await runWorkload({
      ...options,
      cleanupMs: 60,
      observe: ({ phase: stage, childPid }) => {
        const host = options.observe();
        if (stage !== "cleanup") return host;
        samples++;
        if (
          condition === "initial-census" ||
          (condition === "lost-census" && samples > 1)
        )
          return { ...host, processes: { unavailable: "census witness" } };
        if (condition === "pressure" && samples > 1)
          return { ...host, pressure: { state: "warning" } };
        return {
          ...host,
          processes: {
            value: [
              ...host.processes.value,
              {
                pid: 2147483647,
                ppid: 1,
                pgid: childPid,
                uid: process.getuid(),
                rssKiB: 0,
                started: "synthetic cleanup identity",
                executable: "harmless census-only witness",
              },
            ],
          },
        };
      },
      phases: [phase("process.exit(0)")],
    });
    assert.equal(result.cleanup, "unresolved", condition);
    assert.notEqual(result.exitCode, 0, condition);
    assert.equal(inspectOwner(options.root).status, "occupied", condition);
    assert.equal(result.phases[0].exitCode, 0);
    if (condition !== "deadline")
      assert.equal(samples, condition === "initial-census" ? 1 : 2);
  }
});

test("cleanup settlement retains descendants first discovered after the leader exit", async (t) => {
  const options = fixture(t);
  let samples = 0;
  const result = await runWorkload({
    ...options,
    observe: ({ phase: stage, childPid }) => {
      const host = options.observe();
      if (stage !== "cleanup") return host;
      samples++;
      if (samples === 3)
        assert.ok(
          inspectOwner(options.root).metadata.observed.some(
            (p) => p.pid === 2147483646,
          ),
        );
      if (samples >= 4) return host;
      const pid = samples === 1 ? 2147483647 : 2147483646;
      return {
        ...host,
        processes: {
          value: [
            ...host.processes.value,
            {
              pid,
              ppid: 1,
              pgid: samples === 3 ? pid : childPid,
              uid: process.getuid(),
              rssKiB: 0,
              started: "synthetic cleanup identity",
              executable: "harmless census-only witness",
            },
          ],
        },
      };
    },
    phases: [phase("process.exit(0)")],
  });
  assert.equal(samples, 4);
  assert.equal(result.cleanup, "verified");
  assert.equal(result.exitCode, 0);
});

test("pressure interruption remains nonzero when the child handles SIGINT as success", async (t) => {
  const options = fixture(t),
    ready = join(options.root, "ready"),
    stopped = join(options.root, "stopped"),
    later = join(options.root, "later");
  const result = await runWorkload({
    ...options,
    observe: () => ({
      ...readHost(),
      pressure: { state: existsSync(ready) ? "warning" : "normal" },
    }),
    phases: [
      phase(
        `process.on('SIGINT',()=>{${put(stopped, "graceful")}process.exit(0)});${put(ready, "yes")}setInterval(()=>{},1000)`,
      ),
      phase(put(later, "ran")),
    ],
  });
  assert.equal(result.exitCode, 75);
  assert.equal(result.classification, "resource-aborted");
  assert.equal(readFileSync(stopped, "utf8"), "graceful");
  assert.equal(existsSync(later), false);
  assert.equal(inspectOwner(options.root).status, "free");
});

test("cancellation reaches the owned fork group but not a foreign live child", async (t) => {
  const options = fixture(t),
    ready = join(options.root, "ready"),
    stopped = join(options.root, "stopped");
  const foreign = spawn(
    process.execPath,
    ["-e", "process.on('message',m=>process.send(m));process.send('ready')"],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  t.after(async () => {
    if (foreign.exitCode === null && foreign.signalCode === null) {
      foreign.kill("SIGTERM");
      await once(foreign, "exit");
    }
  });
  await once(foreign, "message");
  const grandchild = `setTimeout(()=>process.exit(86),3000).unref();process.on('SIGINT',()=>{${put(stopped, "owned fork stopped")}process.exit(0)});${put(ready, "yes")}setInterval(()=>{},1000)`;
  const parent = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});process.on('SIGINT',()=>{});child.on('exit',()=>process.exit(0));`;
  const result = await runWorkload({
    ...options,
    observe: () => ({
      ...readHost(),
      pressure: { state: existsSync(ready) ? "warning" : "normal" },
    }),
    phases: [phase(parent)],
  });
  assert.equal(result.exitCode, 75);
  assert.equal(result.cleanup, "verified");
  assert.equal(readFileSync(stopped, "utf8"), "owned fork stopped");
  const pong = once(foreign, "message");
  foreign.send("still alive");
  assert.deepEqual(await pong, ["still alive", undefined]);
});

test("ignored INT escalates to TERM and never upgrades handled cancellation to pass", async (t) => {
  const options = fixture(t),
    ready = join(options.root, "ready"),
    signals = join(options.root, "signals");
  const code = `const fs=require('node:fs');process.on('SIGINT',()=>fs.appendFileSync(${JSON.stringify(signals)},'INT '));process.on('SIGTERM',()=>{fs.appendFileSync(${JSON.stringify(signals)},'TERM');process.exit(0)});${put(ready, "yes")}setInterval(()=>{},1000)`;
  const result = await runWorkload({
    ...options,
    interruptMs: 25,
    terminateMs: 1000,
    observe: () => ({
      ...readHost(),
      pressure: { state: existsSync(ready) ? "warning" : "normal" },
    }),
    phases: [phase(code)],
  });
  assert.equal(result.exitCode, 75);
  assert.equal(readFileSync(signals, "utf8"), "INT TERM");
  assert.equal(result.cleanup, "verified");
});

test("a child refusing both signals remains blocked, without owner SIGKILL", async (t) => {
  const options = fixture(t),
    ready = join(options.root, "ready"),
    survived = join(options.root, "survived");
  const code = `process.on('SIGINT',()=>{});process.on('SIGTERM',()=>setTimeout(()=>{${put(survived, "alive after deadline")}process.exit(0)},200));${put(ready, "yes")}setInterval(()=>{},1000)`;
  const result = await runWorkload({
    ...options,
    interruptMs: 25,
    terminateMs: 25,
    observe: () => ({
      ...readHost(),
      pressure: { state: existsSync(ready) ? "warning" : "normal" },
    }),
    phases: [phase(code)],
  });
  assert.equal(result.exitCode, 75);
  assert.equal(result.cleanup, "unresolved");
  assert.equal(inspectOwner(options.root).status, "occupied");
  assert.equal(result.classification, "resource-aborted");
  assert.equal(result.resourceAbort, true);
  assert.equal(result.phases[0].cleanupSamples, 1);
  assert.match(result.diagnosticErrors.join(" "), /unresolved live child/);
  assert.ok(
    result.phases[0].survivors.some((p) => p.pid === result.phases[0].pid),
  );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error("Owned fixture failed to finish naturally"));
    }, 3000);
    const timer = setInterval(() => {
      if (existsSync(survived)) {
        clearInterval(timer);
        clearTimeout(timeout);
        resolve();
      }
    }, 5);
  });
  assert.equal(readFileSync(survived, "utf8"), "alive after deadline");
});

test("unavailable cleanup observations retain blocked ownership even after exit zero", async (t) => {
  const options = fixture(t),
    finished = join(options.root, "finished");
  const unavailableAt = [];
  const result = await runWorkload({
    ...options,
    observe: ({ phase: boundary }) => {
      // The marker proves child work happened, not that its process exited.
      // Only the owner's post-wait boundary may lose cleanup evidence here.
      if (boundary === "cleanup") {
        unavailableAt.push(boundary);
        return {
          pressure: { state: "normal" },
          processes: { unavailable: "census failed" },
        };
      }
      return options.observe();
    },
    phases: [phase(put(finished, "done"))],
  });
  assert.deepEqual(unavailableAt, ["cleanup"]);
  assert.equal(result.phases[0].exitCode, 0);
  assert.equal(result.phases[0].signal, null);
  assert.equal(result.exitCode, 75);
  assert.equal(result.cleanup, "unresolved");
  assert.equal(readFileSync(finished, "utf8"), "done");
  assert.notEqual(inspectOwner(options.root).status, "free");
});

test("unavailable running census interrupts a ready live child before cleanup", async (t) => {
  const options = fixture(t),
    ready = join(options.root, "ready");
  const unavailableAt = [];
  const result = await runWorkload({
    ...options,
    observe: ({ phase: boundary }) => {
      // The ready marker is written while the event loop stays alive. The
      // phase helper's natural failsafe still bounds a broken cancellation.
      if (boundary === "running" && existsSync(ready)) {
        unavailableAt.push(boundary);
        return {
          pressure: { state: "normal" },
          processes: { unavailable: "running census failed" },
        };
      }
      return options.observe();
    },
    phases: [phase(`${put(ready, "ready")}setInterval(()=>{},1000)`)],
  });
  assert.ok(unavailableAt.length > 0);
  assert.ok(unavailableAt.every((boundary) => boundary === "running"));
  assert.equal(result.phases[0].exitCode, null);
  assert.equal(result.phases[0].signal, "SIGINT");
  assert.equal(result.exitCode, 130);
  assert.equal(result.signal, "SIGINT");
  assert.equal(result.classification, "resource-aborted");
  assert.equal(result.cleanup, "verified");
  assert.equal(inspectOwner(options.root).status, "free");
});

test("a non-normal final sample cannot turn a resource event into a pass", async (t) => {
  const options = fixture(t),
    finished = join(options.root, "finished");
  const result = await runWorkload({
    ...options,
    sampleMs: 1000,
    observe: ({ phase: boundary } = {}) => ({
      ...readHost(),
      pressure: { state: boundary === "cleanup" ? "warning" : "normal" },
    }),
    phases: [phase(put(finished, "done"))],
  });
  assert.equal(readFileSync(finished, "utf8"), "done");
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.classification, "resource-aborted");
});

test("failed staging restoration retains the initiating pressure diagnostic", async (t) => {
  const options = fixture(t),
    work = join(options.root, "work"),
    ready = join(options.root, "ready");
  mkdirSync(work);
  const git = (...args) => {
    const result = spawnSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      { cwd: work, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  };
  git("init");
  writeFileSync(join(work, "source.txt"), "original");
  git("add", ".");
  git("commit", "-m", "fixture");
  const result = await runWorkload({
    ...options,
    phases: [
      {
        ...phase(
          `${put(join(work, "source.txt"), "changed")}${put(ready, "yes")}setInterval(()=>{},1000)`,
        ),
        cwd: work,
        verifySourceOnFailure: true,
      },
    ],
    observe: ({ phase: boundary }) => ({
      ...options.observe(),
      ...(boundary === "running" && existsSync(ready)
        ? { pressure: { state: "warning" } }
        : {}),
    }),
  });
  assert.equal(result.cleanup, "unresolved");
  assert.equal(result.phases[0].stagingRestoration, "unresolved");
  assert.match(result.reason, /pressure\/census: warning/);
  assert.match(result.reason, /staging restoration/);
  assert.notEqual(inspectOwner(options.root).status, "free");
});

test("an independent child invocation cannot borrow its parent's owner", async (t) => {
  const options = fixture(t),
    refused = join(options.root, "refused");
  const ownerURL = new URL("./owner.mjs", import.meta.url).href;
  const child = `import {acquireOwner} from ${JSON.stringify(ownerURL)}; import {writeFileSync} from 'node:fs'; try { acquireOwner(${JSON.stringify(options.root)}, ${JSON.stringify({ ...options.metadata, id: randomUUID() })}); process.exit(99); } catch(e) { writeFileSync(${JSON.stringify(refused)}, String(e.exitCode)); }`;
  const result = await runWorkload({
    ...options,
    phases: [
      {
        command: process.execPath,
        args: ["--input-type=module", "-e", child],
        cwd: resolve(options.root),
      },
    ],
  });
  assert.equal(result.exitCode, 0, JSON.stringify(result));
  assert.equal(readFileSync(refused, "utf8"), "75");
});
