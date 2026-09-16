import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { atomic } from "../test-evidence-record.mjs";
import {
  parseMutation,
  mutationFiles,
  snapshotMutationSource,
} from "./mutation.mjs";
import { requireSameSource } from "./selection-git.mjs";

class MutationWorkerFailure extends Error {
  constructor(error) {
    super(error.message);
    this.classification =
      error.failure.kind === "allocation" ? "memory" : "resource-aborted";
    this.failure = error.failure;
  }
}

export async function runMutation(request, app, directory) {
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077 ||
    fs.realpathSync(directory) !== directory
  )
    throw new Error("Mutation needs a private canonical invocation receipt");
  const receipt = JSON.parse(
    fs.readFileSync(path.join(directory, "receipt.json"), "utf8"),
  );
  if (
    receipt.scope?.workload !== "mutate" ||
    !isDeepStrictEqual(request, parseMutation(receipt.scope.args))
  )
    throw new Error(
      "Mutation pipeline no longer matches the owner's original request",
    );
  const record = {
    schema: 1,
    request,
    status: "preparing",
    source: snapshotMutationSource(app),
  };
  const recordPath = path.join(directory, "mutation.json");
  let failure;
  fs.writeFileSync(recordPath, JSON.stringify(record), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    const { config, files, testFiles } = mutationFiles(app, request);
    Object.assign(record, { files, testFiles });
    const configFile = path.join(directory, "stryker.config.json");
    const options = {
      ...config,
      concurrency: request.concurrency,
      ergomaticFailOnWorkerFailure: true,
      ergomaticExactInputs: true,
      mutate: files,
      ...(testFiles.length ? { testFiles } : {}),
      tempDirName: path.join(directory, "sandbox"),
      cleanTempDir: true,
      inPlace: false,
      reporters: [...config.reporters, "json"],
      jsonReporter: { fileName: path.join(directory, "mutation-report.json") },
      htmlReporter: { fileName: path.join(directory, "mutation.html") },
    };
    fs.writeFileSync(configFile, JSON.stringify(options), {
      flag: "wx",
      mode: 0o600,
    });
    requireSameSource(record.source, snapshotMutationSource(app));
    record.status = "running";
    atomic(recordPath, record);
    // Import only after intent, source and closed configuration are validated.
    // The owner retains actual wait status (Stryker converts INT to 130),
    // group interruption, census and unresolved-cleanup retention.
    const {
      Stryker,
      ErgomaticWorkerFailure,
      ergomaticWorkerFailurePolicyVersion,
    } = await import("@stryker-mutator/core");
    if (
      ergomaticWorkerFailurePolicyVersion !== 2 ||
      typeof ErgomaticWorkerFailure !== "function"
    )
      throw new Error(
        "Local mutation requires the version-pinned no-retry Stryker patch; install from the committed lockfile",
      );
    const { ergomaticInnerWorkerPolicyVersion } =
      await import("@stryker-mutator/vitest-runner");
    if (ergomaticInnerWorkerPolicyVersion !== 1)
      throw new Error(
        "Local mutation requires the version-pinned inner-worker Stryker patch; install from the committed lockfile",
      );
    try {
      await new Stryker({ configFile }).runMutationTest();
    } catch (error) {
      if (error instanceof ErgomaticWorkerFailure)
        throw new MutationWorkerFailure(error);
      throw error;
    }
    const report = JSON.parse(
      fs.readFileSync(options.jsonReporter.fileName, "utf8"),
    );
    if (
      !report.files ||
      Object.keys(report.files).some((file) => !files.includes(file))
    )
      throw new Error("Native mutation report escaped requested files");
    record.status = "completed";
  } catch (error) {
    failure = error;
    record.status = "failed";
    record.reason = error.message;
    if (error instanceof MutationWorkerFailure)
      record.workerFailure = error.failure;
    throw error;
  } finally {
    try {
      record.sourceAfter = snapshotMutationSource(app);
      requireSameSource(record.source, record.sourceAfter);
    } catch (error) {
      record.status = "failed";
      record.sourceError = error.message;
      record.reason ??= error.message;
      if (!failure) throw error;
    } finally {
      record.endedAt = new Date().toISOString();
      atomic(recordPath, record);
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let verdict = "";
  try {
    await runMutation(
      JSON.parse(process.argv[2]),
      fs.realpathSync(process.cwd()),
      process.env.ERGOMATIC_ARTIFACT_DIR,
    );
  } catch (error) {
    console.error(`mutation: ${error.message}`);
    if (error instanceof MutationWorkerFailure) verdict = error.classification;
    process.exitCode = 2;
  }
  if (process.env.ERGOMATIC_TEST_OUTCOME === "1")
    fs.writeSync(
      3,
      JSON.stringify({ exitCode: process.exitCode ?? 0, verdict }),
    );
}
