#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { git } from "./local-work/selection-git.mjs";

// The pipe is consumed exactly once by the actual pre-push hook. No persistent
// Git setting, exported mode or passed-test cache exempts subsequent pushes.
try {
  const args = process.argv.slice(2);
  if (args.includes("--no-verify"))
    throw new Error("Full verification cannot bypass hooks");
  const head = git(process.cwd(), ["rev-parse", "HEAD"]).trim();
  const child = spawn("git", ["push", ...args], {
    stdio: ["inherit", "inherit", "inherit", "pipe"],
    env: { ...process.env, ERGOMATIC_FULL_PUSH_FD: "3" },
  });
  child.stdio[3].on("error", (error) => {
    if (error.code !== "EPIPE") console.error(error.message);
  });
  child.stdio[3].end(
    JSON.stringify({
      version: 1,
      mode: "full",
      projects: ["unit", "client"],
      head,
    }),
  );
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.exitCode = result.signal
    ? 128 + constants.signals[result.signal]
    : (result.code ?? 1);
} catch (error) {
  console.error(`push:full: ${error.message}`);
  process.exitCode = 64;
}
