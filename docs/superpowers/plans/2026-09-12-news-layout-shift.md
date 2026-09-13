# News layout shift — implementation plan

> **For agentic workers:** this plan was executed INLINE by its author under
> the accepted shape (James, 2026-09-04: the plan author paste-tests every
> block, so a transcribing subagent adds nothing). Every code block below is
> the code that landed, commit by commit; the checkboxes record what was run.
> Only the REVIEW half is dispatched. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the News tab paints the same geometry before and after the
article-reads fetch settles, and every mount after the first in a document
renders its read state immediately from memory.

**Architecture:** two product changes and one seam. `ArticleRow` renders the
unread square unconditionally with `data-read` set only when known (§2 of the
spec). `useArticleReads` gains a module-level last-known set beside its
existing read-after-write barrier, with a write epoch that lets a GET tell
whether a write overtook it (§3). `useMe` clears that set at every transition
to signed-out through one helper (§3 C4). One e2e gate measures the frame
before and after the fetch on a cold document with one article read (§4).

**Tech Stack:** React 19, Vitest (client project, jsdom), Playwright against
the per-worktree compose stack.

**Spec:** `docs/superpowers/specs/2026-09-12-news-layout-shift-design.md`
(revision 2, hardened). Gate 0: `docs/design/news-shift-gate0/`.

## Global Constraints

- Not TRIAD; not fast path (three product files). Antagonist pass done on the
  spec; no PM gate; DBA skip. Review half dispatched after Task 4.
- Every new assertion has a named mutation that made it fail (RF21), run
  against the COMMITTED file (RF22) and restored with `git checkout`.
- `git rev-parse --show-toplevel` before every commit prints
  `/Users/james/projects/github/jamesawesome/Ergomatic-news-shift`.
- Scoped Vitest runs use
  `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`.
- No CSS change. No copy change. No screenshots committed (the settled frame
  is unchanged; the loading frame is the Gate 0 capture).

---

### Task 1: Reserve the square's column (`News.tsx`)

**Files:**
- Modify: `app/src/news/News.tsx` (`ArticleRow`'s `square`, and the comment
  above `contentSettled`)
- Test: `app/src/news/News.test.tsx` (loading, error, linked-row cases)

**Interfaces:** none new. `ArticleRow`'s props are unchanged.

- [x] **Step 1: the failing tests** — the `loading` and `error` cases assert
  seven `.news-square`, zero `.news-square[data-read]`, zero
  `.news-row[data-read]`, no `UNREAD`, no `\bREAD\b`, no accessible
  Read/Unread word; the linked-row case asserts one square, no attribute.
- [x] **Step 2: run red** — `Tests 3 failed | 15 passed (18)`, each
  `expected to have a length of 7 but got +0` (or 1 for the linked row).
- [x] **Step 3: implement**

```tsx
  const square = (
    <span className="news-square" data-read={isRead} aria-hidden="true" />
  );
```

  (`isRead` is `boolean | undefined`; React omits the attribute for
  `undefined`.) The comment above `contentSettled` is rewritten to describe
  the warm-mount behaviour the spec accepts (restore lands on the first frame
  whose read state is known, from memory or the fetch).
- [x] **Step 4: run green** — `Tests 18 passed (18)`.
- [x] **Step 5: commit** — `8f1109cc`.
- [x] **Mutation** — restoring `isRead !== undefined &&` is exactly the
  pre-change code, whose run in Step 2 is the red.

### Task 2: The last-known set (`useArticleReads.ts`)

**Files:**
- Modify: `app/src/api/useArticleReads.ts`
- Test: `app/src/api/useArticleReads.test.ts`

**Interfaces:**
- Produces: `export function clearArticleReadsCache(): void` (Task 3 consumes
  it). `ArticleReadsState` is unchanged; `markRead`/`markUnread` on the
  `ready` variant are now stable module functions.

- [x] **Step 1: the failing tests** — six new cases in a `last-known cache`
  describe block (C1 warm mount, C2 cross-instance write, C3 the settled-write
  interleaving with a held GET, C4 explicit clear, C4 non-OK GET, network
  failure keeps the cache), plus the barrier's failed-write test renamed to
  *"a failed write is corrected by the next reconciling read, never by a local
  guess"*, asserting the optimistic `true` first and the reconciled `false`
  after the third API call.
- [x] **Step 2: run red** — `Tests 7 failed | 10 passed (17)`.
- [x] **Step 3: implement** — module state and functions:

```ts
let lastKnown: ReadonlySet<string> | null = null;
let writeEpoch = 0;
const listeners = new Set<(slugs: ReadonlySet<string>) => void>();

function publish(next: ReadonlySet<string>): void {
  lastKnown = next;
  for (const listener of listeners) listener(next);
}

export function clearArticleReadsCache(): void {
  lastKnown = null;
}

function markRead(slug: string): void {
  if (lastKnown === null || lastKnown.has(slug)) return;
  const next = new Set(lastKnown);
  next.add(slug);
  writeEpoch++;
  trackWrite(
    api(`/api/article-reads/${slug}`, { method: "PUT" }).catch(() => {}),
  );
  publish(next);
}
// markUnread mirrors it with DELETE and `!lastKnown.has(slug)`.

async function fetchOnce(): Promise<"applied" | "stale" | "refused"> {
  await settlePendingWrites();
  const issuedAt = writeEpoch;
  const res = await api("/api/article-reads");
  if (!res.ok) return "refused";
  const { slugs } = (await res.json()) as { slugs: string[] };
  if (writeEpoch !== issuedAt) return "stale";
  publish(new Set(slugs));
  return "applied";
}
```

  and the hook:

```ts
export function useArticleReads(): ArticleReadsState {
  const [state, setState] = useState<ArticleReadsState>(() =>
    lastKnown === null ? { state: "loading" } : readyFrom(lastKnown),
  );
  useEffect(() => {
    let cancelled = false;
    const listener = (slugs: ReadonlySet<string>) => {
      setState(readyFrom(slugs));
    };
    listeners.add(listener);
    void (async () => {
      try {
        let outcome = await fetchOnce();
        if (outcome === "stale") outcome = await fetchOnce();
        if (outcome === "refused") {
          clearArticleReadsCache();
          if (!cancelled) setState({ state: "error" });
        }
      } catch {
        if (!cancelled && lastKnown === null) setState({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);
  return state;
}
```

- [x] **Step 4: run green** — hook file + `src/news`: `Tests 116 passed`.
- [x] **Step 5: commit** — `094f60d1`.
- [x] **Mutations, each against the committed file, each restored:**

| mutation | kills |
|---|---|
| A: `if (pendingWrites.size > 0) return "stale"` in place of the epoch compare | C3 |
| B: delete the one retry | C3 |
| seed `useState` with `{ state: "loading" }` always | C1, C3, both C4, network, the renamed failed-write test, and `loads read slugs` |
| `markRead` sets `lastKnown` without `publish` | C2, C3, and the two existing optimistic-PUT tests |
| `refused` without `clearArticleReadsCache()` | C4 (non-OK) |
| `publish(lastKnown ?? new Set(slugs))` — apply the guess as truth | the renamed failed-write test |

### Task 3: Clear at the signed-out transition (`useMe.ts`)

**Files:**
- Modify: `app/src/useMe.ts`
- Test: `app/src/useMe.test.ts`

**Interfaces:**
- Consumes: `clearArticleReadsCache` from Task 2.
- Produces: nothing new; `useMe`'s tuple is unchanged.

- [x] **Step 1: the failing tests** — `vi.mock("./api/useArticleReads")` with
  a spy; three cases: thrown fetch clears once, non-OK clears once,
  `signedOut()` clears once after an `in` state and not before.
- [x] **Step 2: run red** — `Tests 3 failed | 1 passed (4)`.
- [x] **Step 3: implement**

```ts
  const becomeSignedOut = () => {
    clearArticleReadsCache();
    setMe({ state: "out" });
  };
  const signedOut = becomeSignedOut;
  // ...and both `setMe({ state: "out" })` sites in the effect become
  // `becomeSignedOut()` — one `setMe({ state: "out" })` remains in the file.
```

- [x] **Step 4: run green** — `useMe` + `App`: `Tests 9 passed (9)`.
- [x] **Step 5: commit** — `ab8a3d45`.
- [x] **Mutation** — route the non-OK arm back to a bare
  `setMe({ state: "out" })`: kills *"a non-OK /api/me signs out AND clears"*.

### Task 4: The e2e layout-shift gate (`news.spec.ts`)

**Files:**
- Test: `app/e2e/news.spec.ts` (one appended test; imports
  `stableBoundingBox` from `./helpers`)

- [x] **Step 1: the test** — sign in; `page.goto("/news/effort-scale")` to
  mark one read on the server; `page.route("**/api/article-reads")` held on a
  promise; `page.goto("/news")` (new document, cold cache); assert the loading
  frame: seven `.news-square`, zero `[data-read]`, zero `.news-unread-count`;
  read every `.news-row` box and the `.news-whatsnew` box via
  `stableBoundingBox`; release; wait for `6 UNREAD` and the effort-scale row's
  `data-read="true"`; read again; `expect(after).toEqual(before)`.
- [x] **Step 2: run against this worktree's stack** —
  `pnpm e2e news.spec.ts` in `app/` booted `ergomatic-27821` (web :8321) with
  `--build`: `12 passed`, including the new gate.
- [x] **Step 3: mutations, each built into the stack** (each run's log shows
  two `built in Nms` lines — web and api — before the result, RF12 corollary;
  each restored with `git checkout` and followed by a clean rebuild that
  passed 12/12):

| mutation | red on |
|---|---|
| E1: restore `isRead !== undefined &&` before the square (`News.tsx`) | the loading-frame precondition — `.news-square` expected 7, received 0 |
| E2: remove the `page.route` hold from the test | the loading-frame precondition — `[data-read]` expected 0, received 7 (a warm or unheld fetch cannot make the gate vacuous) |
| E3: append `.news-square:not([data-read]) { display: none }` to `index.css` — squares present, column not reserved | the box comparison — three rows `height` 66.8→87.6, `y` +21/+21/+42 |

- [x] **Step 4: commit** — `25ed2207` (gate + this plan).

### Task 5: Review half, PR, hand-back

- [ ] Full `pnpm lint`, `pnpm typecheck`, `pnpm test --project unit --project client`.
- [ ] Dispatch the code review (fresh reviewer, the spec and this plan as the
  brief). Fold findings; re-run the scoped gates.
- [ ] Open the PR (human-first body; Record block with the mutation table and
  the e2e run), then the ROADMAP hand-back: proposed rows (none expected) and
  every row whose `dies` date has passed. Stop for James.
