import { spawn } from "node:child_process";
import { lstatSync, mkdirSync } from "node:fs";
import { constants } from "node:os";
import { join } from "node:path";
import { acquireOwner } from "./owner.mjs";
import { readHost } from "./host.mjs";
import { outcomeChannel } from "./outcome.mjs";
import { snapshotSource, requireSameSource } from "./selection-git.mjs";
import {
  atomic,
  bindNativeReport,
  captureLogs,
  evidenceReceipt,
  recordResources,
} from "../test-evidence-record.mjs";

// No environment seam: production always supplies real observations. Tests
// exercise this same owner/child path with controlled observation functions.
export async function runWorkload({
  root,
  metadata,
  phases,
  invocation = {},
  observe = readHost,
  sampleMs = 1000,
  interruptMs = 5000,
  terminateMs = 5000,
}) {
  const owner = acquireOwner(root, metadata);
  const receipts = join(root, "receipts");
  try {
    mkdirSync(receipts, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const receiptStat = lstatSync(receipts);
  if (
    !receiptStat.isDirectory() ||
    receiptStat.uid !== process.getuid() ||
    (receiptStat.mode & 0o777) !== 0o700
  )
    throw new Error(
      "Unsafe receipt directory; ownership retained for inspection",
    );
  const directory = join(receipts, metadata.id);
  mkdirSync(directory, { mode: 0o700 });
  const path = join(directory, "receipt.json");
  const receipt = {
    ...evidenceReceipt({
      id: metadata.id,
      root: receipts,
      directory,
      argv: invocation.argv ?? null,
      cwd: invocation.cwd ?? metadata.worktree,
      source: metadata.worktree,
      env: invocation.env ?? process.env,
    }),
    scope: invocation.scope ?? {
      unavailable:
        "No public invocation supplied; exact commands recorded per phase",
    },
    worktree: metadata.worktree,
    phases: [],
    exitCode: null,
    signal: null,
    cleanup: "unresolved",
    classification: null,
  };
  atomic(path, receipt);
  const logs = captureLogs(directory, receipt.diagnosticErrors);
  let interrupted = null;
  let cancelActive = null;
  const onInterrupt = () => {
    interrupted ??= "SIGINT";
    cancelActive?.("SIGINT");
  };
  const onTerminate = () => {
    interrupted ??= "SIGTERM";
    cancelActive?.("SIGTERM");
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  let mayRelease = true;
  let channel = null;
  const sample = (phase, childPid, observed) => {
    let host;
    try {
      host = observe({ phase, childPid });
    } catch (error) {
      host = {
        pressure: { state: "unknown", unavailable: error.message },
        processes: { unavailable: error.message },
      };
    }
    const rows = host.processes?.value;
    if (rows && childPid) {
      const owned = new Set(
        rows
          .filter(
            (p) =>
              p.pid === childPid ||
              p.pgid === childPid ||
              observed.get(p.pid)?.started === p.started,
          )
          .map((p) => p.pid),
      );
      for (let changed = true; changed;) {
        changed = false;
        for (const p of rows)
          if (owned.has(p.ppid) && !owned.has(p.pid)) {
            owned.add(p.pid);
            changed = true;
          }
      }
      for (const p of rows) if (owned.has(p.pid)) observed.set(p.pid, p);
    }
    if (phase === "running" && childPid) {
      owner.update({
        child: {
          pid: childPid,
          start: observed.get(childPid)?.started ?? null,
        },
        observed: [...observed.values()],
      });
    }
    const attributed =
      rows?.filter((p) => observed.get(p.pid)?.started === p.started) ?? [];
    recordResources(directory, {
      at: new Date().toISOString(),
      phase,
      pressure: host.pressure,
      swap: host.swap,
      wrapperRssBytes: process.memoryUsage().rss,
      observed: rows
        ? attributed
        : { unavailable: host.processes?.unavailable ?? "missing census" },
      observedTreeRssKiB: rows
        ? attributed.reduce((sum, p) => sum + p.rssKiB, 0)
        : null,
    });
    return host;
  };
  try {
    receipt.exitCode = 0;
    receipt.classification = "passed";
    let selected = [];
    const admission = sample("preflight", null, new Map());
    if (
      interrupted ||
      admission.pressure?.state !== "normal" ||
      !admission.processes?.value
    ) {
      receipt.exitCode = interrupted
        ? 128 + constants.signals[interrupted]
        : 75;
      receipt.classification = "resource-refused";
      receipt.reason = interrupted ?? admission.pressure?.state ?? "unknown";
    } else {
      try {
        selected = typeof phases === "function" ? await phases() : phases;
        if (!Array.isArray(selected) || selected.length === 0)
          throw new Error("Preparation must select a nonempty phase array");
        if (selected.some((phase) => phase.capture)) {
          if (selected.length !== 1 || selected[0].capture !== "vitest")
            throw new Error(
              "Native capture requires one supported Vitest phase",
            );
          receipt.runner = "vitest";
        }
      } catch (error) {
        selected = [];
        receipt.exitCode = 2;
        receipt.classification = "preparation-failed";
        receipt.reason = error.message;
      }
    }
    for (const phase of selected) {
      const observed = new Map();
      const preflight = sample("preflight", null, observed);
      if (
        interrupted ||
        preflight.pressure?.state !== "normal" ||
        !preflight.processes?.value
      ) {
        receipt.exitCode = interrupted
          ? 128 + constants.signals[interrupted]
          : 75;
        receipt.classification = "resource-refused";
        receipt.reason = interrupted ?? preflight.pressure?.state ?? "unknown";
        break;
      }
      const entry = {
        command: phase.command,
        args: phase.args,
        argv: [phase.command, ...phase.args],
        workers: phase.workers ?? {
          applicability: "not-applicable",
          max: null,
          actual: null,
          reason: "This phase does not declare a worker pool",
        },
        cwd: phase.cwd,
        start: new Date().toISOString(),
        pid: null,
        exitCode: null,
        signal: null,
      };
      receipt.phases.push(entry);
      if (phase.verifySourceOnFailure)
        entry.sourceBefore = snapshotSource(phase.cwd);
      owner.update({
        phase: "launching",
        phaseIndex: receipt.phases.length - 1,
        child: null,
        observed: [],
      });
      atomic(path, receipt);
      channel =
        phase.outcome === "test-run"
          ? outcomeChannel(
              join(directory, `phase-${receipt.phases.length}.outcome.json`),
            )
          : null;
      mayRelease = false;
      const childEnv = { ...(phase.env ?? process.env) };
      delete childEnv.ERGOMATIC_TEST_OUTCOME;
      delete childEnv.ERGOMATIC_EVIDENCE_DIR;
      delete childEnv.ERGOMATIC_SELECTION_DIR;
      delete childEnv.ERGOMATIC_ARTIFACT_DIR;
      if (phase.selection) childEnv.ERGOMATIC_SELECTION_DIR = directory;
      if (phase.capture) childEnv.ERGOMATIC_EVIDENCE_DIR = directory;
      if (phase.artifacts) childEnv.ERGOMATIC_ARTIFACT_DIR = directory;
      if (channel) childEnv.ERGOMATIC_TEST_OUTCOME = "1";
      const child = spawn(phase.command, phase.args, {
        cwd: phase.cwd,
        env: childEnv,
        detached: true,
        stdio: channel
          ? ["inherit", "pipe", "pipe", channel.fd]
          : ["inherit", "pipe", "pipe"],
      });
      const drain = logs.attach(child);
      entry.pid = child.pid ?? null;
      let reason = null,
        unresolved = false;
      const timers = [];
      let finish;
      const completion = new Promise((resolve) => {
        finish = resolve;
      });
      const signalLiveChildGroup = (signal) => {
        // The signal is tied to the current, unreaped child handle, never
        // an old PID read from a census or a recovery receipt.
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          try {
            process.kill(-child.pid, signal);
          } catch (error) {
            if (error.code !== "ESRCH") entry.signalError = error.message;
          }
        }
      };
      cancelActive = (why) => {
        if (reason) return;
        reason = why;
        signalLiveChildGroup("SIGINT");
        timers.push(
          setTimeout(() => signalLiveChildGroup("SIGTERM"), interruptMs),
        );
        timers.push(
          setTimeout(() => {
            unresolved = true;
            child.unref();
            finish({ code: 75, signal: null });
          }, interruptMs + terminateMs),
        );
      };
      child.once("error", (error) => {
        entry.launchError = error.message;
        finish({ code: 127, signal: null });
      });
      child.once("exit", (code, signal) => finish({ code, signal }));
      const check = () => {
        try {
          const host = sample("running", child.pid, observed);
          if (host.pressure?.state !== "normal" || !host.processes?.value)
            cancelActive?.(
              `pressure/census: ${host.pressure?.state ?? "unknown"}`,
            );
        } catch (error) {
          cancelActive?.(`observation failed: ${error.message}`);
        }
      };
      try {
        owner.update({
          phase: "active",
          child: { pid: entry.pid },
          observed: [],
        });
      } catch (error) {
        cancelActive(`owner update failed: ${error.message}`);
      }
      check();
      const interval = setInterval(check, sampleMs);
      const outcome = await completion;
      clearInterval(interval);
      for (const timer of timers) clearTimeout(timer);
      cancelActive = null;
      if (unresolved) {
        // The cancellation deadline is not a child exit. Do not extend it
        // with the post-exit drain budget or imply that output is complete.
        child.stdout.destroy();
        child.stderr.destroy();
        receipt.diagnosticErrors.push(
          "stdio capture stopped with unresolved live child; output incomplete",
        );
      } else await drain();
      entry.exitCode = outcome.code;
      entry.signal = outcome.signal;
      entry.end = new Date().toISOString();
      const after = sample("cleanup", child.pid, observed);
      if (after.pressure?.state !== "normal")
        reason ??= `pressure: ${after.pressure?.state ?? "unknown"}`;
      const survivors = after.processes?.value?.filter(
        (p) =>
          p.pgid === child.pid || observed.get(p.pid)?.started === p.started,
      );
      entry.survivors = survivors ?? null;
      let clean =
        !unresolved &&
        (entry.launchError || (survivors && survivors.length === 0));
      if (
        phase.verifySourceOnFailure &&
        !entry.launchError &&
        (reason ||
          interrupted ||
          outcome.signal ||
          outcome.code !== 0 ||
          unresolved)
      ) {
        try {
          if (!clean) throw new Error("process cleanup is unresolved");
          entry.sourceAfter = snapshotSource(phase.cwd);
          requireSameSource(entry.sourceBefore, entry.sourceAfter);
          entry.stagingRestoration = "verified";
        } catch (error) {
          clean = false;
          entry.stagingRestoration = "unresolved";
          reason = [
            reason ?? interrupted,
            `staging restoration unverified: ${error.message}; inspect the working tree/index and retained lint-staged backup before explicit owner recovery`,
          ]
            .filter(Boolean)
            .join("; ");
        }
      }
      mayRelease = Boolean(clean);
      receipt.signal = outcome.signal;
      receipt.exitCode = outcome.signal
        ? 128 + constants.signals[outcome.signal]
        : (outcome.code ?? 1);
      receipt.classification = entry.launchError
        ? "launch-failed"
        : outcome.signal
          ? "signal"
          : receipt.exitCode
            ? "failed"
            : "passed";
      if (channel && !outcome.signal && !entry.launchError && !unresolved) {
        try {
          const reported = channel.read(outcome.code);
          receipt.classification = reported.classification;
          receipt.signal = reported.signal;
          entry.reportedOutcome = reported;
        } catch (error) {
          receipt.exitCode ||= 75;
          receipt.classification = "resource-aborted";
          receipt.reason = error.message;
        }
      }
      channel?.close();
      channel = null;
      if (reason || interrupted || !clean) {
        receipt.exitCode = receipt.exitCode || 75;
        receipt.classification = "resource-aborted";
        receipt.reason = reason ?? interrupted ?? "cleanup unresolved";
        // Signal status survives in the phase receipt; cancellation can
        // never become a pass when the child's handler returns zero.
        if (reason && !outcome.signal) receipt.exitCode = 75;
      }
      if (!clean || receipt.exitCode !== 0) break;
      owner.update({ phase: "idle" });
    }
    if (mayRelease) {
      owner.update({ phase: "idle" });
      owner.release();
      receipt.cleanup = "verified";
    }
  } catch (error) {
    receipt.exitCode ||= 75;
    receipt.classification = "resource-aborted";
    receipt.reason = error.message;
    // A failed owner/receipt write is not proof that release is safe.
    receipt.cleanup = "unresolved";
  } finally {
    channel?.close();
    logs.close();
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    receipt.terminal = true;
    receipt.end = new Date().toISOString();
    receipt.allocationFailure = logs.allocationFailure;
    receipt.resourceAbort = Boolean(
      receipt.signal ||
      receipt.exitCode >= 128 ||
      receipt.classification === "memory" ||
      receipt.classification.startsWith("resource-"),
    );
    if (receipt.runner) bindNativeReport(receipt);
    if (
      (receipt.diagnosticErrors.length || receipt.reportError) &&
      receipt.exitCode === 0
    ) {
      receipt.exitCode = 75;
      receipt.classification = "evidence-incomplete";
    }
    atomic(path, receipt);
  }
  return { ...receipt, directory };
}
