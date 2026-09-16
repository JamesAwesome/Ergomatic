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
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { runWorkload } from "./run.mjs";
import { inspectOwner } from "./owner.mjs";
import { readHost } from "./host.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ergo-run-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
  args: ["-e", code],
  cwd: process.cwd(),
});
const put = (path, text) =>
  `require('node:fs').writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(text)});`;

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
  const grandchild = `process.on('SIGINT',()=>{${put(stopped, "owned fork stopped")}process.exit(0)});${put(ready, "yes")}setInterval(()=>{},1000)`;
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
  const result = await runWorkload({
    ...options,
    observe: () =>
      existsSync(finished)
        ? {
            pressure: { state: "normal" },
            processes: { unavailable: "census failed" },
          }
        : options.observe(),
    phases: [phase(put(finished, "done"))],
  });
  assert.equal(result.exitCode, 75);
  assert.equal(result.cleanup, "unresolved");
  assert.equal(readFileSync(finished, "utf8"), "done");
  assert.notEqual(inspectOwner(options.root).status, "free");
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
  assert.equal(result.exitCode, 0);
  assert.equal(readFileSync(refused, "utf8"), "75");
});
