import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { atomic } from "../test-evidence-record.mjs";
import {
  parseSelection,
  batches,
  unionIdentities,
  requireExactMembership,
} from "./selection.mjs";
import {
  git,
  resolveBase,
  snapshotSource,
  requireSameSource,
  readPushInput,
  mandatoryIdentities,
} from "./selection-git.mjs";

const childScript = fileURLToPath(
  new URL("./selection-child.mjs", import.meta.url),
);
let interrupted = null;
const onInterrupt = () => {
  interrupted ??= "SIGINT";
};
const onTerminate = () => {
  interrupted ??= "SIGTERM";
};

async function native(operation, payload, directory, captureDirectory) {
  if (interrupted)
    throw Object.assign(new Error(`Interrupted: ${interrupted}`), {
      exitCode: 128 + constants.signals[interrupted],
    });
  const input = path.join(directory, "input.json"),
    output = path.join(directory, "output.json");
  fs.writeFileSync(input, JSON.stringify(payload), { flag: "wx", mode: 0o600 });
  const env = { ...process.env };
  delete env.ERGOMATIC_EVIDENCE_DIR;
  if (captureDirectory) env.ERGOMATIC_EVIDENCE_DIR = captureDirectory;
  const child = spawn(
    process.execPath,
    [childScript, operation, input, output],
    {
      cwd: payload.app,
      env,
      stdio: "inherit",
    },
  );
  const outcome = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const code = interrupted
    ? 128 + constants.signals[interrupted]
    : outcome.signal
      ? 128 + constants.signals[outcome.signal]
      : (outcome.code ?? 1);
  if (code)
    throw Object.assign(
      new Error(
        `${operation} child failed: exit=${code}, signal=${outcome.signal ?? interrupted ?? "none"}`,
      ),
      { exitCode: code },
    );
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

export async function runSelection(
  { request, prePush, coverage = false },
  app,
  directory,
) {
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077 ||
    fs.realpathSync(directory) !== directory
  )
    throw new Error("Selection needs a private canonical invocation receipt");
  const recordPath = path.join(directory, "selection.json");
  const record = {
    schema: 1,
    request,
    prePush,
    status: "preparing",
    executed: [],
    batches: [],
  };
  fs.writeFileSync(recordPath, JSON.stringify(record), {
    flag: "wx",
    mode: 0o600,
  });
  const root = path.dirname(app);
  const subdir = (name) => {
    const value = path.join(directory, name);
    fs.mkdirSync(value, { mode: 0o700 });
    return value;
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    const intended = JSON.parse(
      fs.readFileSync(path.join(directory, "receipt.json"), "utf8"),
    ).scope?.selection;
    if (
      !intended ||
      !isDeepStrictEqual(
        { request, prePush, coverage },
        {
          request: intended.request,
          prePush: intended.prePush,
          coverage: intended.coverage ?? false,
        },
      )
    )
      throw new Error(
        "Pipeline no longer matches the owner's requested selection",
      );
    if (prePush) {
      record.push = readPushInput(root, prePush.input);
      if (record.push.kind !== "head") {
        record.status = record.push.kind;
        console.log(`pre-push: ${record.push.kind}; no HEAD-test claim`);
        return;
      }
      if (
        git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
      )
        throw new Error(
          "Pre-push requires a clean checked working tree; commit or preserve outstanding edits first",
        );
      request = parseSelection(
        [
          "--project",
          "unit",
          "--project",
          "client",
          ...(prePush.full
            ? []
            : ["--base", prePush.base ?? "refs/remotes/origin/main"]),
        ],
        prePush.full ? "full" : "related",
      );
    }
    if (request.mode === "related")
      request = { ...request, base: resolveBase(root, request.base) };
    record.request = request;
    record.source = snapshotSource(root);
    atomic(recordPath, record);
    const found = await native(
      "discover",
      { app, request },
      subdir("discovery"),
    );
    record.discoveryClosedAt = new Date().toISOString();
    record.selected =
      prePush && !prePush.full
        ? unionIdentities(found.selected, mandatoryIdentities(app))
        : found.selected;
    // A census identity must also exist in native discovery. A typo cannot be
    // silently ignored or interpreted as a CLI substring.
    requireExactMembership(
      record.selected,
      found.all.filter((item) =>
        record.selected.some(
          (expected) =>
            expected.project === item.project && expected.file === item.file,
        ),
      ),
    );
    requireSameSource(record.source, snapshotSource(root));
    console.log(
      `selection: ${JSON.stringify({ mode: request.mode, projects: request.projects, files: record.selected })}`,
    );
    atomic(recordPath, record);
    if (request.inspect) {
      record.status = "inspection-only";
      return;
    }
    if (!record.selected.length) {
      record.status = "empty-related";
      return;
    }
    // A batch bound is a policy ceiling, not an observed memory guarantee.
    // Direct capture/coverage retain one native report lifetime.
    const groups = prePush ? batches(record.selected, 32) : [record.selected];
    for (const selected of groups) {
      const number = record.batches.length + 1,
        output = subdir(`batch-${number}`);
      const batch = {
        selected,
        startedAt: new Date().toISOString(),
        status: "running",
      };
      record.batches.push(batch);
      atomic(recordPath, record);
      const result = await native(
        "execute",
        {
          app,
          request: {
            ...request,
            projects: [...new Set(selected.map((item) => item.project))].sort(),
          },
          selected,
          coverage,
        },
        output,
        process.env.ERGOMATIC_EVIDENCE_DIR ?? output,
      );
      requireExactMembership(selected, result.executed);
      record.executed.push(...result.executed);
      batch.status = "passed";
      batch.endedAt = new Date().toISOString();
      atomic(recordPath, record);
    }
    requireExactMembership(record.selected, record.executed);
    requireSameSource(record.source, snapshotSource(root));
    record.status = "passed";
  } catch (error) {
    record.status = "failed";
    record.reason = error.message;
    throw error;
  } finally {
    record.endedAt = new Date().toISOString();
    atomic(recordPath, record);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runSelection(
      JSON.parse(process.argv[2]),
      fs.realpathSync(process.cwd()),
      process.env.ERGOMATIC_SELECTION_DIR,
    );
  } catch (error) {
    console.error(
      `selection: ${error.message}. No fallback. For full pre-push verification use pnpm push:full <git push arguments>; for direct tests use pnpm test:full --project <name>.`,
    );
    process.exitCode = error.exitCode ?? 2;
  }
}
