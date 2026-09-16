import fs from "node:fs";
import { constants } from "node:os";
import {
  discoverSpecifications,
  executeSpecifications,
} from "./selection-vitest.mjs";

const controller = new AbortController();
let interrupted;
const cancel = (signal) => {
  interrupted ??= signal;
  console.error(`selection: cancelling native runner on ${signal}`);
  process.exitCode ||= 128 + constants.signals[signal];
  controller.abort(new Error(`Native selection interrupted: ${signal}`));
};
const interrupt = () => cancel("SIGINT"),
  terminate = () => cancel("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
try {
  const [operation, input, output] = process.argv.slice(2);
  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  payload.signal = controller.signal;
  const result =
    operation === "discover"
      ? await discoverSpecifications(payload)
      : operation === "execute"
        ? await executeSpecifications(payload)
        : (() => {
            throw new Error("Invalid native selection operation");
          })();
  fs.writeFileSync(output, JSON.stringify(result), { flag: "wx", mode: 0o600 });
  if (result.failed) process.exitCode ||= 1;
} catch (error) {
  console.error(`selection ${process.argv[2]}: ${error.stack ?? error}`);
  process.exitCode ||= 2;
} finally {
  // Native result reporting may set exitCode=1 while cancelling; the caller
  // still needs the original signal status, not an ordinary test failure.
  if (interrupted) process.exitCode = 128 + constants.signals[interrupted];
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
}
