# News tab layout shift — reserve the gutter, remember the reads

**Not TRIAD.** No number changes meaning, nothing is persisted (the cache is
module memory and dies with the document), and sign-out's behaviour is
unchanged (it gains one cache clear). Gates, said aloud: one antagonist pass on
this spec because §3 invents a mechanism (RF27); no PM gate (nothing a tester
receives changes; the fix is that a frame stops moving); DBA skips (no server
file). Gate 0 is the six captures in `docs/design/news-shift-gate0/`, presented
with this spec. Not fast path: two product files. Inline implementation with
the review half dispatched (James, 2026-09-04, "shape is fine").

## What and why

Opening the News tab shows the page, then a beat later every row jumps 20px to
the right, three titles wrap onto a second line, and everything below LATEST
drops 62px. James: "very distracting". The cause is measured, not inferred:
each row's unread square is rendered only once `/api/article-reads` has
settled, and on the phone that fetch is a real round trip, so the rower sees
the page twice — once without the squares' column and once with it.

This spec does two things. **It reserves the square's column from the first
paint**, so the settled frame lands on top of the loading frame with no
geometry change, in both orientations (measured §4). **And it remembers the
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
- **What this repo already settled** (`grep -rn "final height" app/src`):
  News gates its scroll restore on the fetch settling *because* the loading
  frame's height was unknown (`News.tsx:135`, `News.test.tsx:259`). §2 makes
  the loading frame the settled frame's height for every current title; the
  gate stays (a ` · READ` suffix or a 500→400 weight change can still wrap a
  future title) and its comment is corrected to say what it now guards.

## 2. Reserve the gutter (`News.tsx`)

**Invariant G1.** A row's geometry does not depend on whether its read state
is known. The square element renders on every row in every reads state; only
its `data-read` attribute waits for a known state.

Today `ArticleRow` renders `.news-square` only when `readStateFor` returns a
boolean. After: the `<span className="news-square" aria-hidden="true">` is
unconditional, `data-read` is set only when `isRead !== undefined`. The base
`.news-square` rule is already page-coloured with a transparent border, so a
square without `data-read` paints nothing — identical to a read one. No CSS
change.

**What does not change.** The suppression rule from Phase 6H ("never claim a
wrong number") is untouched at every text site: the accessible Read/Unread
word, the ` · READ` meta suffix, the row's own `data-read`, and the
`N UNREAD` count all still render only on `ready`. An attribute-less square is
`aria-hidden`, colourless, and claims nothing. The `error` state gets the same
invisible gutter as `loading`.

**Measured (§4 probe, 390×844 and 844×390, current build):** with a 10px
`flex: none` gutter injected on the loading frame, every row's `y` equals the
settled frame's — portrait `137,252,318,463,551,638,726` both, landscape
`137,231,298,442,509,597,663` both. Reserving the gutter is the whole vertical
fix. The unread count adds no height (the title row's box is unchanged in the
before/after diff). The read-row weight change (500→400) changes no title's
line count at 302px for any current title (`h500 === h400` on all seven).

## 3. Remember the reads (`useArticleReads.ts`)

**Invariant C1 (warm mount).** A mount that follows a successful read of
`/api/article-reads` in this document renders `ready` synchronously from the
last known set, then refetches.

**Invariant C2 (writes are visible everywhere, at once).** `markRead` and
`markUnread` update the last known set before their request is sent, and
every mounted instance sees the new set in the same tick.

**Invariant C3 (a late read never undoes a write).** A GET response that
arrives while any write is in flight is discarded, not applied. The barrier
already guarantees a mount's GET is *issued* after every write that preceded
it has settled; C3 covers the only other ordering — a write that starts after
the GET was issued — and it costs a reconcile that the next mount performs.

**Invariant C4 (the cache never outlives the account).** `signOut()` in
`adapters/auth.tsx` clears the cache before it signs out, on both platforms;
and a GET that returns non-OK (a 401 from a session the server no longer
honours) clears it and reports `error`. A network failure with a warm cache
keeps showing the cache — that is the case it exists for.

**Invariant C5 (cold behaviour is today's behaviour).** With no last known
set — first mount of the document, or after C4 clears it — the hook is
byte-for-byte today's: `loading`, then `ready` or `error`, and `markRead` is a
no-op until `ready`.

### Lifetime table (RF27)

| State | Scope | Minted | Updated | Cleared | Survives |
|---|---|---|---|---|---|
| `lastKnown: ReadonlySet<string> \| null` | module | first OK GET in this document | every OK GET with no write in flight (C3); every `markRead`/`markUnread` (C2) | `signOut()`; any non-OK GET (C4) | route changes and re-mounts; NOT reload, relaunch or a new document |
| `listeners: Set<(s) => void>` | module | — | add on mount, delete on unmount | — | — |
| `pendingWrites` | module | existing (2026-08-12) | existing | existing | existing |
| per-instance `state` | hook | `lastKnown ? ready : loading` | via its listener, or the error path | unmount | — |

### Mechanism, in one paragraph

`markRead` and `markUnread` become module functions over `lastKnown` (they were
closures over a per-effect `currentSlugs`; the StrictMode purity note on the
`setState` updater still holds because the side effects still happen outside
the updater — `publish` sets `lastKnown` and calls each listener, and each
listener's `setState` receives a value, not an updater). The `ready` state's
two function fields are these stable module functions. The mount effect
subscribes a listener, runs the existing barrier, issues the GET, and on an OK
response either publishes the reconciled set or, per C3, drops it when
`pendingWrites.size > 0`.

### Who consumes it

`News.tsx` and `Reader.tsx` (the only two consumers, `grep -rln useArticleReads
app/src`). Reader's mark-read effect is keyed on `reads.state` and the slug;
with a warm cache `reads.state` is `ready` on first render, so the mark fires
one render earlier than today and through the same guard. `markUnread` has no
production caller (Phase 6I's "MARK ALL FOUR UNREAD" was removed; the function
and its tests stay as they are).

## 4. Gates, and what mutates each

Every gate names the mutation that turns it red (RF21), in the plan.

- **Client — `News.test.tsx`.** The `loading` and `error` cases assert seven
  `.news-square` elements with no `data-read` attribute, and still no count,
  no READ suffix, no accessible word. The linked-row test likewise. Mutation:
  restore the `isRead !== undefined &&` conditional — square count goes 7→0.
- **Hook — `useArticleReads.test.ts`.** C1: mount, resolve, unmount, mount
  again — second `result.current.state` is `ready` on the first read, and the
  GET count reaches 2. Mutation: don't seed `useState` from `lastKnown` — it
  reads `loading`. C2: two mounted instances, `markRead` on one, the other's
  set has the slug before any promise resolves. Mutation: skip `publish` in
  `markRead` — the other instance never updates. C3: warm mount, hold its GET,
  `markRead` a slug, release the GET with the pre-write set — the slug stays
  read. Mutation: apply the GET regardless — the slug flips back. C4: mount,
  resolve, `clearArticleReadsCache()`, mount — `loading`; and a warm mount
  whose GET returns 401 ends `error` with the next mount cold. Mutation: skip
  the clear — `ready`. C5: the existing loading/error/barrier tests, unchanged
  except the failed-write barrier test, which now waits for the reconciling
  GET before asserting `false` (the cache legitimately shows the optimistic
  guess until the server answers — the same thing screen one already shows).
- **Adapter — `adapters/auth.test.tsx`.** `signOut()` calls the clear on both
  arms. Mutation: drop the call.
- **e2e — `news.spec.ts`, the layout-shift gate.** Hold `**/api/article-reads`
  with `page.route`, open `/news`, read every `.news-row` and the
  `.news-whatsnew` bounding box, release, wait for `.news-unread-count`, read
  again: equal. Mutation: the same conditional restore as the client test,
  built into the stack (RF12 corollary: the mutant must compile and the build
  must be seen to succeed) — the boxes differ by 21px on three rows.
- **Not gated, said aloud:** the first-open-per-launch pop of the count and
  squares is by design (§What and why); the read-row weight change is
  measured for current titles only, and the scroll-restore gate stays because
  of it.

## 5. Design gate (Gate 0)

`docs/design/news-shift-gate0/` — six captures at 2× from the current build,
390×844 and 844×390: `1-loading-today` (rows flush left, no gutter),
`2-loading-gutter` (the loading frame with the reserved column, produced by
injecting the exact 10px `flex: none` gutter, row `y`s equal to the settled
frame in both orientations), `3-settled` (today's settled frame, unchanged by
this spec). No colour pairing changes, so no new contrast ratio: the
attribute-less square paints `--page` on `--page`, which is the read square's
existing rendering.

## 6. Out of scope

- Persisting read state across launches (localStorage): a stored shape and the
  reintroduction of the stale-count window the barrier exists to close, for
  one frame per launch. Declined 2026-09-12.
- Hiding rows until the fetch settles: trades a shift for a blank.
- Relaxing the scroll-restore gate: §1's last bullet.
