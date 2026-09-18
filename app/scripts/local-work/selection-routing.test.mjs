import assert from "node:assert/strict";
import { test } from "node:test";
import { workloadPhases } from "./workloads.mjs";

test("local public tests reach the exact pipeline and require file targets", () => {
  const options = { app: "/checkout/app", name: "test", env: {} };
  assert.throws(() =>
    workloadPhases({ ...options, args: ["--project", "unit"] }),
  );
  const [phase] = workloadPhases({
    ...options,
    args: ["--project", "unit", "space ü.test.ts", "-t", "one"],
  });
  assert.equal(phase.selection, true);
  assert.deepEqual(JSON.parse(phase.args[2]).request.files, [
    "space ü.test.ts",
  ]);
  assert.equal(JSON.parse(phase.args[2]).request.testNamePattern, "one");
  assert.equal(phase.outcome, "test-run");
});

test("full and related scripts keep explicit scope; hosted full behavior stays unchanged", () => {
  const options = { app: "/checkout/app", env: {} };
  assert.throws(() => workloadPhases({ ...options, name: "test-full" }));
  const [full] = workloadPhases({
    ...options,
    name: "test-full",
    args: ["--project", "unit"],
  });
  assert.equal(JSON.parse(full.args[2]).request.mode, "full");
  const [related] = workloadPhases({
    ...options,
    name: "test-related",
    args: ["--project", "client", "--base", "HEAD"],
  });
  assert.equal(JSON.parse(related.args[2]).request.base, "HEAD");
  const [hosted] = workloadPhases({ ...options, name: "test", hosted: true });
  assert.deepEqual(hosted.args, ["scripts/test-run.sh"]);
});

test("pre-push receives real input and never exposes an inspection switch", () => {
  const push = { input: "actual refs", full: false };
  const [phase] = workloadPhases({
    app: "/checkout/app",
    name: "pre-push",
    env: {},
    push,
  });
  assert.equal(phase.selection, true);
  assert.equal(JSON.parse(phase.args[2]).prePush.input, "actual refs");
  assert.throws(() =>
    workloadPhases({
      app: "/checkout/app",
      name: "pre-push",
      env: {},
      push,
      args: ["--list"],
    }),
  );
});
