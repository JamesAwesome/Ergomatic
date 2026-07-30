import { parsePaceRef } from "./pace.js";
import type {
  Difficulty,
  Step,
  WorkDuration,
  WorkoutInput,
  WorkoutType,
} from "./types.js";

export interface BulkError {
  block: number;
  line: number;
  message: string;
}

export interface BulkResult {
  workouts: WorkoutInput[];
  errors: BulkError[];
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

/** `5` -> 5 minutes (time, bare). `1'` -> 1 minute (time). `2500m` -> 2500
 *  meters (distance). Bare numbers are accepted because the apostrophe is
 *  awkward to type on a phone; the builder's duration field accepts the
 *  identical bare-number branch so typing and pasting never disagree. */
function parseDuration(token: string): WorkDuration | null {
  const bare = /^(\d+(?:\.\d+)?)$/.exec(token);
  if (bare) return { kind: "time", minutes: Number(bare[1]) };
  const time = /^(\d+(?:\.\d+)?)'$/.exec(token);
  if (time) return { kind: "time", minutes: Number(time[1]) };
  const distance = /^(\d+)m$/.exec(token);
  if (distance) return { kind: "distance", meters: Number(distance[1]) };
  return null;
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
  const duration = parseDuration(durationTok);
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
      message: `bad pace ref: ${refTok}`,
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
    case "wu":
    case "r": {
      const n = Number(tokens[1]);
      if (tokens.length !== 2 || !Number.isFinite(n)) {
        errors.push({
          block: blockIndex,
          line: line.lineNumber,
          message: `${word} needs minutes: ${line.text}`,
        });
        return null;
      }
      return word === "wu" ? { k: "wu", minutes: n } : { k: "r", minutes: n };
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

  return { workouts, errors };
}
