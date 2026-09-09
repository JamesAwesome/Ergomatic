/**
 * The rower's choice about the ready screen — the one persisted fact behind
 * `/you/settings`'s READY SCREEN section (Phase RN, spec
 * `2026-09-09-ready-card-preference-design.md`, Gate 0 CLOSED 2026-09-09).
 *
 * WHAT IT STORES: one word. `show` is today's behaviour — the monitor arms
 * and the app waits on `Ready when you pull` until the rower taps. `skip`
 * hands over to the numbers the moment the monitor is ready, as though the
 * button had been pressed. Nothing else is stored, and the default is `show`,
 * so a rower who never opens Settings sees no change anywhere.
 *
 * A TWO-MEMBER UNION RATHER THAN A BOOLEAN, and it is not decoration. The
 * feature is a triple negative in boolean form — the setting is "off", which
 * means "skip", which means the consumer's flag starts `true`. Every place a
 * boolean would appear (the parse, the screen's `value`, two `useState`
 * initializers, a dozen test titles) is a place to invert it once too often.
 * The union carries the rower's own word all the way to the call site:
 * `loadReadyCard() === "skip"`.
 *
 * NO JSON ENVELOPE, which is the one place this departs from
 * `you/judgeColors.ts`. That module stores an object because it has four
 * independent slots and wants a corrupt fourth not to cost the other three.
 * This stores one value, so it stores the bare word and never parses. A
 * second preference gets its own key rather than a slot in this one.
 *
 * THE CATCH IS BARE, AND MUST STAY BARE.
 * `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`,
 * verbatim: "Write them as bare `catch`, never
 * `catch (e) { if (e.name === "SecurityError") }` — the `nullptr` paths above
 * make detached-document access a `TypeError` that a name-filtered catch
 * would let escape." Unlike `judgeColors.ts` this module is NOT read at
 * `main.tsx` module scope — all three of its readers are `useState`
 * initializers inside components — so an escaping throw would cost one screen
 * rather than the whole app. The discipline is the same anyway; the smaller
 * blast radius is recorded so nobody adds a boot read later believing the two
 * modules are interchangeable.
 *
 * LIFETIME. The stored word survives reload, relaunch and sign-out, and there
 * is deliberately no clear path — not a Reset, not an account switch. Storage
 * eviction and low disk lose it (see the research note above) and the rower
 * silently gets `show` back; the read is total, so a vanished key is
 * indistinguishable from a fresh install. `lastSet` lives only as long as the
 * process. Not account-scoped, exactly as `judgeColors.ts`: a second rower on
 * the same phone inherits the first rower's choice, and that is re-litigated
 * the day a device account switcher lands.
 */

export const READY_CARD_KEY = "ergomatic.readyCard";

/** `show` renders the ready screen and waits for the tap — today's
 *  behaviour. `skip` hands straight over to the numbers. */
export type ReadyCardChoice = "show" | "skip";

/** Today, exactly (I-1). Every failure path below resolves here, so the
 *  module fails toward the screen that shows the rower more, never less. */
export const READY_CARD_DEFAULT: ReadyCardChoice = "show";

/** The last value this process FAILED to write. Set only on the refused
 *  path, and cleared the moment a write succeeds — see `saveReadyCard`. It
 *  exists for ONE case: a device that refuses the write. Persistence is this
 *  setting's whole mechanism — its consumers read at the next connect, not
 *  from a live root property the way the colours do — so without this a
 *  refused write would leave the control moved and the setting inert, and the
 *  rower would find out at the erg. */
let lastSet: ReadyCardChoice | null = null;

function isReadyCardChoice(value: unknown): value is ReadyCardChoice {
  return value === "show" || value === "skip";
}

/**
 * Never throws, never returns anything but the two words. Absent, empty,
 * mis-cased, whitespace-padded, JSON, a value from an older build, or a
 * getter that throws: all resolve to `show`.
 *
 * STORAGE IS CONSULTED FIRST, and the honest account of why is narrower than
 * the one this comment first carried. The first draft returned `lastSet`
 * before touching storage AND set it on every write, which together made
 * every persistence gate in the phase structurally incapable of failing — the
 * anchor antagonist pass proved it by running the module with `setItem`
 * replaced by a no-op: the save reported `true`, storage held nothing, and
 * this function still said `skip`.
 *
 * WHICH HALF WAS LOAD-BEARING, MEASURED (RF26 — a gate gets the claim it
 * earns, not the strongest one available). Four probes against this suite:
 * restoring the old read order ALONE leaves all 17 green, because `lastSet`
 * is now null except on the refused path, so there is no reachable state
 * where the two disagree. Restoring the old ASSIGNMENT alone fails 2;
 * restoring both fails 2; the old read order combined with a deleted
 * `setItem` fails 3. So `saveReadyCard`'s assignment discipline is what makes
 * the gates bite, and this ordering is defence-in-depth: it costs nothing and
 * it means a future writer of `lastSet` cannot quietly re-open the hole. Do
 * not read it as the thing under test.
 */
export function loadReadyCard(): ReadyCardChoice {
  try {
    const raw = localStorage.getItem(READY_CARD_KEY);
    if (isReadyCardChoice(raw)) return raw;
  } catch {
    /* fall through: the in-memory value, then the default */
  }
  return lastSet ?? READY_CARD_DEFAULT;
}

/**
 * Returns whether the write LANDED — a claim about not throwing, not a
 * receipt for durability (RF25: the caller branches on this rather than
 * swallowing it). A `false` costs the rower the reload and nothing else: the
 * screen shows the new choice, `lastSet` makes the next connect obey it, and
 * the settings screen tells them it will not survive a reload.
 *
 * `lastSet` is set ONLY on the refused path, and cleared on the successful
 * one. That asymmetry is what keeps the promise true for a rower whose device
 * refuses the write, without letting a deleted `setItem` call read back as a
 * working save.
 */
export function saveReadyCard(next: ReadyCardChoice): boolean {
  try {
    localStorage.setItem(READY_CARD_KEY, next);
    // The store owns the value now, so the fallback must stand down. Leaving
    // it set would re-open the hole the precedence fix closed, one size
    // smaller: with `lastSet` surviving a successful write, deleting the
    // `setItem` call above still yields the chosen value on the next read,
    // and the seam test that exists to catch a broken store goes green.
    // Found by this module's own "sees a cleared store" test, which is the
    // reason it is written as a separate case.
    lastSet = null;
    return true;
  } catch {
    // The ONE case the fallback exists for.
    lastSet = next;
    return false;
  }
}
