import assert from "node:assert/strict";
import test from "node:test";
import { parseProcesses, readHost, hostedMode } from "./host.mjs";

const census =
  " 123 1 123 501 4096 Tue Sep 15 10:00:00 2026 /path with spaces/node\n";

test("process observations preserve generation, group, owner and KiB units", () => {
  assert.deepEqual(parseProcesses(census), [
    {
      pid: 123,
      ppid: 1,
      pgid: 123,
      uid: 501,
      rssKiB: 4096,
      started: "Tue Sep 15 10:00:00 2026",
      executable: "/path with spaces/node",
    },
  ]);
});

test("partial or empty process output cannot certify that children are gone", () => {
  for (const output of ["", "garbage", census + "truncated row\n"]) {
    assert.throws(() => parseProcesses(output), /process census/);
  }
});

test("macOS dispatch pressure flags are not the internal kernel enum", () => {
  for (const [input, expected] of [
    ["1", "normal"],
    ["2", "warning"],
    ["4", "critical"],
    ["0", "unknown"],
    ["3", "unknown"],
    ["", "unknown"],
    ["1\n2", "unknown"],
    ["toString", "unknown"],
  ]) {
    const state = readHost({
      platform: "darwin",
      command: (_bin, args) => ({
        value: args.includes("kern.memorystatus_vm_pressure_level")
          ? input
          : args.includes("vm.swapusage")
            ? "used = 20.0M"
            : census,
      }),
    });
    assert.equal(state.pressure.state, expected);
    assert.equal(state.processes.value[0].rssKiB, 4096);
  }
});

test("failed diagnostics and unsupported local platforms stay unknown", () => {
  const failed = readHost({
    platform: "darwin",
    command: () => ({ unavailable: "permission denied" }),
  });
  assert.equal(failed.pressure.state, "unknown");
  assert.equal(failed.processes.unavailable, "permission denied");
  const unsupported = readHost({
    platform: "linux",
    command: () => ({ value: census }),
  });
  assert.equal(unsupported.pressure.state, "unknown");
  assert.match(unsupported.pressure.unavailable, /linux/);
});

test("CI flags alone cannot disable local admission", () => {
  for (const CI of [undefined, "", "0", "false", "1", "true"]) {
    assert.equal(hostedMode({ CI }), false);
  }
  assert.equal(hostedMode({ ERGOMATIC_HOSTED_CI: "0" }), false);
  assert.throws(() => hostedMode({ ERGOMATIC_HOSTED_CI: "yes" }), /hosted/);
  assert.throws(
    () => hostedMode({ ERGOMATIC_HOSTED_CI: "1", CI: "true" }),
    /hosted/,
  );
});

test("explicit hosted mode requires the configured GitHub runner context", () => {
  const context = {
    ERGOMATIC_HOSTED_CI: "1",
    CI: "true",
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKSPACE: "/home/runner/work/ergomatic/ergomatic",
  };
  assert.equal(hostedMode(context), true);
  for (const field of [
    "CI",
    "GITHUB_ACTIONS",
    "RUNNER_ENVIRONMENT",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_WORKSPACE",
  ]) {
    assert.throws(() => hostedMode({ ...context, [field]: "" }), /hosted/);
  }
  assert.throws(
    () => hostedMode({ ...context, RUNNER_ENVIRONMENT: "self-hosted" }),
    /hosted/,
  );
});
