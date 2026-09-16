import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { atomic } from "../test-evidence-record.mjs";
import { parseMutation, mutationFiles } from "./mutation.mjs";
import { snapshotSource, requireSameSource } from "./selection-git.mjs";

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
    source: snapshotSource(path.dirname(app)),
  };
  const recordPath = path.join(directory, "mutation.json");
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
    requireSameSource(record.source, snapshotSource(path.dirname(app)));
    record.status = "running";
    atomic(recordPath, record);
    // Import only after intent, source and closed configuration are validated.
    // The owner retains actual wait status (Stryker converts INT to 130),
    // group interruption, census and unresolved-cleanup retention.
    const { Stryker } = await import("@stryker-mutator/core");
    await new Stryker({ configFile }).runMutationTest();
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
    record.status = "failed";
    record.reason = error.message;
    throw error;
  } finally {
    try {
      record.sourceAfter = snapshotSource(path.dirname(app));
      requireSameSource(record.source, record.sourceAfter);
    } catch (error) {
      record.status = "failed";
      record.reason = error.message;
      throw error;
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
  try {
    await runMutation(
      JSON.parse(process.argv[2]),
      fs.realpathSync(process.cwd()),
      process.env.ERGOMATIC_ARTIFACT_DIR,
    );
  } catch (error) {
    console.error(`mutation: ${error.message}`);
    process.exitCode = 2;
  }
}
