import { openSync, closeSync, fstatSync, readSync, constants } from "node:fs";
import { constants as osConstants } from "node:os";

// A private inherited file descriptor, not a caller-selected output path.
// The shell emits only its own bounded verdict after waiting for its pipeline.
export function outcomeChannel(path) {
  const fd = openSync(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_RDWR |
      constants.O_NOFOLLOW,
    0o600,
  );
  return {
    fd,
    read(exitCode) {
      const size = fstatSync(fd).size;
      if (size < 1 || size > 1024)
        throw new Error("Missing or oversized test-run outcome");
      const buffer = Buffer.alloc(size);
      if (readSync(fd, buffer, 0, size, 0) !== size)
        throw new Error("Incomplete test-run outcome");
      const result = JSON.parse(buffer.toString("utf8"));
      if (
        result.exitCode !== exitCode ||
        !["", "memory", "signal", "incomplete"].includes(result.verdict) ||
        (exitCode === 0 && result.verdict !== "")
      )
        throw new Error("Test-run outcome disagrees with child wait status");
      const signal =
        result.verdict === "signal"
          ? Object.entries(osConstants.signals).find(
              ([, number]) => number === exitCode - 128,
            )?.[0]
          : null;
      if (result.verdict === "signal" && !signal)
        throw new Error("Unknown test-run signal");
      return {
        classification: result.verdict || (exitCode ? "failed" : "passed"),
        signal,
      };
    },
    close() {
      closeSync(fd);
    },
  };
}
