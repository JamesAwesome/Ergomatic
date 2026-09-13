# News tab layout shift — reserve the gutter, remember the reads

**Not TRIAD.** No number changes meaning, nothing is persisted (the cache is
module memory and dies with the document), and auth is untouched (the
signed-out transition gains one cache clear). Gates, said aloud: one antagonist
pass on this spec because §3 invents a mechanism (RF27) — run, folded below as
revision 2; `/harden` lens 2 skipped (a spec, no prescribed code); no PM gate
(nothing a tester receives changes; the fix is that a frame stops moving); DBA
skips (no server file). Gate 0 is the six captures in
`docs/design/news-shift-gate0/`, presented with this spec. Not fast path: three
product files. Inline implementation with the review half dispatched (James,
2026-09-04, "shape is fine").

**Revision 2, 2026-09-12** — folds the antagonist pass (ledger entry landed in
the same commit). Three invariants changed shape: C3's discard rule is now an
epoch comparison, not an emptiness check (the emptiness check applied a stale
read whenever the write it should have protected SETTLED first); C4 moved from
the sign-out button to the signed-out TRANSITION (the 401 path never presses
the button, and native sign-in re-enters the same document); and the scroll
restore's gate is accepted as immediate on warm mounts rather than described
as unchanged.

## What and why

Opening the News tab shows the page, then a beat later every row jumps 20px to
the right, three titles wrap onto a second line, and everything below LATEST
drops 62px. James: "very distracting". The cause is measured, not inferred:
each row's unread square is rendered only once `/api/article-reads` has
settled, and on the phone that fetch is a real round trip, so the rower sees
the page twice — once without the squares' column and once with it.

This spec does two things. **It reserves the square's column from the first
paint**, so the settled frame lands on top of the loading frame with no
geometry change, in both orientations (measured §2). **And it remembers the
last known read state for the life of the document**, so every News or Reader
mount after the first renders its squares and count immediately from memory
and reconciles against the server in the background — the seven squares and
`7 UNREAD` stop popping in on every tab switch. The first open per app launch
still shows the count arrive, one frame, once.

What a rower sees after this: the News tab opens and stays put.

## 1. Research pass and does-it-exist

- **The browser owns the concept.** web.dev, "Optimize Cumulative Layout
  Shift" (SECONDARY — Google's guidance, not a spec; fetched 2026-09-12),
  verbatim: *"Ads, embeds, iframes, and other dynamically injected content can
  all cause content appearing after them to shift down"* and the fix, verbatim:
  *"Reserve space for late-loading content"*. Our square is dynamically
  injected content; the guidance is to reserve its space. Chromium exposes the
  same concept as the `layout-shift` performance entry (Layout Instability
  API, W3C draft — PRIMARY for the concept's existence, not consulted for any
  number here).
- **Stale-while-revalidate is an existing pattern, not ours.** RFC 5861 names
  it for HTTP caches; the SWR and React Query libraries implement it for
  fetch hooks (SECONDARY, not fetched — cited for the shape, no line is
  load-bearing). §3 borrows the shape and nothing else: render the last known
  value, refetch, reconcile.
- **Does our system have the state?** Yes. `useArticleReads.ts` already holds
  module-level state across mounts: `pendingWrites`, the read-after-write
  barrier from 2026-08-12. The cache lives beside it and obeys the same
  barrier. Nothing new is asserted on the server's behalf: the server stays
  the authority for read state, and the cache is only ever a copy of a
  response it sent or a write we sent it.
- **What this repo already settled about scroll restore** (`News.tsx`'s
  `contentSettled` and the comment above `restoredScrollRef`; the CL "News
  scroll memory" item): the restore waits for the reads fetch because the
  loading frame's height was unknown. **After this spec that wait is
  immediate on every warm mount — and BACK from Reader, the path the restore
  exists for, is always warm, because Reader warmed the cache.** That is
  accepted, in writing, as the intended behaviour: the restore lands on the
  first frame whose read state is known, from memory or from the fetch, and
  `contentSettled` already computes exactly that. A reconcile that lands after
  the restore can move a row only when the server disagrees with the last
  known set (a read made on another device since), and that is not gated —
  said aloud in §4. The comment is rewritten to say this; the gate itself is
  unchanged code.
- **What this repo already settled about per-account state** (`You.tsx`, the
  comment above `clearConcept2Seen`): `useMe`'s 401/throw path "signs the
  rower out without calling this", and that gap is bounded there only because
  the fact is keyed by `user.id`. §3's cache has no key, so it takes the other
  route: it is cleared at the transition, not at the button.

## 2. Reserve the gutter (`News.tsx`)

**Invariant G1.** A row's geometry does not depend on whether its read state
is known. The square element renders on every row in every reads state; only
its `data-read` attribute waits for a known state. G1 is width-independent by
construction — a reserved column is reserved at every viewport — which is why
the measurements below need only show that the reserved column equals the
settled one.

Today `ArticleRow` renders `.news-square` only when `readStateFor` returns a
boolean. After: the `<span className="news-square" aria-hidden="true">` is
unconditional, `data-read` is set only when `isRead !== undefined`. The base
`.news-square` rule paints `var(--page)` with a transparent border and
`box-sizing: border-box` (so the outer box is exactly 10px); a square without
`data-read` therefore renders exactly as today's read square does. No CSS
change. No dark mode exists (`grep -c prefers-color-scheme app/src/index.css
app/src/theme/tokens.css` = 0 and 0), so there is no second palette to check.

**What does not change.** The suppression rule from Phase 6H ("never claim a
wrong number") is untouched at every text site: the accessible Read/Unread
word, the ` · READ` meta suffix, the row's own `data-read`, and the
`N UNREAD` count all still render only on `ready`. An attribute-less square is
`aria-hidden`, colourless, and claims nothing. The `error` state gets the same
invisible gutter as `loading`.

**Measured** (`docs/design/news-shift-gate0/probe-shift.mjs`, `probe-weight.mjs`
and `gate0.mjs`, against the ergomatic-68485 stack — phase-ps-pr1 at
fc02b982, which differs from origin/main only by 206 appended stats CSS rules,
none touching News). With a 10px `flex: none` gutter injected on the loading
frame, every row's `y` equals the settled frame's — portrait 390×844
`137,252,318,463,551,638,726` both, landscape 844×390
`137,231,298,442,509,597,663` both. The unread count adds no height (the title
row's box is unchanged in the before/after diff). The read-row weight change
(500→400) changes no title's line count at the 302px body width of a 390px
portrait viewport (`h500 === h400` on all seven; the probe sets
`style.fontWeight` on the live element, so it is valid regardless of read
state — its own PUTs returned 401 and marked nothing).

**What the receipts do NOT cover, said aloud:** `gate0.mjs` measured a
zero-reads account, so its equal-`y` result contains no ` · READ` suffix and no
400-weight title; `probe-shift.mjs` PUT `pain-scale`, a slug Phase DE retired
(`articles.tsx` has `effort-scale`), so it marked one row read, not two, and
injected no gutter. The combination — reserved gutter, a read row, cold
document — is what §4's e2e gate measures, on the real change rather than a
stand-in. Widths other than 390 are unmeasured for the weight-change residual;
G1 does not depend on them.

## 3. Remember the reads (`useArticleReads.ts`, `useMe.ts`)

**Invariant C1 (warm mount).** A mount that follows a successful read of
`/api/article-reads` in this document renders `ready` synchronously from the
last known set, then refetches.

**Invariant C2 (writes are visible everywhere, at once).** `markRead` and
`markUnread` update the last known set before their request is sent, and
every mounted instance sees the new set in the same tick. (One `<Routes>`
mounts at most one consumer at a time — News or Reader, never both — so "every
instance" is one instance; the listener set is for correctness under
StrictMode's mount/unmount/mount, not for concurrency.)

**Invariant C3 (a read never undoes a write it did not see).** Every
`markRead`/`markUnread` increments a module write epoch. A GET samples the
epoch at the moment it is issued (after the barrier) and, on an OK response,
applies the set only if the epoch is unchanged. On a mismatch the response is
dropped and the GET is re-issued ONCE, behind the barrier again; a second
mismatch is dropped and the next mount reconciles. The instance's state after
a drop is whatever it was — `ready` on a warm instance, and a cold instance
cannot reach a drop because a cold cache admits no writes (`markRead` is a
no-op while `lastKnown === null`). *Why an epoch and not "no write in
flight":* the interleaving that breaks emptiness is now reachable — with a
warm cache, Reader's mark-read effect fires on its FIRST render, so a PUT can
be issued after News's GET went out and SETTLE before that slow GET resolves;
the slot is empty, the stale response is applied, and the article the rower
just opened flips back to unread on every surface. An epoch compares against
what we sent, which is the only value that decides the ordering. A write
between the barrier's resolution and the GET's issue is a microtask gap no
React event or effect can enter (INFERENCE: passive effects and event handlers
run as tasks, not microtasks); the epoch is sampled at issue, so such a write
would bump it first and the GET would be dropped, which is the safe side.

**Invariant C4 (the cache never outlives the signed-in state).** The cache is
cleared at every transition to `{ state: "out" }` in `useMe.ts` — the
`signedOut` callback the You button reaches, the non-OK `/api/me` response,
and the thrown fetch — through one helper, so the sign-out button and the 401
path cannot diverge. This is the transition, not the button, because
`useMe`'s 401 path never calls `adapters/auth.tsx`'s `signOut()`, and on
native `SignInButton` signs the next account in inside the SAME document
(`SocialLogin` then `refetch()`), so an unkeyed cache cleared only at the
button would show account A's squares to account B for one round trip. On web
the sign-in link is a real navigation and the document is new anyway. A GET
that returns non-OK (a 401 from a session the server no longer honours) also
clears the cache and reports `error`; a network failure with a warm cache
keeps showing the cache — that is the case it exists for. `adapters/auth.tsx`
is not changed.

**Invariant C5 (cold behaviour is today's behaviour).** With no last known
set — first mount of the document, or after C4 clears it — the hook is
byte-for-byte today's: `loading`, then `ready` or `error`, and `markRead` is a
no-op until `ready`.

### Lifetime table (RF27)

| State | Scope | Minted | Updated | Cleared | Survives |
|---|---|---|---|---|---|
| `lastKnown: ReadonlySet<string> \| null` | module | first OK GET in this document | every OK GET whose sampled epoch still matches (C3); every `markRead`/`markUnread` (C2) | every transition to `out` in `useMe.ts`; any non-OK GET (C4) | route changes and re-mounts; NOT reload, relaunch or a new document |
| `writeEpoch: number` | module | 0 at module load | +1 per `markRead`/`markUnread` | never (monotonic; compared, never reset) | the document |
| `listeners: Set<(s) => void>` | module | empty at module load | add in the mount effect, delete in its cleanup (StrictMode: add, delete, add) | empty when nothing is mounted | the document |
| `pendingWrites` | module | existing (2026-08-12) | existing | existing | existing |
| per-instance `state` | hook | `lastKnown ? ready : loading` | via its listener; or its own error path | unmount | — |

**`publish` is NOT gated by the issuing instance's `cancelled` flag.** A
server response is the truth whoever asked for it; an unmounted instance's
GET still updates the module cache and any listener that is mounted. What
`cancelled` gates is the instance-local `setState({ state: "error" })` only,
exactly as today. A listener is removed in the effect cleanup before the
instance can unmount, so no listener ever calls `setState` on an unmounted
instance.

### Mechanism, in one paragraph

`markRead` and `markUnread` become module functions over `lastKnown` (they were
closures over a per-effect `currentSlugs`; the StrictMode purity note on the
`setState` updater still holds because the side effects still happen outside
the updater — `publish` sets `lastKnown` and calls each listener, and each
listener's `setState` receives a value, not an updater). The `ready` state's
two function fields are these stable module functions. The mount effect
subscribes a listener, runs the existing barrier, samples the epoch, issues
the GET, and on an OK response publishes or (C3) drops-and-retries-once. A
`clearArticleReadsCache()` export sets `lastKnown` to `null`; `useMe.ts` calls
it from its single become-signed-out helper.

### Who consumes it

`News.tsx` and `Reader.tsx` (the only two consumers, `grep -rln useArticleReads
app/src`). Reader's mark-read effect is keyed on `reads.state` and the slug;
with a warm cache `reads.state` is `ready` on first render, so the mark fires
on the first render through the same guard — this is the ordering C3 exists
for. `markUnread` has no production caller (Phase 6I's "MARK ALL FOUR UNREAD"
left with #181; the function and its tests stay).

## 4. Gates, and what mutates each

Every gate names the mutation that turns it red (RF21); the plan carries the
exact mutation text.

- **Client — `News.test.tsx`.** The `loading` and `error` cases assert seven
  `.news-square` elements with no `data-read` attribute, and still no count,
  no READ suffix, no accessible word. The linked-row test likewise. Mutation:
  restore the `isRead !== undefined &&` conditional — square count goes 7→0.
- **Hook — `useArticleReads.test.ts`.**
  - C1: mount, resolve, unmount, mount again — the second instance's first
    read of `state` is `ready`, and the GET count reaches 2. Mutation: don't
    seed `useState` from `lastKnown` — first read is `loading`.
  - C2: two mounted instances, `markRead` on one, the other's set has the
    slug before any promise resolves. Mutation: skip `publish` in `markRead`
    — the other instance never updates.
  - C3, the antagonist's interleaving: warm mount with its GET held,
    `markRead` a slug, SETTLE the PUT, then release the GET with the
    pre-write set — the slug stays read, and a second GET is issued; release
    it with the post-write set and it is applied. Mutation A: compare
    `pendingWrites.size` instead of the epoch — the slug flips back. Mutation
    B: skip the retry — the GET count stays at 1.
  - C4: mount, resolve, `clearArticleReadsCache()`, mount — `loading`; and a
    warm mount whose GET returns 401 ends `error` with the next mount cold.
    Mutation: skip the clear — `ready`.
  - C5: the existing loading/error/barrier tests, unchanged — except *"the
    barrier stays honest about a FAILED write"*, whose title and comment
    describe a property this design deliberately drops (the app IS an
    optimistic local union until the reconciling read). It is renamed to what
    it now gates — *a failed write is corrected by the next reconciling read,
    never by a local guess* — asserts the optimistic `true` on the warm
    second mount first, then waits for the reconciling GET and asserts
    `false`. Mutation: apply the failed write's optimistic set as if it were
    server truth (skip the reconcile) — stays `true`.
- **`useMe.test.ts`.** Each of the three become-signed-out sites clears the
  cache (spy on the exported clear). Mutation: route one site around the
  helper — that case fails.
- **e2e — `news.spec.ts`, the layout-shift gate.** Precondition, asserted not
  assumed: sign in, `page.goto` one article (marks it read on the server),
  then `page.goto("/news")` — a NEW document, so the cache is cold — with
  `**/api/article-reads` held by `page.route`. Assert the loading frame was
  actually observed: seven `.news-square`, none with `data-read`, no
  `.news-unread-count`. Read every `.news-row` and the `.news-whatsnew`
  bounding box; release; wait for `.news-unread-count` and one
  `[data-read="true"]` row; read again: equal. This is the one measurement
  that contains a ` · READ` suffix and a 400-weight title beside the reserved
  gutter, which no receipt in §2 does. Mutation: the same conditional restore
  as the client test, built into the stack (RF12 corollary: the mutant must
  compile and the build must be seen to succeed) — the boxes differ by 21px
  on three rows. A second, cheaper red: remove the `page.route` hold — the
  loading-frame assertion fails, which is what keeps the gate from going
  vacuous on a warm cache (RF41's shape).
- **Not gated, said aloud:** the first-open-per-launch pop of the count and
  squares is by design (What and why); a reconcile that disagrees with the
  last known set after a warm-mount restore may move a row (§1); the
  weight-change residual at widths other than 390.

## 5. Design gate (Gate 0)

`docs/design/news-shift-gate0/` — six captures at 2× from the current build,
390×844 and 844×390: `1-loading-today` (rows flush left, no gutter),
`2-loading-gutter` (the loading frame with the reserved column, produced by
injecting a 10px `flex: none` gutter, row `y`s equal to the settled frame in
both orientations), `3-settled` (today's settled frame, unchanged by this
spec). No colour pairing changes: an attribute-less square paints exactly what
a read square paints today — `--page` (`#f4f1e8`) on `--page` in LATEST, and
`--page` on `--surface` (`#fffdf7`) in the PINNED card, 1.110:1 computed —
which is the existing read-square rendering `design.spec.ts` already pins, not
a new pairing.

## 6. Out of scope

- Persisting read state across launches (localStorage): a stored shape and the
  reintroduction of the stale-count window the barrier exists to close, for
  one frame per launch. Declined 2026-09-12.
- Hiding rows until the fetch settles: trades a shift for a blank.
- Keying the cache by account id: C4's transition clear makes it unnecessary.
- Confirming there is no SECOND shift on the phone. Structurally none is
  visible (the masthead and WHAT'S NEW are synchronous, fonts are bundled, a
  tab tap clears the saved scroll so it cannot restore into a jump), but the
  desktop probe cannot see James's device; if the tab still moves after this
  ships, a screen recording is the next instrument.
