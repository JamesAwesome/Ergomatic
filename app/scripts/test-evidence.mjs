import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { constants, platform } from "node:os";
import {
  atomic,
  bindNativeReport,
  captureLogs,
  command,
  evidenceReceipt,
  reportDigest,
} from "./test-evidence-record.mjs";

const now = () => new Date().toISOString();
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
// /var is a platform alias on macOS; canonicalize existing ancestors, but
// reject a user-supplied symlink component rather than following it outward.
function safeRoot(input) {
  if (!input?.trim()) throw new Error("empty evidence root");
  const absolute = resolve(input);
  let cursor = absolute;
  while (cursor !== dirname(cursor)) {
    if (
      existsSync(cursor) &&
      lstatSync(cursor).isSymbolicLink() &&
      cursor !== "/var" &&
      cursor !== "/tmp"
    )
      throw new Error("symlink evidence path");
    cursor = dirname(cursor);
  }
  mkdirSync(absolute, { recursive: true });
  return realpathSync(absolute);
}
function processes() {
  const result = command("ps", ["-axo", "pid=,ppid=,pgid=,rss=,lstart=,comm="]);
  if (!result.value) return result;
  return {
    value: result.value.split("\n").flatMap((line) => {
      const m = line
        .trim()
        .match(
          /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/,
        );
      return m
        ? [
            {
              pid: +m[1],
              ppid: +m[2],
              pgid: +m[3],
              rssKiB: +m[4],
              started: m[5],
              executable: m[6],
            },
          ]
        : [];
    }),
  };
}
function readDiagnostic(path) {
  try {
    return { value: readFileSync(path, "utf8") };
  } catch (error) {
    return { unavailable: error.message };
  }
}
function resources(childPid, owned) {
  const ps = processes();
  const rows = ps.value ?? [];
  const live = new Set(
    rows
      .filter(
        (p) => p.pid === childPid || owned.get(p.pid)?.started === p.started,
      )
      .map((p) => p.pid),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const p of rows)
      if (live.has(p.ppid) && !live.has(p.pid)) {
        live.add(p.pid);
        changed = true;
      }
  }
  const attributed = rows.filter((p) => live.has(p.pid));
  for (const p of attributed) owned.set(p.pid, p);
  const sample = {
    at: now(),
    processes: ps.unavailable ? ps : attributed,
    containers: {
      unavailable: "No attributable container ownership supplied; not sampled",
    },
    dockerVM: { unavailable: "Not attributable; not sampled" },
  };
  if (platform() === "darwin") {
    sample.pressure = command("sysctl", [
      "-n",
      "kern.memorystatus_vm_pressure_level",
    ]);
    sample.pressure.state =
      { 1: "normal", 2: "warning", 4: "critical" }[sample.pressure.value] ??
      "unknown";
    sample.swap = command("sysctl", ["-n", "vm.swapusage"]);
  } else if (platform() === "linux") {
    sample.meminfo = readDiagnostic("/proc/meminfo");
    sample.psi = readDiagnostic("/proc/pressure/memory");
    const group = readDiagnostic("/proc/self/cgroup");
    const relative = group.value?.match(/^0::(.*)$/m)?.[1];
    sample.cgroup =
      relative === undefined
        ? { unavailable: "No cgroup v2 membership" }
        : {
            path: relative,
            events: readDiagnostic(
              join("/sys/fs/cgroup", relative, "memory.events"),
            ),
          };
  } else
    sample.pressure = {
      unavailable: `Unsupported platform: ${platform()}`,
      state: "unknown",
    };
  return sample;
}

async function run(args) {
  const runner = args.shift();
  if (!["vitest", "playwright"].includes(runner))
    throw new Error("runner must be vitest or playwright");
  let root = resolve(".test-evidence"),
    id = randomUUID();
  while (args[0] !== "--") {
    const flag = args.shift();
    if (flag === "--root") root = args.shift();
    else if (flag === "--id") id = args.shift();
    else
      throw new Error(
        "usage: run <vitest|playwright> [--root path] [--id UUID] -- command args",
      );
  }
  args.shift();
  if (
    !args.length ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
  )
    throw new Error("command and UUID required");
  root = safeRoot(root);
  const directory = join(root, id);
  mkdirSync(directory); // exclusive: never adopt an existing invocation
  const receiptPath = join(directory, "receipt.json");
  const receipt = evidenceReceipt({ id, root, directory, runner, argv: args });
  atomic(receiptPath, receipt);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `directory=${directory}\nid=${id}\n`,
    );
  console.log(`Evidence: ${directory}`);
  const owned = new Map();
  let child, timer;
  const logs = captureLogs(directory, receipt.diagnosticErrors);
  const saveSample = () => {
    try {
      appendFileSync(
        join(directory, "resources.jsonl"),
        JSON.stringify(resources(child?.pid, owned)) + "\n",
      );
    } catch (error) {
      receipt.diagnosticErrors.push(error.message);
    }
  };
  saveSample();
  const forward = (signal) => {
    receipt.interrupted = signal;
    try {
      if (child?.pid) process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") receipt.diagnosticErrors.push(error.message);
    }
  };
  const onInt = () => forward("SIGINT"),
    onTerm = () => forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  try {
    child = spawn(args[0], args.slice(1), {
      detached: true,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, ERGOMATIC_EVIDENCE_DIR: directory },
    });
    receipt.pid = child.pid ?? null;
    receipt.pgid = child.pid ?? null;
    try {
      atomic(receiptPath, receipt);
    } catch (error) {
      receipt.diagnosticErrors.push(error.message);
    }
    const drain = logs.attach(child);
    saveSample();
    timer = setInterval(saveSample, 1000);
    const outcome = await new Promise((resolveOutcome) => {
      child.once("error", (error) => {
        receipt.launchError = error.message;
        resolveOutcome({ code: 1, signal: null });
      });
      child.once("exit", (code, signal) => resolveOutcome({ code, signal }));
    });
    receipt.exitCode = outcome.code;
    receipt.signal = outcome.signal;
    await drain();
  } finally {
    clearInterval(timer);
    saveSample();
    logs.close();
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
  receipt.end = now();
  receipt.terminal = true;
  receipt.resourceAbort = Boolean(
    receipt.signal ||
    receipt.exitCode >= 128 ||
    (receipt.exitCode !== 0 && logs.allocationFailure),
  );
  receipt.allocationFailure = logs.allocationFailure;
  const current = processes();
  const survivors =
    current.value?.filter((p) => owned.get(p.pid)?.started === p.started) ??
    null;
  receipt.cleanup = {
    status: survivors?.length ? "incomplete" : "unverified",
    reason:
      "Polling cannot exclude descendants detached and reparented between samples; cleanup requires separate ownership checks",
    observed: [...owned.values()],
    survivors,
  };
  bindNativeReport(receipt);
  try {
    atomic(receiptPath, receipt);
  } catch (error) {
    console.error(`Evidence finalization failed: ${error.message}`);
  }
  return receipt.signal
    ? 128 + (constants.signals[receipt.signal] ?? 1)
    : (receipt.exitCode ?? 1);
}

function inspect(directory) {
  const issues = [],
    failures = [],
    counts = {
      initial: 0,
      firstFailures: 0,
      interruptedInitial: 0,
      interruptedRetries: 0,
      recoveries: 0,
      exhausted: 0,
      suiteErrors: 0,
      resourceAborts: 0,
    };
  let receipt, report;
  try {
    if (!directory) throw new Error("missing invocation path");
    directory = resolve(directory);
    receipt = json(join(directory, "receipt.json"));
    if (
      realpathSync(directory) !== directory ||
      receipt.directory !== directory ||
      receipt.root !== dirname(directory) ||
      receipt.id !== basename(directory)
    )
      throw new Error("receipt identity/path mismatch");
    if (
      !receipt.terminal ||
      !receipt.end ||
      (receipt.exitCode === null && !receipt.signal)
    )
      throw new Error("nonterminal receipt");
    counts.resourceAborts = receipt.resourceAbort ? 1 : 0;
    if (receipt.diagnosticErrors.length)
      issues.push(...receipt.diagnosticErrors);
    if (
      receipt.cleanup?.status === "incomplete" ||
      receipt.cleanup === "unresolved"
    )
      issues.push("owned descendants survived; defer another local probe");
    if (receipt.worktree && receipt.sourceIdentity?.status !== "recorded")
      issues.push("local source provenance unavailable");
    const artifacts = ["stdout.log", "stderr.log", "resources.jsonl"];
    if (receipt.runner === "playwright") artifacts.push("html/index.html");
    for (const artifact of artifacts) {
      const path = join(directory, artifact);
      if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile())
        throw new Error(`missing regular ${artifact}`);
      if (artifact === "resources.jsonl" && statSync(path).size === 0)
        throw new Error("empty resources");
    }
    const path = join(directory, "report.json");
    if (!receipt.reportSha256 || reportDigest(path) !== receipt.reportSha256)
      throw new Error("missing or replaced report binding");
    if (statSync(path).mtimeMs < Date.parse(receipt.start))
      throw new Error("stale report");
    report = json(path);
    if (receipt.runner === "playwright") {
      if (!Array.isArray(report.suites) || !Array.isArray(report.errors))
        throw new Error("invalid Playwright report");
      counts.suiteErrors = report.errors.length;
      const seen = new Set();
      const visit = (suite) => {
        for (const spec of suite.specs ?? [])
          for (const t of spec.tests) {
            const key = JSON.stringify([
              spec.id,
              spec.file,
              spec.title,
              t.projectId,
            ]);
            if (seen.has(key))
              throw new Error("duplicate native execution identity");
            seen.add(key);
            const initial = t.results.find((r) => r.retry === 0);
            if (!initial || initial.status === "skipped") continue;
            counts.initial++;
            // Native overall "skipped" can hide a failed initial plus an
            // interrupted retry. Classify the attempts, not that aggregate.
            counts.interruptedRetries += t.results.filter(
              (r) => r.retry > 0 && r.status === "interrupted",
            ).length;
            if (initial.status === "interrupted") counts.interruptedInitial++;
            else if (initial.status !== t.expectedStatus) {
              counts.firstFailures++;
              failures.push(
                `${spec.file}: ${spec.title} [${t.projectName}, id ${spec.id}, repeat index unknown, ${t.status}]`,
              );
            }
            if (t.status === "flaky") counts.recoveries++;
            if (t.status === "unexpected") counts.exhausted++;
          }
        for (const nested of suite.suites ?? []) visit(nested);
      };
      for (const suite of report.suites) visit(suite);
    } else if (receipt.runner === "vitest") {
      if (!Array.isArray(report.testResults))
        throw new Error("invalid Vitest report");
      for (const file of report.testResults) {
        if (file.message) counts.suiteErrors++;
        for (const assertion of file.assertionResults) {
          if (
            ["pending", "skipped", "todo", "disabled"].includes(
              assertion.status,
            )
          )
            continue;
          counts.initial++;
          if (assertion.status === "failed") {
            counts.firstFailures++;
            counts.exhausted++;
            failures.push(`${file.name}: ${assertion.fullName}`);
          }
        }
      }
    } else throw new Error("unknown runner");
  } catch (error) {
    issues.push(error.message);
  }
  return { receipt, report, counts, issues, failures };
}
function summary(result) {
  const { receipt: r, counts: c, issues } = result;
  // Local admission owns cleanup; hosted observer receipts retain their
  // existing observational cleanup shape and summary contract.
  const cleanup =
    typeof r?.cleanup === "string" ? `\ncleanup: ${r.cleanup}` : "";
  return `Test evidence ${r?.id ?? "missing"}\n\ncommand: exit ${r?.exitCode ?? "unknown"}, signal ${r?.signal ?? "none"}${cleanup}\nevidence: ${issues.length ? "incomplete" : "complete"}\ninitial executions: ${c.initial}\nfirst-attempt failures: ${c.firstFailures}\ninterrupted initial attempts: ${c.interruptedInitial}\ninterrupted retry attempts: ${c.interruptedRetries}\nretry recoveries: ${c.recoveries}\nexhausted executions: ${c.exhausted}\nsuite errors: ${c.suiteErrors} (native JSON; global diagnostics also in stderr)\ntermination/resource events: ${c.resourceAborts}\nexecution incidence: ${c.firstFailures}/${c.initial}\njob incidence: ${c.firstFailures ? 1 : 0}/${c.initial ? 1 : 0} (this invocation's selected population)\n\n[receipt](receipt.json) · [native report](report.json) · [stdout](stdout.log) · [stderr](stderr.log) · [resources](resources.jsonl)${r?.runner === "playwright" ? " · [HTML report](html/index.html)" : ""}\n\n${issues.map((s) => `Missing evidence: ${s}`).join("\n")}\n`;
}
try {
  const [action, ...args] = process.argv.slice(2);
  if (action === "run") process.exitCode = await run(args);
  else if (action === "summary" || action === "check") {
    const result = inspect(args[0]);
    if (
      action === "check" &&
      process.env.GITHUB_ACTIONS === "true" &&
      !process.env.EVIDENCE_UPLOAD_URL
    )
      result.issues.push("missing uploaded artifact URL");
    const rendered =
      summary(result) +
      result.failures
        .map((title) => `- ${title.replace(/[\r\n]/g, " ")}`)
        .join("\n") +
      "\n";
    process.stdout.write(rendered);
    if (action === "summary" && result.receipt?.directory === resolve(args[0]))
      writeFileSync(join(args[0], "summary.md"), rendered);
    if (process.env.GITHUB_STEP_SUMMARY) {
      if (action === "summary")
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          rendered.replace(
            /\[([^\]]+)\]\([^)]+\)/g,
            "$1 (in evidence archive)",
          ),
        );
      else
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\nEvidence publication: ${process.env.EVIDENCE_UPLOAD_URL ? `[download archive](${process.env.EVIDENCE_UPLOAD_URL})` : "missing"}; check: ${result.issues.length ? "incomplete" : "complete"}.\n`,
        );
    }
    process.exitCode = action === "check" && result.issues.length ? 1 : 0;
  } else throw new Error("expected run, summary or check");
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
