import { writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
const mode = process.argv[2];
const file = join(process.env.ERGOMATIC_EVIDENCE_DIR, "report.json");
if (mode === "signal-before-reporters") process.kill(process.pid, "SIGTERM");
if (mode === "allocation-before-reporters") {
  writeFileSync(2, "FATAL ERROR: Allocation failed\n");
  process.exit(1);
}
mkdirSync(join(process.env.ERGOMATIC_EVIDENCE_DIR, "html"));
writeFileSync(
  join(process.env.ERGOMATIC_EVIDENCE_DIR, "html/index.html"),
  "Fixture report",
);
console.log("fixture started");
if (mode === "signal") process.kill(process.pid, "SIGTERM");
if (mode === "inherited-pipes") {
  const descendant = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { detached: true, stdio: "inherit" },
  );
  descendant.unref();
  writeFileSync(
    join(process.env.ERGOMATIC_EVIDENCE_DIR, "descendant.json"),
    JSON.stringify({ pid: descendant.pid }),
  );
  setTimeout(() => process.exit(7), 1300);
}
if (mode === "write-fault") {
  setTimeout(() => {
    writeFileSync(
      join(process.env.ERGOMATIC_EVIDENCE_DIR, "finished"),
      "child completed",
    );
    process.exit(7);
  }, 100);
}
if (mode === "tree") {
  const ordinary = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
  });
  const detached = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    detached: true,
    stdio: "ignore",
  });
  writeFileSync(
    join(process.env.ERGOMATIC_EVIDENCE_DIR, "tree.json"),
    JSON.stringify({ ordinary: ordinary.pid, detached: detached.pid }),
  );
  setInterval(() => {}, 1000);
}
const result = (status, retry) => ({
  status,
  retry,
  errors: status === "failed" ? [{ message: "assertion" }] : [],
});
const test = (results, status = "expected") => ({
  projectName: "chromium",
  projectId: "chromium",
  expectedStatus: "passed",
  status,
  results,
});
let report = {
  suites: [
    {
      title: "suite",
      specs: [
        {
          id: "case",
          title: "case",
          file: "case.spec.ts",
          tests: [test([result("passed", 0)])],
        },
      ],
    },
  ],
  errors: [],
};
if (mode === "fail")
  report.suites[0].specs[0].tests = [test([result("failed", 0)], "unexpected")];
if (mode === "recovery" || mode === "repeats")
  report.suites[0].specs[0].tests = [
    test([result("failed", 0), result("passed", 1)], "flaky"),
  ];
if (mode === "repeats") {
  report.suites[0].specs[0].id = "case-repeat-a";
  report.suites[0].specs.push({
    id: "case-repeat-b",
    title: "case",
    file: "case.spec.ts",
    tests: [test([result("passed", 0)])],
  });
}
if (mode === "setup")
  report = { suites: [], errors: [{ message: "global setup failed" }] };
if (mode === "empty") report = {};
if (mode === "expected-failure") {
  report.suites[0].specs[0].tests[0].expectedStatus = "failed";
  report.suites[0].specs[0].tests[0].results[0].status = "failed";
}
if (mode === "vitest")
  report = {
    success: true,
    testResults: [
      {
        name: "case.test.ts",
        status: "failed",
        message: "afterAll failed",
        assertionResults: [
          { fullName: "passes", status: "passed", failureMessages: [] },
        ],
      },
    ],
  };
if (mode === "allocation") console.error("FATAL ERROR: Allocation failed");
if (mode === "allocation-long")
  process.stderr.write("Allocation failed" + "x".repeat(4096));
if (mode === "allocation-split") {
  process.stderr.write("Allocation fa");
  setTimeout(() => process.stderr.write("iled" + "x".repeat(4096)), 30);
}
if (mode === "coverage") console.error("Coverage threshold failed");
if (mode === "unwritable") mkdirSync(file);
else if (mode !== "missing")
  writeFileSync(file, mode === "unreadable" ? "{" : JSON.stringify(report));
if (mode === "stale") utimesSync(file, new Date(0), new Date(0));
process.exitCode = [
  "fail",
  "setup",
  "coverage",
  "allocation",
  "allocation-long",
  "allocation-split",
  "vitest",
].includes(mode)
  ? 1
  : 0;
