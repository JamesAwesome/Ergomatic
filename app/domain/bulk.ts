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

    workouts.push({ ...header, steps });
  });

  return { workouts, errors, droppedWarmups };
}
