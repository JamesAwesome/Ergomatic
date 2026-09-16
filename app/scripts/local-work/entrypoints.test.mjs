import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { containerBuild } from "./container-build.mjs";

const source = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repo = path.dirname(source);
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const pnpm = spawnSync("which", ["pnpm"], { encoding: "utf8" }).stdout.trim();
function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "admission-entry-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, text) => {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
    return filename;
  };
  const copy = (from, to) => {
    fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
    fs.cpSync(from, path.join(root, to), { recursive: true });
  };
  spawnSync("git", ["init", "-q", root]);
  put(".nvmrc", "26\n");
  for (const file of ["common.sh", "pre-commit", "pre-push"])
    copy(path.join(repo, ".husky", file), `.husky/${file}`);
  copy(path.join(source, "package.json"), "app/package.json");
  copy(
    path.join(source, "scripts/test-evidence-record.mjs"),
    "app/scripts/test-evidence-record.mjs",
  );
  copy(
    path.join(source, "scripts/test-evidence.mjs"),
    "app/scripts/test-evidence.mjs",
  );
  copy(
    path.join(source, "scripts/local-work.mjs"),
    "app/scripts/local-work.mjs",
  );
  for (const name of ["host", "owner", "run", "outcome", "workloads"])
    copy(
      path.join(source, `scripts/local-work/${name}.mjs`),
      `app/scripts/local-work/${name}.mjs`,
    );
  for (const name of [
    "test-run.sh",
    "test-run-advisory.sh",
    "test-kill-capture.sh",
  ])
    copy(path.join(source, "scripts", name), `app/scripts/${name}`);
  // The runner replacement is a filesystem fixture, never a production bypass
  // variable. Actual script/hook/admission/runner-shell control flow stays real.
  const recorder = `import fs from 'node:fs';import path from 'node:path';
const root=${JSON.stringify(root)};const kind=process.argv[1].includes('typescript')?'tsc':process.argv[1].includes('vite.js')?'vite':process.argv[1].includes('vitest')?'vitest':'other';
let owner=null;try{owner=JSON.parse(fs.readFileSync(path.join(root,'.git/ergomatic-local-work/owner/owner.json'),'utf8')).id;}catch{}
fs.appendFileSync(path.join(root,'calls.jsonl'),JSON.stringify({kind,args:process.argv.slice(2),cwd:process.cwd(),owner,nodeOptions:process.env.NODE_OPTIONS,ci:process.env.CI,outcome:process.env.ERGOMATIC_TEST_OUTCOME})+'\\n');
if(process.env.FIXTURE_SIGNAL) process.kill(process.pid,process.env.FIXTURE_SIGNAL);
else {console.log('Test Files  1 passed (1)');process.exitCode=kind===process.env.FIXTURE_FAIL_KIND?Number(process.env.FIXTURE_FAIL_CODE):0;}
`;
  for (const bin of [
    "typescript/bin/tsc",
    "vite/bin/vite.js",
    "eslint/bin/eslint.js",
    "vitest/runner.mjs",
  ])
    put(`app/node_modules/${bin}`, recorder);
  const vitest = put(
    "app/node_modules/.bin/vitest",
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(root, "app/node_modules/vitest/runner.mjs"))} "$@"\n`,
  );
  fs.chmodSync(vitest, 0o755);
  put("app/scripts/e2e-typecheck-census.sh", "#!/bin/sh\nexit 0\n");
  const driver = put(
    "driver.mjs",
    `import {main} from './app/scripts/local-work.mjs';import {readHost} from './app/scripts/local-work/host.mjs';
process.exitCode=await main(process.argv.slice(2),{observe:()=>({...readHost(),pressure:{state:process.env.FIXTURE_PRESSURE??'normal'}})});\n`,
  );
  const node = put(
    "bin/node",
    `#!/bin/sh\nif [ "$1" = -v ]; then echo "v\${FIXTURE_NODE_MAJOR:-26}.0.0";exit 0;fi\ncase "$1" in *local-work.mjs) shift;exec ${quote(process.execPath)} ${quote(driver)} "$@";; esac\nexec ${quote(process.execPath)} "$@"\n`,
  );
  fs.chmodSync(node, 0o755);
  const lint = put(
    "bin/pnpm",
    `#!/bin/sh\nif [ "$*" != 'exec lint-staged' ];then exit 96;fi\nprintf 'lint-staged\\n' >> ${quote(path.join(root, "lint.log"))}\nexit "\${FIXTURE_LINT_CODE:-0}"\n`,
  );
  fs.chmodSync(lint, 0o755);
  put(
    "app/src/theme/customPropertyCensus.test.ts",
    'import {readFileSync} from "node:fs";',
  );
  const env = {
    ...process.env,
    CI: "1",
    PREPUSH_BASE: "HEAD",
    pnpm_config_verify_deps_before_run: "false",
    PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
  };
  delete env.ERGOMATIC_HOSTED_CI;
  delete env.ERGOMATIC_TEST_RUN_BIN;
  // Seed a ref without running commit hooks, writing commits, or shared state.
  // An empty tree + hash-object/commit-tree would be a commit; use the existing
  // repository's HEAD object through Git alternates instead.
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim();
  put(
    ".git/objects/info/alternates",
    path.resolve(repo, common, "objects") + "\n",
  );
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).stdout.trim();
  spawnSync("git", ["update-ref", "refs/heads/fixture", head], { cwd: root });
  spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/fixture"], {
    cwd: root,
  });
  spawnSync("git", ["read-tree", "HEAD"], { cwd: root });
  const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root }).stdout;
  spawnSync("git", ["update-index", "--skip-worktree", "-z", "--stdin"], {
    cwd: root,
    input: tracked,
  });
  const calls = () =>
    fs.existsSync(path.join(root, "calls.jsonl"))
      ? fs
          .readFileSync(path.join(root, "calls.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map(JSON.parse)
      : [];
  const hook = (name, extra = {}) =>
    spawnSync("sh", ["-e", `.husky/${name}`], {
      cwd: root,
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 15000,
    });
  return { root, put, env, calls, hook };
}

test("pre-commit hook refuses pressure before lint-staged and preserves Node version rejection", (t) => {
  const f = fixture(t);
  const pressure = f.hook("pre-commit", { FIXTURE_PRESSURE: "warning" });
  assert.equal(pressure.status, 75, pressure.stderr);
  assert.equal(fs.existsSync(path.join(f.root, "lint.log")), false);
  const old = f.hook("pre-commit", { FIXTURE_NODE_MAJOR: "24" });
  assert.equal(old.status, 1);
  assert.match(old.stderr, /HOOK BLOCKED/);
});

test("documented local capture owns native evidence with exactly one resource sampler", (t) => {
  const f = fixture(t);
  const probes = path.join(f.root, "probes.jsonl");
  for (const bin of ["ps", "sysctl"]) {
    const script = f.put(
      `bin/${bin}`,
      `#!/bin/sh
printf '%s\\n' "${bin} $*" >> ${quote(probes)}
${bin === "ps" ? 'exec /bin/ps "$@"' : 'case "$2" in kern.memorystatus_vm_pressure_level) echo 1;; *) echo fixture-swap;; esac'}
`,
    );
    fs.chmodSync(script, 0o755);
  }
  // Source-level observation seam routes real host parsing through controlled
  // binaries. No production environment switch disables a sampler.
  f.put(
    "driver.mjs",
    `import {main} from './app/scripts/local-work.mjs';import {readHost} from './app/scripts/local-work/host.mjs';import{spawnSync}from'node:child_process';import path from'node:path';
const command=(bin,args)=>{const r=spawnSync(path.join(${JSON.stringify(f.root)},'bin',path.basename(bin)),args,{encoding:'utf8',timeout:2000});return r.status===0?{value:r.stdout.trim()}:{unavailable:r.stderr};};
process.exitCode=await main(process.argv.slice(2),{observe:()=>readHost({platform:'darwin',command})});\n`,
  );
  const timers = path.join(f.root, "samplers.jsonl");
  const sentinel = f.put(
    "sampler-sentinel.mjs",
    `import fs from 'node:fs';
const original = globalThis.setInterval;
globalThis.setInterval = function (...args) {
  const stack = new Error().stack;
  if (/scripts\\/(?:test-evidence|local-work\\/run)/.test(stack)) fs.appendFileSync(${JSON.stringify(timers)}, JSON.stringify({pid:process.pid,stack})+'\\n');
  return original(...args);
};\n`,
  );
  f.put(
    "app/node_modules/vitest/runner.mjs",
    `import fs from 'node:fs';import path from 'node:path';
const directory=process.env.ERGOMATIC_EVIDENCE_DIR;
if(!directory) throw new Error('native reporting directory missing');
const owner=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(f.root, ".git/ergomatic-local-work/owner/owner.json"))},'utf8'));
if(path.basename(directory)!==owner.id) throw new Error('capture is outside owner lifetime');
console.log('capture stdout');console.error('capture stderr');
const deadline=setTimeout(()=>process.exit(91),5000);
const timer=setInterval(()=>{
 const rows=fs.readFileSync(path.join(directory,'resources.jsonl'),'utf8').trim().split('\\n').map(JSON.parse);
 if(rows.filter(r=>r.phase==='running').length<2) return;
 clearInterval(timer);clearTimeout(deadline);
 fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({testResults:[{name:'fixture.test.ts',assertionResults:[{fullName:'owned capture',status:'passed'}]}]}));
 console.log('Test Files 1 passed (1)');
},10);\n`,
  );
  const result = spawnSync(
    pnpm,
    [
      "--dir",
      "app",
      "test:capture",
      "--project",
      "unit",
      "fixture.test.ts",
      "--maxWorkers=2",
    ],
    {
      cwd: f.root,
      env: { ...f.env, NODE_OPTIONS: `--import=${sentinel}` },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /capture stdout/);
  assert.match(result.stderr, /capture stderr/);
  const samplerRows = fs
    .readFileSync(timers, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(samplerRows.length, 1, JSON.stringify(samplerRows));
  const probeRows = fs.readFileSync(probes, "utf8").trim().split("\n");
  const censuses = probeRows.filter((row) => row.startsWith("ps -axo"));
  assert.ok(censuses.length >= 4);
  assert.equal(
    probeRows.filter(
      (row) => row === "sysctl -n kern.memorystatus_vm_pressure_level",
    ).length,
    censuses.length,
  );
  const receipts = path.join(f.root, ".git/ergomatic-local-work/receipts");
  const names = fs.readdirSync(receipts);
  assert.equal(names.length, 1);
  const directory = path.join(receipts, names[0]);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(directory, "receipt.json"), "utf8"),
  );
  assert.equal(receipt.runner, "vitest");
  assert.equal(receipt.cleanup, "verified");
  assert.equal(receipt.phases[0].workers.max, 2);
  assert.equal(receipt.phases[0].workers.source, "cli");
  assert.equal(receipt.phases[0].workers.actual, null);
  assert.deepEqual(receipt.scope.projects, ["unit"]);
  assert.equal(receipt.phases[0].argv.includes("fixture.test.ts"), true);
  assert.equal(fs.existsSync(path.join(f.root, "app/.test-evidence")), false);
  for (const [action, needle] of [
    ["check", /evidence: complete/],
    ["summary", /initial executions: 1/],
  ]) {
    const evidence = spawnSync(
      process.execPath,
      [path.join(source, "scripts/test-evidence.mjs"), action, directory],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_ACTIONS: "false",
          GITHUB_STEP_SUMMARY: "",
        },
        timeout: 5000,
      },
    );
    assert.equal(evidence.status, 0, evidence.stdout + evidence.stderr);
    assert.match(evidence.stdout, needle);
  }
  assert.match(
    fs.readFileSync(path.join(directory, "stdout.log"), "utf8"),
    /capture stdout/,
  );
  assert.match(
    fs.readFileSync(path.join(directory, "stderr.log"), "utf8"),
    /capture stderr/,
  );
});
test("hosted capture keeps the native observer and command failure independent of passing assertions", (t) => {
  const f = fixture(t);
  f.put(
    "app/node_modules/vitest/runner.mjs",
    `import fs from 'node:fs';import path from 'node:path';
fs.writeFileSync(path.join(process.env.ERGOMATIC_EVIDENCE_DIR,'report.json'),JSON.stringify({testResults:[{name:'fixture',assertionResults:[{fullName:'passes',status:'passed'}]}]}));
console.log('Test Files 1 passed (1)');process.exitCode=23;\n`,
  );
  const result = spawnSync(
    pnpm,
    ["--dir", "app", "test:capture", "--project", "unit"],
    {
      cwd: f.root,
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...f.env,
        CI: "true",
        ERGOMATIC_HOSTED_CI: "1",
        GITHUB_ACTIONS: "true",
        RUNNER_ENVIRONMENT: "github-hosted",
        GITHUB_RUN_ID: "1",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_WORKSPACE: f.root,
        GITHUB_OUTPUT: "",
        GITHUB_STEP_SUMMARY: "",
      },
    },
  );
  assert.equal(result.status, 23, result.stdout + result.stderr);
  assert.equal(
    fs.existsSync(path.join(f.root, ".git/ergomatic-local-work")),
    false,
  );
  const root = path.join(f.root, "app/.test-evidence");
  const names = fs.readdirSync(root);
  assert.equal(names.length, 1);
  const directory = path.join(root, names[0]);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(directory, "receipt.json"), "utf8"),
  );
  assert.equal(receipt.exitCode, 23);
  assert.equal(receipt.runner, "vitest");
  assert.equal(receipt.cleanup.status, "unverified");
  const check = spawnSync(
    process.execPath,
    [path.join(source, "scripts/test-evidence.mjs"), "check", directory],
    {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, GITHUB_ACTIONS: "false", GITHUB_STEP_SUMMARY: "" },
    },
  );
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /command: exit 23/);
  assert.match(check.stdout, /first-attempt failures: 0/);
});

test("pre-commit has one owner, fails fast after staged lint, and preserves typecheck exit under sh -e", (t) => {
  const f = fixture(t);
  const lint = f.hook("pre-commit", { FIXTURE_LINT_CODE: "17" });
  assert.equal(lint.status, 17, lint.stderr);
  assert.deepEqual(f.calls(), []);
  const typecheck = f.hook("pre-commit", {
    FIXTURE_FAIL_KIND: "tsc",
    FIXTURE_FAIL_CODE: "23",
  });
  assert.equal(typecheck.status, 23, typecheck.stderr);
  assert.equal(f.calls().length, 1);
  assert.ok(f.calls()[0].owner);
});
test("pre-push executes all three legacy populations despite ambient dry-run flags", (t) => {
  const f = fixture(t);
  const result = f.hook("pre-push", { PREPUSH_DRY_RUN: "1", DRY_RUN: "1" });
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      ["run", "--changed", "HEAD", "--project", "unit", "--project", "client"],
      ["run", "--project", "unit", "scripts/"],
      ["run", "--project", "client", "src/theme/customPropertyCensus.test.ts"],
    ],
  );
  assert.ok(calls[0].owner);
  assert.equal(new Set(calls.map((c) => c.owner)).size, 1);
  assert.deepEqual(
    calls.map((c) => c.outcome),
    ["1", "1", "1"],
  );
  const receipt = JSON.parse(
    fs.readFileSync(
      path.join(
        f.root,
        ".git/ergomatic-local-work/receipts",
        calls[0].owner,
        "receipt.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    receipt.phases.map((phase) => phase.reportedOutcome),
    [
      { classification: "passed", signal: null },
      { classification: "passed", signal: null },
      { classification: "passed", signal: null },
    ],
  );
});
test("pre-push legacy missing-base fallback stays Docker-free and fails fast on runner failure", (t) => {
  const f = fixture(t);
  const result = f.hook("pre-push", {
    PREPUSH_BASE: "refs/heads/missing",
    FIXTURE_FAIL_KIND: "vitest",
    FIXTURE_FAIL_CODE: "19",
  });
  assert.equal(result.status, 19, result.stderr);
  assert.match(result.stderr, /FALLBACK/);
  assert.deepEqual(
    f.calls().map((c) => c.args),
    [["run", "--project", "unit", "--project", "client"]],
  );
});
test("package test preserves selectors and Node flags through the real pnpm boundary", (t) => {
  assert.ok(pnpm, "pnpm must be installed for the package-boundary gate");
  const f = fixture(t);
  const result = spawnSync(
    pnpm,
    [
      "--dir",
      "app",
      "test",
      "--project",
      "client",
      "src/space ü.test.tsx",
      "-t",
      "one behavior",
    ],
    {
      cwd: f.root,
      env: { ...f.env, NODE_OPTIONS: "--max-old-space-size=128" },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.calls().length, 1);
  assert.deepEqual(f.calls()[0].args, [
    "run",
    "--project",
    "client",
    "src/space ü.test.tsx",
    "-t",
    "one behavior",
  ]);
  assert.match(
    f.calls()[0].nodeOptions,
    /--no-experimental-webstorage.*--max-old-space-size=128/,
  );
  assert.ok(f.calls()[0].owner);
  assert.equal(f.calls()[0].ci, undefined);
  assert.equal(f.calls()[0].outcome, "1");
});
test("build package executes three serial internal phases and propagates child signal", (t) => {
  const f = fixture(t);
  const result = spawnSync(pnpm, ["--dir", "app", "build"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(
    f.calls().map((c) => c.kind),
    ["tsc", "vite", "tsc"],
  );
  assert.ok(f.calls()[0].owner);
  assert.equal(new Set(f.calls().map((c) => c.owner)).size, 1);
  const killed = f.hook("pre-push", { FIXTURE_SIGNAL: "SIGTERM" });
  assert.equal(killed.status, 143, killed.stderr);
  assert.match(killed.stderr, /signal/);
});

test("container build caller runs the fixed pipeline without requiring Git and refuses on macOS", async (t) => {
  const f = fixture(t);
  const output = [];
  fs.rmSync(path.join(f.root, ".git"), { recursive: true });
  assert.equal(
    await containerBuild({
      app: path.join(f.root, "app"),
      platform: "darwin",
      env: f.env,
      write: (s) => output.push(s),
    }),
    64,
  );
  assert.equal(f.calls().length, 0);
  assert.equal(
    await containerBuild({
      app: path.join(f.root, "app"),
      platform: "linux",
      env: f.env,
      write: (s) => output.push(s),
    }),
    0,
  );
  assert.deepEqual(
    f.calls().map((c) => c.kind),
    ["tsc", "vite", "tsc"],
  );
  assert.ok(f.calls().every((c) => c.owner === null));
});

test("package full and integration are explicit exclusions, while missing and malformed selectors refuse", (t) => {
  const f = fixture(t);
  for (const args of [
    ["test"],
    ["test", "--project="],
    ["test", "--project", "unit", "--self-test"],
  ]) {
    const result = spawnSync(pnpm, ["--dir", "app", ...args], {
      cwd: f.root,
      env: f.env,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.notEqual(result.status, 0);
    assert.deepEqual(f.calls(), []);
  }
  const full = spawnSync(pnpm, ["--dir", "app", "test:full"], {
    cwd: f.root,
    env: { ...f.env, ERGOMATIC_TEST_OUTCOME: "1" },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(full.status, 0, full.stdout + full.stderr);
  assert.match(full.stderr, /EXCLUDED.*unit, client, integration/);
  assert.equal(f.calls()[0].owner, null);
  assert.equal(f.calls()[0].outcome, undefined);
  const refused = spawnSync(
    pnpm,
    ["--dir", "app", "test", "--project", "integration"],
    {
      cwd: f.root,
      env: { ...f.env, FIXTURE_PRESSURE: "warning" },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /resource-refused/);
  assert.equal(f.calls().length, 1);
});

test("pre-push corpus census includes every current file-reading client suite", async (t) => {
  const f = fixture(t);
  const collect = (directory, prefix = "src") =>
    fs
      .readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? collect(path.join(directory, entry.name), `${prefix}/${entry.name}`)
          : /\.test\.tsx?$/.test(entry.name)
            ? [`${prefix}/${entry.name}`]
            : [],
      );
  const files = collect(path.join(source, "src"));
  const required = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(source, file), "utf8");
    if (
      /readFileSync|readdirSync|statSync|readCapture\(|capturePath\(/.test(text)
    )
      required.push(file);
    f.put(`app/${file}`, text);
  }
  const result = f.hook("pre-push");
  assert.equal(result.status, 0, result.stderr);
  const selected = f.calls()[2].args;
  assert.ok(required.length > 0);
  assert.deepEqual(
    required.filter((file) => !selected.includes(file)),
    [],
  );
});

test("pre-commit descendants cannot borrow their parent's owner to start another workload", (t) => {
  const f = fixture(t);
  f.put(
    "bin/pnpm",
    `#!/bin/sh\nexec node app/scripts/local-work.mjs run build\n`,
  );
  const result = f.hook("pre-commit", {
    ERGOMATIC_OWNER_TOKEN: "inherited-is-not-an-exemption",
  });
  assert.equal(result.status, 75, result.stderr);
  assert.match(result.stderr, /resource-refused/);
  assert.deepEqual(f.calls(), []);
  assert.equal(
    fs.existsSync(path.join(f.root, ".git/ergomatic-local-work/owner")),
    false,
  );
});

test("container version-stamp gate anchors version exports above the fixed build RUN", (t) => {
  const f = fixture(t);
  for (const filename of [
    "app/Dockerfile",
    "app/vite.config.ts",
    "app/src/appVersion.ts",
    "scripts/app-version-stamp.test.sh",
    ".github/workflows/ci.yml",
  ])
    f.put(filename, fs.readFileSync(path.join(repo, filename), "utf8"));
  // This fixture gates the real script's Dockerfile ordering checks only.
  // Actual Compose rendering remains the existing hosted shell gate's job.
  const docker = f.put(
    "bin/docker",
    '#!/bin/sh\n[ "$*" = "compose config" ] || exit 96\nprintf "  web:\\n    APP_VERSION: stamp-probe\\n"\n',
  );
  fs.chmodSync(docker, 0o755);
  const result = spawnSync("bash", ["scripts/app-version-stamp.test.sh"], {
    cwd: f.root,
    env: f.env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
