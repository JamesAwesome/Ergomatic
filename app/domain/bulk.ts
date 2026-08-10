/**
 * Bulk paste parsing.
 *
 * **The import contract, in one sentence** (composed 2026-08-10 when the
 * warmup setting rebased onto Phase CL's all-or-nothing import, which had
 * landed independently): **`wu` lines are never "bad"; everything else is
 * all-or-nothing.**
 *
 * Unpacked, because two rulings meet here and neither survives alone:
 *
 * - A **well-formed `wu <minutes>` line is DROPPED and COUNTED**
 *   (`BulkResult.droppedWarmups`, surfaced by `droppedWarmupNotice` below
 *   and by `POST /api/workouts/bulk`'s own `droppedWarmups` field). It is
 *   not an error, it does not appear in `errors`, and it therefore never
 *   trips the all-or-nothing gate — a paste whose only oddity is warm-up
 *   lines imports in full. James's ruling; `wu` left the `Step` union on
 *   2026-08-09 and a paste written before that day must still land.
 * - A **MALFORMED `wu` line is fatal**, like any other malformed line: the
 *   old "needs minutes" shape check still runs and still errors. A dropped
 *   line is a line we understood, not a line we skipped.
 * - A **warm-up-ONLY block is a parse error** ("workout needs at least one
 *   step. Warm-ups are a setting now."). Dropping its only content would
 *   make the block vanish silently.
 * - **Everything else is all-or-nothing** (Phase 5B/CL): ANY entry in
 *   `errors` — parse-level here, or validation-level in the route — means
 *   the whole paste creates NOTHING, so a rower can fix the one bad line
 *   and re-paste the WHOLE text without duplicating what already landed.
 *   The route (`server/routes/data.ts`) owns that half; this file owns the
 *   `errors` array it keys on.
 */
import { parsePaceRef } from "./pace.js";
import { parseDurationToken } from "./duration.js";
import type { Difficulty, Step, WorkoutInput, WorkoutType } from "./types.js";

export interface BulkError {
  block: number;
  line: number;
  message: string;
}

export interface BulkResult {
  workouts: WorkoutInput[];
  errors: BulkError[];
  // Count of `wu <minutes>` lines recognized and dropped (0 when none).
  // "wu" left the Step union 2026-08-09 (the warmup-setting spec): a wu
  // line is no longer a step, but it is still explicitly PARSED (its old
  // "needs minutes" shape check still applies and still errors on
  // malformed input) — only a well-formed line is silently dropped and
  // counted here, never turned into case-deletion's fatal "unknown step
  // word" (adversarial M6), which would eat the whole block.
  droppedWarmups: number;
}

/** The shared "N warm-ups dropped" notice copy (2026-08-09's warmup-setting
 *  spec §6: "the import screen gains a notice line"). The plan's own global
 *  constraints section pins the literal `N warm-up lines dropped. Warm-ups
 *  are a setting now.` — this deliberately DIVERGES from it at `n === 1`
 *  ("1 warm-up line dropped", not "1 warm-up lines dropped"): the pinned
 *  wording was never grammar-checked at its own singular case, and the
 *  pluralized sentence is the better one (block2-review F4). A session
 *  draft loaded from localStorage can carry the SAME fact for the SAME
 *  reason — a `wu` step recorded before the setting shipped — so
 *  `session/draft.ts`'s legacy-draft strip imports this rather than
 *  spelling the sentence a second time; one function is what keeps the two
 *  doors from drifting into two different wordings of one fact. No
 *  em-dash, per the house rule for user-facing copy. */
export function droppedWarmupNotice(n: number): string {
  return `${n} warm-up line${n === 1 ? "" : "s"} dropped. Warm-ups are a setting now.`;
}

const TYPES: WorkoutType[] = ["AN", "O2", "AT", "TR"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

interface RawLine {
  text: string;
  lineNumber: number; // 1-based, in the original pasted text
}

type HeaderFields = Pick<
  WorkoutInput,
  "title" | "type" | "difficulty" | "pain"
>;

/** Groups non-blank lines into blocks, splitting on one-or-more blank lines.
 *  Leading/trailing blank lines are simply ignored. */
function splitBlocks(text: string): RawLine[][] {
  const blocks: RawLine[][] = [];
  let current: RawLine[] = [];
  text.split("\n").forEach((raw, i) => {
    if (raw.trim() === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      return;
    }
    current.push({ text: raw.trim(), lineNumber: i + 1 });
  });
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function parseHeader(
  line: RawLine,
  blockIndex: number,
  errors: BulkError[],
): HeaderFields | null {
  const parts = line.text.split("|").map((p) => p.trim());
  if (parts.length !== 4 && parts.length !== 5) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message:
        'header must be "title | TYPE | difficulty | pain" (a leading number is accepted and ignored)',
    });
    return null;
  }
  // The legacy five-field form leads with a workout number that's no longer
  // persisted anywhere; parse it only far enough to discard it.
  const [title, type, difficulty, painStr] =
    parts.length === 5 ? parts.slice(1) : parts;
  if (title.length === 0) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: "title is required",
    });
    return null;
  }
  if (!TYPES.includes(type as WorkoutType)) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: `invalid type: ${type}`,
    });
    return null;
  }
  if (!DIFFS.includes(difficulty as Difficulty)) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: `invalid difficulty: ${difficulty}`,
    });
    return null;
  }
  const pain = Number(painStr);
  if (!Number.isInteger(pain)) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: `invalid pain: ${painStr}`,
    });
    return null;
  }
  return {
    title,
    type: type as WorkoutType,
    difficulty: difficulty as Difficulty,
    pain,
  };
}

function parseWorkStep(
  tokens: string[],
  line: RawLine,
  blockIndex: number,
  errors: BulkError[],
): Step | null {
  const [durationTok, refTok, ...rest] = tokens;
  if (!durationTok || !refTok) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: "w step needs a duration and a pace ref",
    });
    return null;
  }
  const duration = parseDurationToken(durationTok);
  if (!duration) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: `bad duration unit: ${durationTok}`,
    });
    return null;
  }
  const ref = parsePaceRef(refTok);
  if (!ref) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: /^(max|min)[+-]/i.test(refTok)
        ? "effort refs take no offset"
        : `bad pace ref: ${refTok}`,
    });
    return null;
  }

  let spm: number | undefined;
  let restMinutes: number | undefined;
  for (const tok of rest) {
    if (tok.startsWith("@")) {
      const n = Number(tok.slice(1));
      if (!Number.isFinite(n)) {
        errors.push({
          block: blockIndex,
          line: line.lineNumber,
          message: `bad spm: ${tok}`,
        });
        return null;
      }
      spm = n;
    } else if (/^r\d+(?:\.\d+)?$/.test(tok)) {
      restMinutes = Number(tok.slice(1));
    } else {
      errors.push({
        block: blockIndex,
        line: line.lineNumber,
        message: `unexpected token: ${tok}`,
      });
      return null;
    }
  }

  return {
    k: "w",
    duration,
    ref,
    ...(spm !== undefined ? { spm } : {}),
    ...(restMinutes !== undefined ? { restMinutes } : {}),
  };
}

/** Recognizes a `wu <minutes>` line — the wu authoring keyword is fully
 *  retired (spec §6, adversarial M6), but the parser still handles it
 *  EXPLICITLY rather than by case-deletion: a malformed line (missing or
 *  trailing-garbage minutes) still gets the same precise error it always
 *  has, while a well-formed one is parsed and dropped rather than turned
 *  into a Step. Returns `null` when `line` isn't a wu line at all, so the
 *  caller falls through to the normal step grammar. */
function tryParseWarmupLine(
  line: RawLine,
  blockIndex: number,
  errors: BulkError[],
): { valid: boolean } | null {
  const tokens = line.text.split(/\s+/);
  if (tokens[0] !== "wu") return null;
  const n = Number(tokens[1]);
  if (tokens.length !== 2 || !Number.isFinite(n)) {
    errors.push({
      block: blockIndex,
      line: line.lineNumber,
      message: `wu needs minutes: ${line.text}`,
    });
    return { valid: false };
  }
  return { valid: true };
}

function parseStepLine(
  line: RawLine,
  blockIndex: number,
  errors: BulkError[],
): Step | null {
  const tokens = line.text.split(/\s+/);
  const word = tokens[0];

  const repsMatch = /^x(\d+)$/.exec(word);
  if (repsMatch) return { k: "reps", count: Number(repsMatch[1]) };

  switch (word) {
    case "r": {
      const n = Number(tokens[1]);
      if (tokens.length !== 2 || !Number.isFinite(n)) {
        errors.push({
          block: blockIndex,
          line: line.lineNumber,
          message: `r needs minutes: ${line.text}`,
        });
        return null;
      }
      return { k: "r", minutes: n };
    }
    case "test": {
      const label = tokens.slice(1).join(" ");
      if (label.length === 0) {
        errors.push({
          block: blockIndex,
          line: line.lineNumber,
          message: "test needs a label",
        });
        return null;
      }
      return { k: "test", label };
    }
    case "w":
      return parseWorkStep(tokens.slice(1), line, blockIndex, errors);
    default:
      errors.push({
        block: blockIndex,
        line: line.lineNumber,
        message: `unknown step word: ${word}`,
      });
      return null;
  }
}

/** Parses the builder's bulk-paste grammar into workout inputs. This is a
 *  syntax-level parse only — every returned workout still needs to pass
 *  `validateWorkoutInput` before being persisted (bounds like pain 1..5 or
 *  reps 1..12 are that layer's job, not this one's). */
export function parseBulk(text: string): BulkResult {
  const errors: BulkError[] = [];
  const workouts: WorkoutInput[] = [];
  let droppedWarmups = 0;

  splitBlocks(text).forEach((block, blockIndex) => {
    const [headerLine, ...stepLines] = block;
    const header = parseHeader(headerLine, blockIndex, errors);
    if (!header) return;

    if (stepLines.length === 0) {
      errors.push({
        block: blockIndex,
        line: headerLine.lineNumber,
        message: "workout needs at least one step",
      });
      return;
    }

    const steps: Step[] = [];
    let sawError = false;
    for (const line of stepLines) {
      const warmup = tryParseWarmupLine(line, blockIndex, errors);
      if (warmup) {
        if (warmup.valid) droppedWarmups += 1;
        else sawError = true;
        continue;
      }
      const step = parseStepLine(line, blockIndex, errors);
      if (!step) {
        sawError = true;
        continue;
      }
      steps.push(step);
    }
    if (sawError) return;

    // A block whose ONLY lines were well-formed `wu` lines (arc review F7).
    // Dropping them is right — spec §6's "never fatal" rule is about not
    // eating a block's OTHER steps — but the block that is left has no
    // steps at all, and reporting `ok` for it would hand the caller a
    // structurally invalid workout that `validateSteps` rejects further
    // downstream with a message naming neither the warm-up nor the
    // setting. Errored HERE instead, in the same family as the "no step
    // lines at all" check above, and the warm-up lines still count toward
    // `droppedWarmups` so the import screen's notice can say what happened.
    if (steps.length === 0) {
      errors.push({
        block: blockIndex,
        line: headerLine.lineNumber,
        message: "workout needs at least one step. Warm-ups are a setting now.",
      });
      return;
    }

    workouts.push({ ...header, steps });
  });

  return { workouts, errors, droppedWarmups };
}
