import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/**
 * The ONE place `docs/monitor/sessions/` gets located from
 * `import.meta.url`. Every caller used to do this surgery itself, embedding
 * its OWN filename in the regex (Exploration B census §3: 27 files under
 * `src/monitor/` + `src/log/` + `src/session/` + `src/workout/`, each with
 * its own copy of this comment and its own filename literal). Computed here
 * instead, against THIS module's own `import.meta.url`, so no caller's
 * filename appears in any regex anywhere.
 *
 * Same reason as every file this replaces: this project's jsdom environment
 * resolves `new URL(...)` against `http://localhost:3000/` instead of a
 * `file://` base, so plain string surgery on `import.meta.url` is used
 * instead. `docs/monitor/sessions/` lives three directories above
 * `app/src/test/`.
 */
export const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/src\/test\/captures\.ts$/, "../docs/monitor/sessions");

/** The absolute path to one capture file under its walk directory. */
export function capturePath(walkDir: string, file: string): string {
  return `${SESSIONS_DIR}/${walkDir}/${file}`;
}

/**
 * Reads one capture's text, gunzipping when `file` ends in `.gz` and
 * reading it plain otherwise — callers still run the result through
 * `parseRecording` themselves.
 */
export function readCapture(walkDir: string, file: string): string {
  const path = capturePath(walkDir, file);
  try {
    const raw = readFileSync(path);
    return file.endsWith(".gz")
      ? gunzipSync(raw).toString("utf8")
      : raw.toString("utf8");
  } catch (error) {
    throw new Error(
      `readCapture: could not read "${path}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
