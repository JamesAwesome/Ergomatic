import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { constants, platform, release } from "node:os";

const now = () => new Date().toISOString();
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
function command(bin, args) {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    timeout: 2000,
    maxBuffer: 1024 * 1024,
  });
  return r.status === 0
    ? { value: r.stdout.trim() }
    : {
        unavailable: r.error?.message ?? r.stderr?.trim() ?? `exit ${r.status}`,
      };
}
function atomic(path, data) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}
function reportDigest(path) {
  if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile())
    throw new Error("report is not a regular invocation file");
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
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
  const diff = command("git", ["diff", "HEAD", "--binary"]);
  const receipt = {
    schema: 1,
    id,
    root,
    directory,
    runner,
    terminal: false,
    start: now(),
    end: null,
    argv: args,
    cwd: process.cwd(),
    sha: command("git", ["rev-parse", "HEAD"]),
    trackedDiff:
      diff.value === undefined
        ? diff
        : {
            dirty: diff.value.length > 0,
            sha256: createHash("sha256").update(diff.value).digest("hex"),
          },
    versions: { node: process.version },
    os: { platform: platform(), release: release() },
    ci: Object.fromEntries(
      [
        "CI",
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_JOB",
        "GITHUB_WORKFLOW",
        "RUNNER_NAME",
      ].map((k) => [k, process.env[k] ?? null]),
    ),
    configuration: Object.fromEntries(
      [
        "ERGOMATIC_TEST_WORKERS",
        "ERGOMATIC_E2E_WORKERS",
        "ERGOMATIC_EVIDENCE_TRACE",
        "E2E_BASE_URL",
        "COMPOSE_PROJECT_NAME",
        "ERGO_STACK",
      ].map((k) => [k, process.env[k] ?? null]),
    ),
    exitCode: null,
    signal: null,
    diagnosticErrors: [],
  };
  for (const pkg of ["vitest", "@playwright/test"]) {
    try {
      receipt.versions[pkg] = json(
        resolve("node_modules", pkg, "package.json"),
      ).version;
    } catch {
      receipt.versions[pkg] = null;
    }
  }
  atomic(receiptPath, receipt);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `directory=${directory}\nid=${id}\n`,
    );
  console.log(`Evidence: ${directory}`);
  const owned = new Map();
  let child,
    timer,
    allocation = false,
    tail = "";
  const fds = ["stdout", "stderr"].map((name) =>
    openSync(join(directory, `${name}.log`), "wx"),
  );
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
    for (const [index, stream] of [child.stdout, child.stderr].entries()) {
      stream.pipe(index === 0 ? process.stdout : process.stderr, {
        end: false,
      });
      stream.on("data", (chunk) => {
        try {
          writeSync(fds[index], chunk);
        } catch (error) {
          receipt.diagnosticErrors.push(error.message);
        }
        if (index === 1) {
          const text = tail + chunk.toString();
          allocation ||= text.includes("Allocation failed");
          tail = text.slice(-1024);
        }
      });
    }
    saveSample();
    timer = setInterval(saveSample, 1000);
    const closed = new Promise((resolveClose) =>
      child.once("close", resolveClose),
    );
    const outcome = await new Promise((resolveOutcome) => {
      child.once("error", (error) => {
        receipt.launchError = error.message;
        resolveOutcome({ code: 1, signal: null });
      });
      child.once("exit", (code, signal) => resolveOutcome({ code, signal }));
    });
    receipt.exitCode = outcome.code;
    receipt.signal = outcome.signal;
    // Only drain after leader exit. Descendants may retain its pipes forever;
    // two seconds allows ordinary buffered output without imposing a suite cap.
    let drainTimer;
    await Promise.race([
      closed,
      new Promise((resolveDrain) => {
        drainTimer = setTimeout(() => {
          receipt.diagnosticErrors.push(
            "stdio drain exceeded 2000 ms after child exit; output may be incomplete",
          );
          child.stdout.destroy();
          child.stderr.destroy();
          resolveDrain();
        }, 2000);
      }),
    ]);
    clearTimeout(drainTimer);
  } finally {
    clearInterval(timer);
    saveSample();
    for (const fd of fds) closeSync(fd);
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
  receipt.end = now();
  receipt.terminal = true;
  receipt.resourceAbort = Boolean(
    receipt.signal ||
    receipt.exitCode >= 128 ||
    (receipt.exitCode !== 0 && allocation),
  );
  receipt.allocationFailure = allocation;
  const current = processes();
  const survivors =
    current.value?.filter((p) => owned.get(p.pid)?.started === p.started) ??
    null;
  receipt.cleanup = {
    status: survivors?.length ? "incomplete" : "unverified",
    reason:
      "Polling cannot exclude descendants detached and reparented between samples; local browser probes remain deferred",
    observed: [...owned.values()],
    survivors,
  };
  try {
    receipt.reportSha256 = reportDigest(join(directory, "report.json"));
  } catch (error) {
    receipt.reportError = error.message;
  }
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
    if (receipt.cleanup?.status === "incomplete")
      issues.push("owned descendants survived; defer another local probe");
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
            if (initial.status !== t.expectedStatus) {
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
  return `Test evidence ${r?.id ?? "missing"}\n\ncommand: exit ${r?.exitCode ?? "unknown"}, signal ${r?.signal ?? "none"}\nevidence: ${issues.length ? "incomplete" : "complete"}\ninitial executions: ${c.initial}\nfirst-attempt failures: ${c.firstFailures}\nretry recoveries: ${c.recoveries}\nexhausted executions: ${c.exhausted}\nsuite errors: ${c.suiteErrors} (native JSON; global diagnostics also in stderr)\ntermination/resource events: ${c.resourceAborts}\nexecution incidence: ${c.firstFailures}/${c.initial}\njob incidence: ${c.firstFailures ? 1 : 0}/${c.initial ? 1 : 0} (this invocation's selected population)\n\n[receipt](receipt.json) · [native report](report.json) · [stdout](stdout.log) · [stderr](stderr.log) · [resources](resources.jsonl)${r?.runner === "playwright" ? " · [HTML report](html/index.html)" : ""}\n\n${issues.map((s) => `Missing evidence: ${s}`).join("\n")}\n`;
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
