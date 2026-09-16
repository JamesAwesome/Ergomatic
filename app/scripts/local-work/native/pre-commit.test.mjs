import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const appSource = fileURLToPath(new URL("../../../", import.meta.url));
const repoSource = path.dirname(appSource.replace(/\/$/, ""));

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-real-hook-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const put = (name, data) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  const copy = (name) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(repoSource, name), path.join(root, name));
  };
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  for (const name of [
    ".nvmrc",
    ".husky/common.sh",
    ".husky/pre-commit",
    "app/scripts/local-work.mjs",
    "app/scripts/test-evidence-record.mjs",
  ])
    copy(name);
  for (const name of fs
    .readdirSync(path.join(appSource, "scripts/local-work"))
    .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs")))
    copy(`app/scripts/local-work/${name}`);
  const scripts = JSON.parse(
    fs.readFileSync(path.join(repoSource, "package.json")),
  )["lint-staged"];
  put(
    "package.json",
    JSON.stringify({ private: true, type: "module", "lint-staged": scripts }),
  );
  put("app/package.json", JSON.stringify({ private: true, type: "module" }));
  put(".gitignore", "node_modules/\n*.tsbuildinfo\n");
  for (const prefix of [".claude", ".agents"])
    put(`${prefix}/skills/example/SKILL.md`, "fixture prose\n");
  put("app/src/witness.ts", "export const value: number = 1;\n");
  const compiler = {
    compilerOptions: {
      strict: true,
      target: "ES2022",
      module: "NodeNext",
      skipLibCheck: true,
      types: [],
      noEmit: true,
    },
    include: ["src/**/*.ts"],
  };
  for (const name of [
    "tsconfig.json",
    "tsconfig.server.json",
    "tsconfig.server.build.json",
  ])
    put(`app/${name}`, JSON.stringify(compiler));
  put(
    "app/e2e/tsconfig.json",
    JSON.stringify({ ...compiler, include: ["../src/**/*.ts"] }),
  );
  put("app/scripts/e2e-typecheck-census.sh", "#!/bin/sh\nexit 0\n");
  const tseslint = pathToFileURL(
    path.join(appSource, "node_modules/typescript-eslint/dist/index.js"),
  ).href;
  put(
    "app/eslint.config.mjs",
    `import tseslint from ${JSON.stringify(tseslint)};
export default [{files:['**/*.ts'],languageOptions:{parser:tseslint.parser,parserOptions:{project:'./tsconfig.json',tsconfigRootDir:${JSON.stringify(app)}}},plugins:{'@typescript-eslint':tseslint.plugin},rules:{'@typescript-eslint/no-floating-promises':'error'}}];`,
  );
  fs.symlinkSync(
    path.join(repoSource, "node_modules"),
    path.join(root, "node_modules"),
  );
  fs.symlinkSync(
    path.join(appSource, "node_modules"),
    path.join(app, "node_modules"),
  );
  // Hosted CI must exercise local ownership, not select runUnmanaged. This
  // fixture-only driver uses main's injected observation seam on Linux;
  // actual macOS runs retain real host-pressure observations.
  put(
    "hook-driver.mjs",
    `import {main} from './app/scripts/local-work.mjs';
import {readHost} from './app/scripts/local-work/host.mjs';
process.exitCode=await main(process.argv.slice(2), {
  env:{...process.env, ERGOMATIC_HOSTED_CI:'0'},
  observe:()=>{const host=readHost();return process.platform==='darwin'?host:{...host,pressure:{state:'normal'}}},
});`,
  );
  put(
    "bin/node",
    `#!/bin/sh
case "$1" in *local-work.mjs) shift;exec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(root, "hook-driver.mjs"))} "$@";; esac
exec ${JSON.stringify(process.execPath)} "$@"
`,
  );
  fs.chmodSync(path.join(root, "bin", "node"), 0o755);
  const env = {
    ...process.env,
    pnpm_config_verify_deps_before_run: "false",
    PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`,
  };
  git("add", ".");
  git("commit", "-m", "fixture");
  // Use Husky's installed bootstrap and the production hook, not a simulated
  // success/failure recorder. Only the compiler project is deliberately tiny.
  copy(".husky/_/h");
  copy(".husky/_/pre-commit");
  git("config", "core.hooksPath", ".husky/_");
  const hook = (extraEnv = {}) =>
    spawnSync("sh", [".husky/_/pre-commit"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: { ...env, ...extraEnv },
    });
  return { root, put, git, hook, env };
}

test("real typed lint blocks a partially staged defect and restores index and worktree", (t) => {
  const f = fixture(t);
  f.put(
    "app/src/witness.ts",
    "export const value: number = 1;\nPromise.resolve(value);\n",
  );
  f.git("add", "app/src/witness.ts");
  const staged = f.git("show", ":app/src/witness.ts");
  const working = `${staged}\n// unstaged preservation witness\n`;
  f.put("app/src/witness.ts", working);
  const result = f.hook();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /no-floating-promises/);
  assert.equal(f.git("show", ":app/src/witness.ts"), staged);
  assert.equal(
    fs.readFileSync(path.join(f.root, "app/src/witness.ts"), "utf8"),
    working,
  );
  assert.equal(f.git("stash", "list"), "");
});

test("real typecheck still blocks a type defect that staged lint accepts", (t) => {
  const f = fixture(t);
  f.put("app/src/witness.ts", 'export const value: number = "wrong";\n');
  f.git("add", "app/src/witness.ts");
  const result = f.hook();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /TS2322/);
  assert.doesNotMatch(result.stdout + result.stderr, /no-floating-promises/);
});

test("real hook fixture keeps local admission under ambient hosted CI", (t) => {
  const f = fixture(t);
  f.put("app/src/witness.ts", "export const value: number = 2;\n");
  f.git("add", "app/src/witness.ts");
  const result = f.hook({
    ERGOMATIC_HOSTED_CI: "1",
    CI: "true",
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_RUN_ID: "1",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKSPACE: f.root,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /cleanup=verified; receipt=/);
});

for (const slowRestore of [false, true])
  test(
    slowRestore
      ? "escalation during real staging restoration retains ownership and recovery evidence"
      : "interrupted real hook restores partially staged content before returning",
    async (t) => {
      const f = fixture(t),
        ready = path.join(f.root, ".git", "task-ready");
      const task = path.join(f.root, "hold.mjs");
      f.put(
        "hold.mjs",
        `import fs from 'node:fs';
fs.appendFileSync(process.argv[2],'// task modification\\n');
const deadline=setTimeout(()=>{process.exitCode=1},5000);
process.on('SIGINT',()=>{clearTimeout(deadline);process.exitCode=130});
fs.writeFileSync(${JSON.stringify(ready)},'ready');`,
      );
      f.put(
        "package.json",
        JSON.stringify({
          private: true,
          type: "module",
          "lint-staged": {
            "app/**/*.ts": `${JSON.stringify(process.execPath)} ${JSON.stringify(task)}`,
          },
        }),
      );
      f.put("app/src/witness.ts", "export const value: number = 2;\n");
      f.git("add", "app/src/witness.ts");
      const staged = f.git("show", ":app/src/witness.ts");
      const working = `${staged}\n// unstaged preservation witness\n`;
      f.put("app/src/witness.ts", working);
      let extraEnv = {};
      if (slowRestore) {
        const realGit = spawnSync("which", ["git"], {
          encoding: "utf8",
        }).stdout.trim();
        assert.ok(path.isAbsolute(realGit));
        const shimDir = path.join(f.root, ".git", "shim");
        fs.mkdirSync(shimDir);
        fs.writeFileSync(
          path.join(shimDir, "git"),
          `#!${process.execPath}
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const args=process.argv.slice(2);
if(args.includes('stash') && args[args.indexOf('stash')+1]==='apply') {
  fs.writeFileSync(${JSON.stringify(path.join(f.root, ".git", "restore-held"))},'held');
  setTimeout(()=>{process.exitCode=1},12000);
} else process.exitCode=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}).status ?? 1;
`,
          { mode: 0o700 },
        );
        extraEnv = { PATH: `${shimDir}${path.delimiter}${f.env.PATH}` };
      }
      // This is the production shell hook itself: its exec leaves a live child
      // handle for the resource owner, not a census PID or the Husky parent shell.
      const child = spawn("sh", [".husky/pre-commit"], {
        cwd: f.root,
        env: {
          ...f.env,
          ...extraEnv,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          output += chunk;
        });
      const done = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      try {
        const deadline = Date.now() + 10000;
        while (!fs.existsSync(ready)) {
          assert.ok(
            child.exitCode === null && child.signalCode === null,
            output,
          );
          assert.ok(Date.now() < deadline, "task readiness deadline");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        child.kill("SIGINT");
        const result = await done;
        assert.notEqual(result.code, 0, output);
        if (slowRestore) {
          assert.ok(
            fs.existsSync(path.join(f.root, ".git", "restore-held")),
            output,
          );
          const receipts = path.join(
            f.root,
            ".git",
            "ergomatic-local-work",
            "receipts",
          );
          const names = fs.readdirSync(receipts);
          assert.equal(names.length, 1);
          const receipt = JSON.parse(
            fs.readFileSync(
              path.join(receipts, names[0], "receipt.json"),
              "utf8",
            ),
          );
          assert.equal(receipt.cleanup, "unresolved", output);
          assert.match(receipt.reason, /staging restoration/);
          assert.ok(
            fs.existsSync(
              path.join(f.root, ".git", "ergomatic-local-work", "owner"),
            ),
          );
          assert.match(f.git("stash", "list"), /lint-staged automatic backup/);
          return;
        }
        assert.equal(f.git("show", ":app/src/witness.ts"), staged, output);
        assert.equal(
          fs.readFileSync(path.join(f.root, "app/src/witness.ts"), "utf8"),
          working,
          output,
        );
        assert.equal(f.git("stash", "list"), "", output);
      } finally {
        await done;
      }
    },
  );
