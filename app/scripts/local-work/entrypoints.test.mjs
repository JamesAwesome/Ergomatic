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
    path.join(source, "scripts/local-work.mjs"),
    "app/scripts/local-work.mjs",
  );
  for (const name of ["host", "owner", "run", "workloads"])
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
fs.appendFileSync(path.join(root,'calls.jsonl'),JSON.stringify({kind,args:process.argv.slice(2),cwd:process.cwd(),owner,nodeOptions:process.env.NODE_OPTIONS,ci:process.env.CI})+'\\n');
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
    env: f.env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(full.status, 0, full.stdout + full.stderr);
  assert.match(full.stderr, /EXCLUDED.*unit, client, integration/);
  assert.equal(f.calls()[0].owner, null);
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
