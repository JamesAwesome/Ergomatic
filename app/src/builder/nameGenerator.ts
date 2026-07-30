// On-theme workout name generator ("for the creatively impaired"). Combines
// a weather/natural-force noun with an optional modifier ("Bitter Squall")
// or uses the bare noun alone ("Squall"). Deterministic and dependency-free:
// no Math.random()/Date.now() anywhere in this module — the caller supplies
// the seed, so a given seed always produces the same name (reproducible
// tests, and future replayable workout history).

const NOUNS = [
  "Zephyr",
  "Squall",
  "Doldrums",
  "Derecho",
  "Riptide",
  "Monsoon",
  "Whiteout",
  "Gale",
  "Tempest",
  "Sirocco",
  "Chinook",
  "Haboob",
  "Downburst",
  "Mistral",
  "Bora",
  "Levanter",
  "Harmattan",
  "Undertow",
  "Maelstrom",
  "Eddy",
  "Surge",
  "Swell",
  "Breaker",
  "Torrent",
  "Cascade",
  "Deluge",
  "Cloudburst",
  "Thunderhead",
  "Updraft",
  "Crosswind",
  "Headwind",
  "Tailwind",
  "Flurry",
  "Blizzard",
  "Whirlwind",
  "Cyclone",
  "Vortex",
  "Drift",
  "Rime",
  "Hoarfrost",
  "Aurora",
  "Solstice",
  "Equinox",
  "Meridian",
  "Trade Wind",
  "Sea Fret",
  "Squall Line",
  "Dust Devil",
  "Ice Fog",
  "Slack Water",
] as const;

const MODIFIERS = [
  "Long",
  "Cold",
  "Bitter",
  "Steady",
  "Rolling",
  "Rising",
  "Breaking",
  "Distant",
  "Low",
  "High",
  "Deep",
  "Sharp",
  "Slow",
  "Hard",
  "Grey",
  "Iron",
  "Salt",
  "Storm",
  "Winter",
  "Autumn",
  "Morning",
  "Midnight",
  "Northern",
  "Southern",
  "Open",
  "Far",
  "First",
  "Last",
  "Silent",
  "Heavy",
] as const;

/** Domain title bound (see `domain/validate.ts`: `title 1..80 chars`). */
const MAX_TITLE_LENGTH = 80;

/** Bare nouns, plus every noun x modifier combination. */
export const NAME_POOL_SIZE = NOUNS.length + NOUNS.length * MODIFIERS.length;

/** Builds the name at a given position in the combined name space:
 *  positions `[0, NOUNS.length)` are bare nouns, and the remainder walk
 *  every (modifier, noun) pair. */
function nameAt(index: number): string {
  if (index < NOUNS.length) {
    return NOUNS[index];
  }
  const modIndex = index - NOUNS.length;
  const noun = NOUNS[modIndex % NOUNS.length];
  const modifier = MODIFIERS[Math.floor(modIndex / NOUNS.length)];
  return `${modifier} ${noun}`;
}

/** Deterministic seed → index into a list of `size` items, via `Math.trunc`
 *  + positive-modulo normalisation. No `Math.random()`, no `Date.now()`: the
 *  caller owns the seed so tests are reproducible, and negative/fractional
 *  seeds still land in range. */
function seedIndex(seed: number, size: number): number {
  const truncated = Math.trunc(seed);
  return ((truncated % size) + size) % size;
}

export function generateName(
  existing: readonly string[],
  seed: number,
): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));

  // Select from the untaken names directly, rather than probing forward from
  // a seed-derived start: the pool's early positions are the same
  // weather-word nouns a populated library is likely to already have taken,
  // so probing from a cluster of taken slots slides many different seeds to
  // the same first-free name. Building the untaken list up front and
  // indexing into it by seed means every seed maps to a genuinely different
  // (still deterministic) name whenever more than one is free.
  const untaken: number[] = [];
  for (let index = 0; index < NAME_POOL_SIZE; index++) {
    if (!taken.has(nameAt(index).toLowerCase())) {
      untaken.push(index);
    }
  }

  if (untaken.length > 0) {
    return nameAt(untaken[seedIndex(seed, untaken.length)]);
  }

  // Every name in the pool is taken. Fall back to the seed's first choice
  // with a numeric suffix, bumping the number until it's free. Capped at
  // NAME_POOL_SIZE attempts — a fixed bound independent of `existing.length`
  // — so this is bounded and cannot loop forever regardless of how large a
  // library the caller passes in.
  const base = nameAt(seedIndex(seed, NAME_POOL_SIZE));
  for (let suffix = 2; suffix < NAME_POOL_SIZE + 2; suffix++) {
    const candidate = `${base} ${suffix}`;
    if (
      candidate.length <= MAX_TITLE_LENGTH &&
      !taken.has(candidate.toLowerCase())
    ) {
      return candidate;
    }
  }

  // Even every numbered fallback is taken. Practically unreachable (it needs
  // NAME_POOL_SIZE distinct numbered variants of the same base name already
  // in the library) but the loop above is finite, so this keeps the
  // function total and still within the 80-character title bound.
  return base.slice(0, MAX_TITLE_LENGTH);
}
