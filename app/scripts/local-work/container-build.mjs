// Docker's isolated Linux build stage has neither a Git checkout nor the
// macOS pressure source. This fixed caller is part of the excluded Compose
// lifecycle until its adapter ships; it is not a local admission override.
import { platform as currentPlatform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { workloadPhases } from "./workloads.mjs";
import { runUnmanaged } from "../local-work.mjs";

export async function containerBuild({
  app = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  platform = currentPlatform(),
  env = process.env,
  write = console.error,
} = {}) {
  if (platform !== "linux") {
    write("container-build: requires the isolated Linux Docker build stage");
    return 64;
  }
  return runUnmanaged(
    workloadPhases({ app, name: "build", env, hosted: true }),
    write,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2) {
    console.error("container-build: no arguments accepted");
    process.exitCode = 64;
  } else process.exitCode = await containerBuild();
}
