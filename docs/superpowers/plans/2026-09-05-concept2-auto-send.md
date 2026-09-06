# Wave E auto-send — OFF · MANUAL · AUTOMATIC: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A per-rower sending mode on the Concept2 link — OFF (unlinked), MANUAL (today's per-row Send), AUTOMATIC (the Send button pressed for you right after a row saves) — with the You row and the card warning when sends are failing for want of a weight class.

**Architecture:** One boolean and one sticky failure pair on `concept2_links`; one `PATCH /api/concept2/link`; the upload route sets/clears the flag and carries a per-row in-flight claim; the card's Unlink button becomes a three-segment `aria-pressed` control with the mode line beneath; `useLogForm`'s 201 path takes one fresh link read and, when AUTOMATIC, posts the manual site's exact request. Nothing new is shown at save time (silent, ruling A).

**Tech Stack:** Express 5 + Drizzle/Postgres (migration 0024), React 19, Vitest (unit/client/integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md` rev 4 (rev 1 full antagonist pass, rev 2 delta pass, rev 3 Gate 0 approved, rev 4 records the two as-built mechanisms). Gate 0: `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html`, APPROVED by James 2026-09-05 after one fix on sight (armed OFF spans the control).

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2auto`, branch `wave-e-c2-autosend`, base `be7afe2f` (the Gate 0 commit; main `2472133a` merged beneath it). All commands from its `app/`.

**HOW THIS PLAN WAS PRODUCED, AND WHAT EXECUTION MEANS HERE.** The whole diff below was written as the author's paste-test (agent-briefing, "Plan authoring") at `be7afe2f`, typechecked, linted, run through every gate named under "Gates", and its sixteen mutations measured with the failure text recorded verbatim — THEN committed as the six task-shaped commits this plan indexes (`9a73a8a9 … c70b1dfa`). Execution therefore does not re-transcribe the code: each task's commit IS its implementation, and the SDD loop spends its seats on what it is for — a task reviewer per task against the brief and the commit's diff, one whole-branch final review, the PM gate. **Ruling (controller, 2026-09-05):** re-typing 2,900 green, probe-measured lines through a transcriber buys a second copy of the same diff and nothing else; the reviews are the value. Cost if wrong: a reviewer finding rework lands as a fix commit on top rather than inside a task's own commit — the same shape every fix round already has.

## Global Constraints

- **TRIAD** (stored shape; a number leaves on a trigger nobody tapped): full antagonist pass on the spec (done, revs 1-3); the plan takes `/harden`; the PR takes the PM final gate. Lands alone.
- **Rulings (James, 2026-09-05), verbatim from the spec:** OFF = unlinked; AUTOMATIC is silent at save time, outcome on the row's block; a fresh link lands in MANUAL; no backlog send; client-side after the save; failures surface on the You row via a sticky flag; ONLY `no_weight_class` sets it; Gate 0 approved as drawn plus "Tap again to unlink" spanning the control.
- **A2 fail-closed:** only a literal `true` on the wire is AUTOMATIC — server (400 on anything but a boolean), client (`=== true`), and the send decision (`!link.autoSend` → nothing).
- **The wire shape of the send is the manual site's, verbatim:** `POST /api/concept2/results/:logId`, `Content-Type: application/json`, body `{ tz }`. Every gate on a send reads the parsed body and the header, never a count alone.
- **Precedence everywhere it renders:** RECONNECT NEEDED > SEND FAILED > LINKED ✓ (row state, card pill, mode line), both sticky states beating a transient read failure on the row.
- **Copy is Gate 0's** (§1a, §3, §4a, A7) — quoted in Task 3; no em-dashes in user-facing strings.
- **RF22:** commit before mutating (done); every anchor `grep -c` = 1 (the runner refuses otherwise); `git checkout -- <file>` to restore.
- **`NODE_OPTIONS=--no-experimental-webstorage`** on every bare vitest call.

## Gates (run on the full six-commit tree, `c70b1dfa`)

| gate | result |
| --- | --- |
| `pnpm lint` | clean (eslint + suppression census) |
| `pnpm typecheck` | clean, e2e membership 20/20 |
| `pnpm test --project unit --project client` | 7,169 tests: 9 failed before Task 4's count fixes (`ReviewSession`, `WorkoutDetail.connectedRecovery`, `WorkoutDetail.postReleaseCommit`), then those three suites 107 passed; the full run is re-taken in Task 7 |
| `pnpm test --project integration -- server/stores/concept2.integration.test.ts` | 25 files, 383 passed (the project runs every integration file) |
| `pnpm build && pnpm dist:grep` | OK — none of the 8 dev-only markers in `dist/client` |
| `bash scripts/e2e.sh e2e/concept2.spec.ts e2e/design.spec.ts -g "Concept2\|concept2\|c2-card\|C2"` | 43 passed |
| `playwright test --project=screenshots -g "concept2\|you-concept2"` | 16 passed |

Mutations M1-M16 are listed under the task whose invariant each protects; all measured against the committed tree.

---

## Task 1: the stored shape — `auto_send` and `send_failed_*` on `concept2_links`

**Commit:** `9a73a8a9`.

**Files:** `app/server/db/schema.ts`, `app/drizzle/0024_boring_black_panther.sql` + `app/drizzle/meta/{_journal.json,0024_snapshot.json}` (generated by `pnpm db:generate`, header added by hand), `app/server/stores/concept2.ts`, `app/server/testing/fakes.ts`, `app/server/stores/concept2.integration.test.ts`.

**Interfaces produced:** `Concept2Link` (store) gains `autoSend: boolean`, `sendFailedAt: Date | null`, `sendFailedReason: string | null`; `Concept2Store` gains `setAutoSend(userId, autoSend): Promise<boolean>` (true iff a linked row was updated), `setSendFailed(userId, reason): Promise<void>`, `clearSendFailed(userId): Promise<void>`. The fake mirrors all three and the upsert's mode rule.

**Invariants (spec §3.1, §3.5):** a fresh link lands in MANUAL (`auto_send` default false, NOT NULL); a relink by the SAME Concept2 account keeps the mode, a relink by a DIFFERENT account resets it to MANUAL (the `CASE … excluded.c2_user_id` in the upsert); every relink clears the flag; unlink deletes the row and with it both. Lifetime table: `auto_send` — minted at link (false), written only by `PATCH /link`, cleared by unlink, survives relaunch and re-auth (a row, not a session). `send_failed_*` — set only by the upload route's eligible `no_weight_class` exit, cleared by the three at-Concept2 exits and by every relink, survives relaunch, dies with the row.

**Tests (integration, Docker):** the describe "auto_send / send_failed_* (Wave E auto-send)" — 7 tests: default false; setAutoSend flips and returns true / false when unlinked; same-account relink keeps the mode; different-account relink resets it; relink clears the flag; setSendFailed stores the instant and sub-reason; clearSendFailed nulls both. Suite: 31 passed.

**Corrected after commit (review fix rounds, `cfb99c98` / `4bfe26f3`):** the column comments in this task's `schema.ts` and `stores/concept2.ts` blocks name THREE sub-reasons; the committed source names all four (`implausible_weight` included) and types `setSendFailed`'s `reason` as `WeightClassFailure` from `server/concept2/mapping.ts` — read the diff below as the history, the head as the code.

**Mutation (measured):**

| # | mutation | failure |
| --- | --- | --- |
| M1 | upsert `autoSend` CASE → always `${concept2Links.autoSend}` (mode survives an account change) | `a relink to a DIFFERENT Concept2 account resets to MANUAL (the CASE's ELSE branch; F7)` — `expected true to be false` (integration, 1 failed / 30 passed) |

- [ ] **Step 1: the commit is the implementation.** Review package: `git show 9a73a8a9` (stat below). Reviewer: brief = this task's section; diff = the commit; gates = the suites named above, re-run from `app/`.

```
9a73a8a9 Auto-send: auto_send and send_failed_* on concept2_links (store, migration 0024)

 app/drizzle/0024_boring_black_panther.sql      |   20 +
 app/drizzle/meta/0024_snapshot.json            | 1162 ++++++++++++++++++++++++
 app/drizzle/meta/_journal.json                 |    9 +-
 app/server/db/schema.ts                        |   18 +
 app/server/stores/concept2.integration.test.ts |   90 ++
 app/server/stores/concept2.ts                  |   71 +-
 app/server/testing/fakes.ts                    |   37 +
 7 files changed, 1405 insertions(+), 2 deletions(-)
```

<details>
<summary>The diff, verbatim (<code>git show 9a73a8a9</code>)</summary>

```diff
diff --git a/app/drizzle/0024_boring_black_panther.sql b/app/drizzle/0024_boring_black_panther.sql
new file mode 100644
index 00000000..453d389f
--- /dev/null
+++ b/app/drizzle/0024_boring_black_panther.sql
@@ -0,0 +1,20 @@
+-- Wave E auto-send (spec docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md
+-- §3.1; Gate 0 amendment-2026-09-05-autosend.html approved 2026-09-05 — TRIAD:
+-- two stored shapes on the link row, and a number leaving for a third party on
+-- a trigger nobody tapped). One deploy, three additive columns, no backfill:
+--   * ADD `concept2_links.auto_send` (boolean NOT NULL DEFAULT false). The
+--     rower's sending mode: false = MANUAL, true = AUTOMATIC. The DEFAULT is
+--     ruling 3 (a fresh link lands in MANUAL) and makes every existing link
+--     MANUAL without a backfill.
+--   * ADD `concept2_links.send_failed_at` (timestamptz NULL) and
+--     `send_failed_reason` (text NULL). The sticky "sends are failing" flag —
+--     set by the send route only on an eligible send's `no_weight_class`
+--     (reason = the route's sub-reason), cleared on every outcome that leaves
+--     the row at Concept2 and on every relink.
+-- ROLLBACK FLOOR (docs/RELEASING.md): the previous server ignores these columns
+-- (Drizzle selects by name); the new server against a DB without them fails at
+-- first link read — so this migration runs ahead of the deploy, as every
+-- additive column here has. Rollback-safe in both directions.
+ALTER TABLE "concept2_links" ADD COLUMN "auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
+ALTER TABLE "concept2_links" ADD COLUMN "send_failed_at" timestamp with time zone;--> statement-breakpoint
+ALTER TABLE "concept2_links" ADD COLUMN "send_failed_reason" text;
\ No newline at end of file
diff --git a/app/drizzle/meta/0024_snapshot.json b/app/drizzle/meta/0024_snapshot.json
new file mode 100644
index 00000000..8269abdd
--- /dev/null
+++ b/app/drizzle/meta/0024_snapshot.json
@@ -0,0 +1,1162 @@
+{
+  "id": "c6a00c44-2ea4-4488-ae95-bc68af35d7ff",
+  "prevId": "9f2990a5-7602-40d0-b433-e01a3c7bfc1c",
+  "version": "7",
+  "dialect": "postgresql",
+  "tables": {
+    "public.article_reads": {
+      "name": "article_reads",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "read_at": {
+          "name": "read_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "article_reads_user_id_users_id_fk": {
+          "name": "article_reads_user_id_users_id_fk",
+          "tableFrom": "article_reads",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {
+        "article_reads_user_id_slug_pk": {
+          "name": "article_reads_user_id_slug_pk",
+          "columns": [
+            "user_id",
+            "slug"
+          ]
+        }
+      },
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.baselines": {
+      "name": "baselines",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "k2_seconds": {
+          "name": "k2_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "k6_seconds": {
+          "name": "k6_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "k2_source": {
+          "name": "k2_source",
+          "type": "baseline_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'manual'"
+        },
+        "k6_source": {
+          "name": "k6_source",
+          "type": "baseline_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'manual'"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "baselines_user_id_users_id_fk": {
+          "name": "baselines_user_id_users_id_fk",
+          "tableFrom": "baselines",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.concept2_auth_attempts": {
+      "name": "concept2_auth_attempts",
+      "schema": "",
+      "columns": {
+        "nonce": {
+          "name": "nonce",
+          "type": "text",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "surface": {
+          "name": "surface",
+          "type": "link_surface",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'web'"
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "concept2_auth_attempts_user_id_users_id_fk": {
+          "name": "concept2_auth_attempts_user_id_users_id_fk",
+          "tableFrom": "concept2_auth_attempts",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "concept2_auth_attempts_user_id_unique": {
+          "name": "concept2_auth_attempts_user_id_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "user_id"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.concept2_links": {
+      "name": "concept2_links",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "c2_user_id": {
+          "name": "c2_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "c2_username": {
+          "name": "c2_username",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "access_token": {
+          "name": "access_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "refresh_token": {
+          "name": "refresh_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "needs_reauth_at": {
+          "name": "needs_reauth_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "auto_send": {
+          "name": "auto_send",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "send_failed_at": {
+          "name": "send_failed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "send_failed_reason": {
+          "name": "send_failed_reason",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "concept2_links_user_id_users_id_fk": {
+          "name": "concept2_links_user_id_users_id_fk",
+          "tableFrom": "concept2_links",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "concept2_links_c2_user_id_unique": {
+          "name": "concept2_links_c2_user_id_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "c2_user_id"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.plan_state": {
+      "name": "plan_state",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "plan_key": {
+          "name": "plan_key",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "done_n": {
+          "name": "done_n",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "plan_state_user_id_users_id_fk": {
+          "name": "plan_state_user_id_users_id_fk",
+          "tableFrom": "plan_state",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {
+        "plan_state_plan_key_check": {
+          "name": "plan_state_plan_key_check",
+          "value": "\"plan_state\".\"plan_key\" is null or \"plan_state\".\"plan_key\" in ('sprint', 'head')"
+        }
+      },
+      "isRLSEnabled": false
+    },
+    "public.preferences": {
+      "name": "preferences",
+      "schema": "",
+      "columns": {
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "difficulties": {
+          "name": "difficulties",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'[\"easy\",\"medium\",\"hard\"]'::jsonb"
+        },
+        "time_cap_minutes": {
+          "name": "time_cap_minutes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 60
+        },
+        "countdown_seconds": {
+          "name": "countdown_seconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 10
+        },
+        "pace_tolerance_seconds": {
+          "name": "pace_tolerance_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1
+        },
+        "accent_color": {
+          "name": "accent_color",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'#b5341f'"
+        },
+        "start_here_dismissed": {
+          "name": "start_here_dismissed",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "preferences_user_id_users_id_fk": {
+          "name": "preferences_user_id_users_id_fk",
+          "tableFrom": "preferences",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.session_logs": {
+      "name": "session_logs",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "workout_id": {
+          "name": "workout_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "workout_title": {
+          "name": "workout_title",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "workout_type": {
+          "name": "workout_type",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "logged_at": {
+          "name": "logged_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "baseline_k2": {
+          "name": "baseline_k2",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "baseline_k6": {
+          "name": "baseline_k6",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "held": {
+          "name": "held",
+          "type": "held_result",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "pain": {
+          "name": "pain",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "notes": {
+          "name": "notes",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "steps": {
+          "name": "steps",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "device_name": {
+          "name": "device_name",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "source": {
+          "name": "source",
+          "type": "log_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "thumbs": {
+          "name": "thumbs",
+          "type": "thumbs",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "avg_split_seconds": {
+          "name": "avg_split_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "distance_meters": {
+          "name": "distance_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "time_seconds": {
+          "name": "time_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "plan_key": {
+          "name": "plan_key",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "plan_index": {
+          "name": "plan_index",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "series": {
+          "name": "series",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "ended_by": {
+          "name": "ended_by",
+          "type": "ended_by",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "work_seconds": {
+          "name": "work_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "work_meters": {
+          "name": "work_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "rest_seconds": {
+          "name": "rest_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "rest_meters": {
+          "name": "rest_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "machine_work_seconds": {
+          "name": "machine_work_seconds",
+          "type": "double precision",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "machine_work_meters": {
+          "name": "machine_work_meters",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "machine_summary": {
+          "name": "machine_summary",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "c2_result_id": {
+          "name": "c2_result_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "c2_user_id": {
+          "name": "c2_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "completed_at": {
+          "name": "completed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tz": {
+          "name": "tz",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "session_logs_user_id_idx": {
+          "name": "session_logs_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "session_logs_user_id_users_id_fk": {
+          "name": "session_logs_user_id_users_id_fk",
+          "tableFrom": "session_logs",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "session_logs_workout_id_workouts_id_fk": {
+          "name": "session_logs_workout_id_workouts_id_fk",
+          "tableFrom": "session_logs",
+          "tableTo": "workouts",
+          "columnsFrom": [
+            "workout_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {
+        "session_logs_pain_check": {
+          "name": "session_logs_pain_check",
+          "value": "\"session_logs\".\"pain\" between 1 and 5"
+        }
+      },
+      "isRLSEnabled": false
+    },
+    "public.sessions": {
+      "name": "sessions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "token_hash": {
+          "name": "token_hash",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        }
+      },
+      "indexes": {
+        "sessions_user_id_idx": {
+          "name": "sessions_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "sessions_user_id_users_id_fk": {
+          "name": "sessions_user_id_users_id_fk",
+          "tableFrom": "sessions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "sessions_token_hash_unique": {
+          "name": "sessions_token_hash_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "token_hash"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.test_history": {
+      "name": "test_history",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "distance": {
+          "name": "distance",
+          "type": "test_distance",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "split_seconds": {
+          "name": "split_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "delta_seconds": {
+          "name": "delta_seconds",
+          "type": "real",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "logged_at": {
+          "name": "logged_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "session_log_id": {
+          "name": "session_log_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "test_history_user_id_idx": {
+          "name": "test_history_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "test_history_user_id_users_id_fk": {
+          "name": "test_history_user_id_users_id_fk",
+          "tableFrom": "test_history",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "test_history_session_log_id_session_logs_id_fk": {
+          "name": "test_history_session_log_id_session_logs_id_fk",
+          "tableFrom": "test_history",
+          "tableTo": "session_logs",
+          "columnsFrom": [
+            "session_log_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "test_history_session_log_id_unique": {
+          "name": "test_history_session_log_id_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "session_log_id"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.users": {
+      "name": "users",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "google_sub": {
+          "name": "google_sub",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "email": {
+          "name": "email",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "users_google_sub_unique": {
+          "name": "users_google_sub_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "google_sub"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workouts": {
+      "name": "workouts",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "uuid",
+          "primaryKey": true,
+          "notNull": true,
+          "default": "gen_random_uuid()"
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "uuid",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sort_order": {
+          "name": "sort_order",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "title": {
+          "name": "title",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "type": {
+          "name": "type",
+          "type": "workout_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "difficulty": {
+          "name": "difficulty",
+          "type": "difficulty",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "pain": {
+          "name": "pain",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "source": {
+          "name": "source",
+          "type": "workout_source",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "steps": {
+          "name": "steps",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workouts_user_id_idx": {
+          "name": "workouts_user_id_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workouts_user_id_users_id_fk": {
+          "name": "workouts_user_id_users_id_fk",
+          "tableFrom": "workouts",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {
+        "workouts_pain_check": {
+          "name": "workouts_pain_check",
+          "value": "\"workouts\".\"pain\" between 1 and 5"
+        }
+      },
+      "isRLSEnabled": false
+    }
+  },
+  "enums": {
+    "public.baseline_source": {
+      "name": "baseline_source",
+      "schema": "public",
+      "values": [
+        "manual",
+        "estimated",
+        "derived",
+        "tested"
+      ]
+    },
+    "public.difficulty": {
+      "name": "difficulty",
+      "schema": "public",
+      "values": [
+        "easy",
+        "medium",
+        "hard"
+      ]
+    },
+    "public.ended_by": {
+      "name": "ended_by",
+      "schema": "public",
+      "values": [
+        "finished",
+        "rower",
+        "link-lost",
+        "program-failed",
+        "program-dropped",
+        "interrupted"
+      ]
+    },
+    "public.held_result": {
+      "name": "held_result",
+      "schema": "public",
+      "values": [
+        "held",
+        "under",
+        "over"
+      ]
+    },
+    "public.link_surface": {
+      "name": "link_surface",
+      "schema": "public",
+      "values": [
+        "native",
+        "web"
+      ]
+    },
+    "public.log_source": {
+      "name": "log_source",
+      "schema": "public",
+      "values": [
+        "pm5",
+        "timer",
+        "manual",
+        "no-reading"
+      ]
+    },
+    "public.test_distance": {
+      "name": "test_distance",
+      "schema": "public",
+      "values": [
+        "2k",
+        "6k"
+      ]
+    },
+    "public.thumbs": {
+      "name": "thumbs",
+      "schema": "public",
+      "values": [
+        "up",
+        "down"
+      ]
+    },
+    "public.workout_source": {
+      "name": "workout_source",
+      "schema": "public",
+      "values": [
+        "starter",
+        "user"
+      ]
+    },
+    "public.workout_type": {
+      "name": "workout_type",
+      "schema": "public",
+      "values": [
+        "AN",
+        "O2",
+        "AT",
+        "TR"
+      ]
+    }
+  },
+  "schemas": {},
+  "sequences": {},
+  "roles": {},
+  "policies": {},
+  "views": {},
+  "_meta": {
+    "columns": {},
+    "schemas": {},
+    "tables": {}
+  }
+}
\ No newline at end of file
diff --git a/app/drizzle/meta/_journal.json b/app/drizzle/meta/_journal.json
index 8263a01e..9c7a5d0d 100644
--- a/app/drizzle/meta/_journal.json
+++ b/app/drizzle/meta/_journal.json
@@ -169,6 +169,13 @@
       "when": 1788454715802,
       "tag": "0023_married_patch",
       "breakpoints": true
+    },
+    {
+      "idx": 24,
+      "version": "7",
+      "when": 1788653269054,
+      "tag": "0024_boring_black_panther",
+      "breakpoints": true
     }
   ]
-}
+}
\ No newline at end of file
diff --git a/app/server/db/schema.ts b/app/server/db/schema.ts
index be781a49..b5a1e215 100644
--- a/app/server/db/schema.ts
+++ b/app/server/db/schema.ts
@@ -570,6 +570,24 @@ export const concept2Links = pgTable("concept2_links", {
   // Cleared by the callback's upsert on successful relink. Measured
   // grounds: docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md.
   needsReauthAt: timestamp("needs_reauth_at", { withTimezone: true }),
+  // Wave E auto-send (spec 2026-09-05-concept2-auto-send-design §3.1). The
+  // rower's SENDING MODE: false = MANUAL (today's per-row Send), true =
+  // AUTOMATIC (a finished monitor row is sent the moment it saves). `NOT NULL
+  // DEFAULT false` is ruling 3 — a fresh link lands in MANUAL — and is also
+  // what makes every existing link MANUAL with no backfill. Reset to false by
+  // `upsertLink` when the conflict path lands a DIFFERENT `c2_user_id` (an
+  // account switch must not carry AUTOMATIC onto another Concept2 account);
+  // a reconnect of the same account keeps it.
+  autoSend: boolean("auto_send").notNull().default(false),
+  // The sticky "sends are failing" flag (rulings 6, 7). Set by the send
+  // route ONLY when an eligible send fails with `no_weight_class`; the reason
+  // column carries the route's SUB-reason (`no_weight` | `unreadable_weight`
+  // | `no_gender`), which is the key the rower-facing sentence is chosen by.
+  // Cleared on every outcome that leaves the row at Concept2 (200 post, 200
+  // already-sent short-circuit, 409 duplicate) and on every relink. `c2_error`
+  // never sets it: transient, and its rows keep their Send button.
+  sendFailedAt: timestamp("send_failed_at", { withTimezone: true }),
+  sendFailedReason: text("send_failed_reason"),
   createdAt: timestamp("created_at", { withTimezone: true })
     .notNull()
     .defaultNow(),
diff --git a/app/server/stores/concept2.integration.test.ts b/app/server/stores/concept2.integration.test.ts
index baf99f6f..9d31b524 100644
--- a/app/server/stores/concept2.integration.test.ts
+++ b/app/server/stores/concept2.integration.test.ts
@@ -163,6 +163,96 @@ describe("concept2 store against real Postgres", () => {
     });
   });
 
+  // Wave E auto-send §3.1 (spec 2026-09-05-concept2-auto-send-design): the
+  // sending mode and the sticky send-failed flag, and the two SPLIT rules on
+  // the upsert conflict path. The delta antagonist pass measured both branches
+  // of the CASE on a scratch Postgres; these pin them in CI.
+  describe("auto_send / send_failed_* (Wave E auto-send)", () => {
+    it("a fresh link lands in MANUAL: auto_send false, no failure flag (ruling 3)", async () => {
+      const store = createConcept2Store(db);
+      await store.upsertLink(userA, link({ c2UserId: 10 }));
+      const row = await store.getLink(userA);
+      expect(row).toMatchObject({
+        autoSend: false,
+        sendFailedAt: null,
+        sendFailedReason: null,
+      });
+    });
+
+    it("setAutoSend flips the column and returns true; returns false with no link row", async () => {
+      const store = createConcept2Store(db);
+      expect(await store.setAutoSend(userB, true)).toBe(false);
+      await store.upsertLink(userA, link({ c2UserId: 11 }));
+      expect(await store.setAutoSend(userA, true)).toBe(true);
+      expect((await store.getLink(userA))?.autoSend).toBe(true);
+      expect(await store.setAutoSend(userA, false)).toBe(true);
+      expect((await store.getLink(userA))?.autoSend).toBe(false);
+    });
+
+    it("a reconnect of the SAME Concept2 account keeps AUTOMATIC (the CASE's THEN branch)", async () => {
+      const store = createConcept2Store(db);
+      await store.upsertLink(userA, link({ c2UserId: 12 }));
+      await store.setAutoSend(userA, true);
+      await store.upsertLink(
+        userA,
+        link({ c2UserId: 12, accessToken: "at-2", refreshToken: "rt-2" }),
+      );
+      const row = await store.getLink(userA);
+      expect(row?.autoSend).toBe(true);
+      expect(row?.accessToken).toBe("at-2");
+    });
+
+    it("a relink to a DIFFERENT Concept2 account resets to MANUAL (the CASE's ELSE branch; F7)", async () => {
+      const store = createConcept2Store(db);
+      await store.upsertLink(userA, link({ c2UserId: 13 }));
+      await store.setAutoSend(userA, true);
+      await store.upsertLink(userA, link({ c2UserId: 14 }));
+      const row = await store.getLink(userA);
+      expect(row?.c2UserId).toBe(14);
+      expect(row?.autoSend).toBe(false);
+    });
+
+    it("setSendFailed stores the instant and the SUB-reason; clearSendFailed nulls both", async () => {
+      const store = createConcept2Store(db);
+      await store.upsertLink(userA, link({ c2UserId: 15 }));
+      await store.setSendFailed(userA, "no_weight");
+      const flagged = await store.getLink(userA);
+      expect(flagged?.sendFailedAt).not.toBeNull();
+      expect(flagged?.sendFailedReason).toBe("no_weight");
+      await store.clearSendFailed(userA);
+      const cleared = await store.getLink(userA);
+      expect(cleared?.sendFailedAt).toBeNull();
+      expect(cleared?.sendFailedReason).toBeNull();
+    });
+
+    it("EVERY relink clears the failure flag — same account or not (delta F4)", async () => {
+      const store = createConcept2Store(db);
+      await store.upsertLink(userA, link({ c2UserId: 16 }));
+      await store.setSendFailed(userA, "no_gender");
+      // same account
+      await store.upsertLink(
+        userA,
+        link({ c2UserId: 16, accessToken: "at-3" }),
+      );
+      expect((await store.getLink(userA))?.sendFailedAt).toBeNull();
+      // flag again, then a different account
+      await store.setSendFailed(userA, "unreadable_weight");
+      await store.upsertLink(userA, link({ c2UserId: 17 }));
+      const row = await store.getLink(userA);
+      expect(row?.sendFailedAt).toBeNull();
+      expect(row?.sendFailedReason).toBeNull();
+    });
+
+    it("setSendFailed / clearSendFailed on a user with no link are no-ops, not errors", async () => {
+      const store = createConcept2Store(db);
+      await expect(
+        store.setSendFailed(userB, "no_weight"),
+      ).resolves.toBeUndefined();
+      await expect(store.clearSendFailed(userB)).resolves.toBeUndefined();
+      expect(await store.getLink(userB)).toBeNull();
+    });
+  });
+
   describe("withLinkLock", () => {
     it("'store' writes the token pair + expiresAt and bumps updatedAt atomically", async () => {
       const store = createConcept2Store(db);
diff --git a/app/server/stores/concept2.ts b/app/server/stores/concept2.ts
index 3fd2c0d6..4fcffd57 100644
--- a/app/server/stores/concept2.ts
+++ b/app/server/stores/concept2.ts
@@ -1,4 +1,4 @@
-import { and, eq, sql } from "drizzle-orm";
+import { and, eq, isNotNull, sql } from "drizzle-orm";
 import type { Db } from "../db/index.js";
 import { concept2AuthAttempts, concept2Links } from "../db/schema.js";
 import { isUniqueViolation, pgConstraint } from "./errors.js";
@@ -38,6 +38,14 @@ export interface Concept2Link {
   refreshToken: string;
   expiresAt: Date;
   needsReauthAt: Date | null;
+  /** Wave E auto-send §3.1: the sending mode. false = MANUAL, true =
+   *  AUTOMATIC. Required on the row (NOT NULL DEFAULT false). */
+  autoSend: boolean;
+  /** The sticky "sends are failing" flag (rulings 6, 7): when the last
+   *  eligible send failed with `no_weight_class`, and its SUB-reason. Both
+   *  null when the last send landed (or Concept2 already had the row). */
+  sendFailedAt: Date | null;
+  sendFailedReason: string | null;
   createdAt: Date;
   updatedAt: Date;
 }
@@ -167,6 +175,20 @@ export function createConcept2Store(db: Db) {
               refreshToken: link.refreshToken,
               expiresAt: link.expiresAt,
               needsReauthAt: null,
+              // Wave E auto-send §3.1, two rules split on purpose (the delta
+              // pass's F4): the MODE survives a reconnect of the SAME Concept2
+              // account and resets to MANUAL when a DIFFERENT account lands —
+              // AUTOMATIC must never carry onto a Concept2 account the rower
+              // did not choose it for. `excluded` is Postgres's name for the
+              // row that would have been inserted; the CASE compares the
+              // stored account to the incoming one.
+              autoSend: sql`CASE WHEN ${concept2Links.c2UserId} = excluded.c2_user_id THEN ${concept2Links.autoSend} ELSE false END`,
+              // ...while the FAILURE flag clears on EVERY relink, same-account
+              // or not, because a relink replaces the grant the failure was
+              // evidence about — this same statement already clears
+              // `needsReauthAt` for the identical reason.
+              sendFailedAt: null,
+              sendFailedReason: null,
               updatedAt: sql`now()`,
             },
           });
@@ -181,6 +203,53 @@ export function createConcept2Store(db: Db) {
       }
     },
 
+    /** Wave E auto-send §3.1: `PATCH /api/concept2/link { autoSend }`. Returns
+     *  false when there is no link row to update — the route answers 409
+     *  `unlinked` for that, because the setting has no meaning without a link
+     *  (ruling 1). */
+    async setAutoSend(userId: string, autoSend: boolean): Promise<boolean> {
+      const rows = await db
+        .update(concept2Links)
+        .set({ autoSend, updatedAt: sql`now()` })
+        .where(eq(concept2Links.userId, userId))
+        .returning({ userId: concept2Links.userId });
+      return rows.length === 1;
+    },
+
+    /** Wave E auto-send §3.4: the send route's one write on an eligible send
+     *  that failed with `no_weight_class`. `reason` is the route's SUB-reason
+     *  (`no_weight` | `unreadable_weight` | `no_gender`), stored verbatim so
+     *  the You screen can choose the rower-facing sentence. Idempotent on a
+     *  missing link (zero rows, no error). */
+    async setSendFailed(userId: string, reason: string): Promise<void> {
+      await db
+        .update(concept2Links)
+        .set({
+          sendFailedAt: sql`now()`,
+          sendFailedReason: reason,
+          updatedAt: sql`now()`,
+        })
+        .where(eq(concept2Links.userId, userId));
+    },
+
+    /** Wave E auto-send §3.4: cleared on EVERY outcome that leaves the row at
+     *  Concept2 — the 200 post, the 200 already-sent short-circuit, and the
+     *  409 duplicate (the delta pass's F3: "on success" enumerated from the
+     *  branch that says 200 missed the two an ErgData user produces). A no-op
+     *  when nothing is set, so the route calls it unconditionally on those
+     *  exits rather than reading first. */
+    async clearSendFailed(userId: string): Promise<void> {
+      await db
+        .update(concept2Links)
+        .set({ sendFailedAt: null, sendFailedReason: null })
+        .where(
+          and(
+            eq(concept2Links.userId, userId),
+            isNotNull(concept2Links.sendFailedAt),
+          ),
+        );
+    },
+
     // User-initiated unlink ONLY (schema.ts's own comment on
     // `needsReauthAt`: an automatic failure path never deletes the link,
     // it flags it via `withLinkLock`'s "flagReauth" outcome instead).
diff --git a/app/server/testing/fakes.ts b/app/server/testing/fakes.ts
index 7467542e..7c4bb8bd 100644
--- a/app/server/testing/fakes.ts
+++ b/app/server/testing/fakes.ts
@@ -983,6 +983,15 @@ export function makeFakeConcept2Store(
         refreshToken: link.refreshToken,
         expiresAt: link.expiresAt,
         needsReauthAt: null,
+        // Mirrors the real store's two split rules (Wave E auto-send §3.1):
+        // the MODE survives a same-account reconnect and resets on an account
+        // switch; the FAILURE flag clears on every relink.
+        autoSend:
+          existing !== undefined && existing.c2UserId === link.c2UserId
+            ? existing.autoSend
+            : false,
+        sendFailedAt: null,
+        sendFailedReason: null,
         createdAt: existing?.createdAt ?? now,
         updatedAt: now,
       });
@@ -992,6 +1001,34 @@ export function makeFakeConcept2Store(
       links.delete(userId);
     },
 
+    async setAutoSend(userId: string, autoSend: boolean) {
+      const existing = links.get(userId);
+      if (!existing) return false;
+      links.set(userId, { ...existing, autoSend, updatedAt: clock() });
+      return true;
+    },
+
+    async setSendFailed(userId: string, reason: string) {
+      const existing = links.get(userId);
+      if (!existing) return;
+      links.set(userId, {
+        ...existing,
+        sendFailedAt: clock(),
+        sendFailedReason: reason,
+        updatedAt: clock(),
+      });
+    },
+
+    async clearSendFailed(userId: string) {
+      const existing = links.get(userId);
+      if (!existing || existing.sendFailedAt === null) return;
+      links.set(userId, {
+        ...existing,
+        sendFailedAt: null,
+        sendFailedReason: null,
+      });
+    },
+
     async withLinkLock(userId, fn) {
       const previousGate = gates.get(userId) ?? Promise.resolve();
       let releaseGate: () => void = () => {};
```

</details>

---

## Task 2: the route — `PATCH /link`, the flag's set/clear sites, the in-flight claim — and the client link shape

**Commit:** `1ef395e0`.

**Files:** `app/server/routes/concept2.ts`, `app/server/routes/concept2.test.ts`, `app/scripts/webauth-contract.test.ts`, `app/src/api/useConcept2Link.ts`, `app/src/api/useConcept2Link.test.ts`, `app/src/monitor/Concept2LinkProbe.tsx`, `app/src/you/concept2RowState.ts`, `app/src/you/Concept2Row.test.tsx`, `app/src/you/concept2CardModel.test.ts`.

**Why one task:** `scripts/webauth-contract.test.ts` holds the route's emitted keys equal to BOTH client interfaces and to an independent literal, so the route and the two client types move in one commit or the contract is red between them.

**Interfaces produced:** GET `/api/concept2/link` linked shape gains `autoSend`, `sendFailedAt` (ISO string | null), `sendFailedReason`. New `PATCH /api/concept2/link` body `{ autoSend: boolean }` → 204; 400 `field: "autoSend"` on anything but a literal boolean; 409 `unlinked`; 403 when the surface is dark. Client `Concept2Link` gains the three fields (`autoSend: raw.autoSend === true` — A2 fail-closed; the strings absent/empty → null); `LINK_UNAVAILABLE` carries `false/null/null`; `reload()` resolves to the applied link or `null`; **`fetchLink()`** is exported (one read, parsed, never throws) and the hook's `reload` is built on it. `RowState` gains `"SEND FAILED"`, precedence `needsReauth` → `sendFailedAt !== null` → linked.

**The claim, as BUILT (spec rev 4 §3.3; corrected by the harden fix round, commit `cfb99c98`):** `claimSend(handler)`, a WRAPPER around the upload handler. Map `userId:logId` (id lower-cased — `UUID_RE` is `/i` and Postgres compares uuids case-insensitively) → the CHAIN promise for that key; a caller appends its own gate to the chain synchronously, awaits the prior chain, runs the handler, and releases in a `finally` on the handler's OWN settlement. A later caller therefore runs AFTER the earlier handler finished and meets the row's `c2_result_id` → the already-sent 200. No response capture; the handler keeps its exits and indentation (the wrapper is an argument, so the body's indentation is unchanged). A thrown handler rethrows: `router`'s `Layer.handleRequest` passes the rejection to `next(err)`, finalhandler answers 500 (measured, lens 1 item 4). **What this replaced, and why (both lenses, independently):** the commit `1ef395e0` shipped it as a middleware releasing on the response's `finish`/`close`; Express does not stop a handler when its client hangs up, `close` fires while the handler is still inside `postResult`, the key is freed, and a second caller runs beside the first — measured `wireCalls = 2` in a verbatim scratch copy. The rower's own client is that hang-up, routinely, since the automatic send is fire-and-forget from a screen already left. Cost of the fix: a waiting caller now waits for the first HANDLER, bounded by `server/concept2/client.ts`'s timeouts.

**Flag sites (spec §3.4, ruling: `no_weight_class` only):** `setSendFailed(userId, resolved.reason)` immediately before the eligible `no_weight_class` 422; `clearSendFailed(userId)` before the already-sent 200, after the success 200's `recordC2Result`, and in the 409 duplicate branch. `c2_error`, `not_eligible`, `needs_reauth` never touch it.

**Tests:** routes suite 159 passed — PATCH (204 flip; `it.each` 400 for string/number/null/absent; 409 unlinked; 403 dark; GET carries the flag); "the send-failed flag (A11)" 6 tests; "the in-flight send claim (A10)" with a deferred wire post and an `entered` signal (two concurrent sends reach Concept2 once, both see one `resultId`; a rejected first releases the second). Hook suite 38 passed (normalizeLink autoSend true/"true"/1/absent/null; the pair absent/empty/null/non-string; reload resolves link / null). Row suite 30 passed (cells 11-14 + a stale flag on an unlinked shape). `webauth-contract` 8 passed with the nine-key literal.

**Mutations (measured):**

| # | mutation | failure |
| --- | --- | --- |
| M2 | delete `await store.setSendFailed(userId, resolved.reason)` | `no_weight_class SETS the flag…` — `expected null not to be null` |
| M3 | delete the `clearSendFailed` before the already-sent 200 | `the already-sent short-circuit … CLEARS a set flag` — `expected 2026-09-06T00:56:02.532Z to be null` |
| M4 | delete the `clearSendFailed` in the 409 duplicate branch | `Concept2's 409 duplicate … CLEARS a set flag` — `expected …Z to be null` |
| M5 | PATCH guard `typeof body.autoSend !== "boolean"` → `body.autoSend === undefined` | 3 failed: string / number / null → `expected 204 to be 400` |
| M6 | remove `claimSend` from the route's middleware list | `two concurrent sends for ONE row reach Concept2 once` — `expected "vi.fn()" to be called 1 times, but got 2 times` |
| M7 | `autoSend: raw.autoSend === true` → `Boolean(raw.autoSend)` | 3 failed across hook + autoSend suites: `"true"` and `1` read as AUTOMATIC — `expected true to be false`; `autoSend the string "true": no send` — a send went out |
| M8 | `rowState`: SEND FAILED checked before needsReauth | cells 13 and 14 — `expected 'SEND FAILED' to be 'RECONNECT NEEDED'` |

- [ ] **Step 1: the commit is the implementation.** Review package: `git show 1ef395e0` (stat below). Reviewer: brief = this task's section; diff = the commit; gates = the suites named above, re-run from `app/`.

```
1ef395e0 Auto-send: PATCH /link, the send-failed flag, the in-flight claim, and the client link shape

 app/scripts/webauth-contract.test.ts  |   3 +
 app/server/routes/concept2.test.ts    | 309 ++++++++++++++++++++++++++++++++++
 app/server/routes/concept2.ts         | 102 ++++++++++-
 app/src/api/useConcept2Link.test.ts   | 157 ++++++++++++++++-
 app/src/api/useConcept2Link.ts        | 105 ++++++++----
 app/src/monitor/Concept2LinkProbe.tsx |   7 +
 app/src/you/Concept2Row.test.tsx      |  48 ++++++
 app/src/you/concept2CardModel.test.ts |   3 +
 app/src/you/concept2RowState.ts       |  12 +-
 9 files changed, 711 insertions(+), 35 deletions(-)
```

<details>
<summary>The diff, verbatim (<code>git show 1ef395e0</code>)</summary>

```diff
diff --git a/app/scripts/webauth-contract.test.ts b/app/scripts/webauth-contract.test.ts
index 6a124a32..b0d9ed94 100644
--- a/app/scripts/webauth-contract.test.ts
+++ b/app/scripts/webauth-contract.test.ts
@@ -213,12 +213,15 @@ describe("WebAuth plugin contract (Swift <-> TS <-> plist)", () => {
     // as the reject-codes test above: without it, deleting a key from BOTH
     // files at once would keep the set equality green.
     expect(emitted).toStrictEqual([
+      "autoSend",
       "available",
       "c2UserId",
       "c2Username",
       "linked",
       "logbookBaseUrl",
       "needsReauth",
+      "sendFailedAt",
+      "sendFailedReason",
     ]);
     expect(linkStatusKeys(probe)).toStrictEqual(emitted);
   });
diff --git a/app/server/routes/concept2.test.ts b/app/server/routes/concept2.test.ts
index bfc5ad50..65c39707 100644
--- a/app/server/routes/concept2.test.ts
+++ b/app/server/routes/concept2.test.ts
@@ -1873,6 +1873,10 @@ describe("link (GET/DELETE /api/concept2/link)", () => {
       c2Username: null,
       logbookBaseUrl: LOGBOOK_BASE_URL,
       needsReauth: false,
+      // Wave E auto-send §3.1: a fresh link is MANUAL with no failure flag.
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     });
     expect(JSON.stringify(res.body)).not.toContain(LINK_INPUT.accessToken);
     expect(JSON.stringify(res.body)).not.toContain(LINK_INPUT.refreshToken);
@@ -1926,6 +1930,78 @@ describe("link (GET/DELETE /api/concept2/link)", () => {
     expect(res.body.needsReauth).toBe(true);
   });
 
+  // Wave E auto-send §3.1: the ONE new write, and the flag on the read.
+  it("PATCH { autoSend: true } -> 204, and the next GET reads autoSend true", async () => {
+    const store = makeFakeConcept2Store();
+    await store.upsertLink(userA.id, freshLink());
+    const { app } = buildApp({ store });
+    const patch = await asA(
+      request(app).patch("/api/concept2/link").send({ autoSend: true }),
+    );
+    expect(patch.status).toBe(204);
+    const res = await asA(request(app).get("/api/concept2/link"));
+    expect(res.body.autoSend).toBe(true);
+    const back = await asA(
+      request(app).patch("/api/concept2/link").send({ autoSend: false }),
+    );
+    expect(back.status).toBe(204);
+    expect(
+      (await asA(request(app).get("/api/concept2/link"))).body.autoSend,
+    ).toBe(false);
+  });
+
+  it.each([
+    ["a string", { autoSend: "true" }],
+    ["a number", { autoSend: 1 }],
+    ["absent", {}],
+    ["null", { autoSend: null }],
+  ])(
+    "PATCH with autoSend %s -> 400 field-named; the mode is unchanged (A2 fail-closed)",
+    async (_label, body) => {
+      const store = makeFakeConcept2Store();
+      await store.upsertLink(userA.id, freshLink());
+      const { app } = buildApp({ store });
+      const res = await asA(
+        request(app).patch("/api/concept2/link").send(body),
+      );
+      expect(res.status).toBe(400);
+      expect(res.body).toStrictEqual({
+        error: "autoSend must be a boolean",
+        field: "autoSend",
+      });
+      expect((await store.getLink(userA.id))?.autoSend).toBe(false);
+    },
+  );
+
+  it("PATCH with no link row -> 409 unlinked (the setting has no meaning without one)", async () => {
+    const { app } = buildApp({ store: makeFakeConcept2Store() });
+    const res = await asA(
+      request(app).patch("/api/concept2/link").send({ autoSend: true }),
+    );
+    expect(res.status).toBe(409);
+    expect(res.body).toStrictEqual({ error: "unlinked" });
+  });
+
+  it("PATCH while the surface is unavailable -> 403, same gate as every other write", async () => {
+    const store = makeFakeConcept2Store();
+    await store.upsertLink(userA.id, freshLink());
+    const { app } = buildApp({ store, available: false });
+    const res = await asA(
+      request(app).patch("/api/concept2/link").send({ autoSend: true }),
+    );
+    expect(res.status).toBe(403);
+  });
+
+  it("GET carries the send-failed flag as an ISO instant and the verbatim sub-reason", async () => {
+    const store = makeFakeConcept2Store(() => new Date("2026-09-05T12:00:00Z"));
+    await store.upsertLink(userA.id, freshLink());
+    await store.setSendFailed(userA.id, "unreadable_weight");
+    const { app } = buildApp({ store });
+    const res = await asA(request(app).get("/api/concept2/link"));
+    expect(res.body.sendFailedAt).toBe("2026-09-05T12:00:00.000Z");
+    expect(res.body.sendFailedReason).toBe("unreadable_weight");
+  });
+
   it("DELETE: unavailable -> 403", async () => {
     const { app } = buildApp({ available: false });
     const res = await asA(request(app).delete("/api/concept2/link"));
@@ -2742,6 +2818,239 @@ describe("upload (POST /api/concept2/results/:logId)", () => {
     expect(client.postResult).not.toHaveBeenCalled();
   });
 
+  // ── Wave E auto-send §3.4 (A11): the sticky send-failed flag, one row per
+  // route exit. `no_weight_class` is the ONLY setter; every exit that leaves
+  // the row at Concept2 clears it; `c2_error` and `not_eligible` touch nothing.
+  // Every assertion is a FRESH store read.
+  describe("the send-failed flag (Wave E auto-send A11)", () => {
+    async function flaggedStore() {
+      const store = makeFakeConcept2Store();
+      await store.upsertLink(userA.id, freshLink());
+      await store.setSendFailed(userA.id, "no_weight");
+      expect((await store.getLink(userA.id))?.sendFailedAt).not.toBeNull();
+      return store;
+    }
+
+    it("no_weight_class SETS the flag with the sub-reason, and posts nothing", async () => {
+      const store = makeFakeConcept2Store();
+      await store.upsertLink(userA.id, freshLink());
+      const client = makeStubClient();
+      vi.mocked(client.fetchResults).mockResolvedValue({ ok: true, rows: [] });
+      vi.mocked(client.fetchMe).mockResolvedValue({
+        ok: true,
+        c2UserId: 2211,
+        username: "jmorelli",
+        weight: null,
+        gender: "M",
+      });
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+      const res = await asA(
+        request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
+      );
+      expect(res.status).toBe(422);
+      const link = await store.getLink(userA.id);
+      expect(link?.sendFailedAt).not.toBeNull();
+      expect(link?.sendFailedReason).toBe("no_weight");
+      expect(client.postResult).not.toHaveBeenCalled();
+    });
+
+    it("a 200 post CLEARS a set flag", async () => {
+      const store = await flaggedStore();
+      const client = makeStubClient();
+      vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 1 });
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+      const res = await asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      );
+      expect(res.status).toBe(200);
+      const link = await store.getLink(userA.id);
+      expect(link?.sendFailedAt).toBeNull();
+      expect(link?.sendFailedReason).toBeNull();
+    });
+
+    it("the already-sent short-circuit (200, no wire call) CLEARS a set flag", async () => {
+      const store = await flaggedStore();
+      const client = makeStubClient();
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+      await logs.recordC2Result(userA.id, id, 999, LINK_INPUT.c2UserId);
+      const res = await asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      );
+      expect(res.status).toBe(200);
+      expect(client.postResult).not.toHaveBeenCalled();
+      expect((await store.getLink(userA.id))?.sendFailedAt).toBeNull();
+    });
+
+    it("Concept2's 409 duplicate (the row is THERE) CLEARS a set flag — the exit 'on success' missed", async () => {
+      const store = await flaggedStore();
+      const client = makeStubClient();
+      vi.mocked(client.postResult).mockResolvedValue({
+        ok: false,
+        kind: "duplicate",
+        resultId: 777,
+      });
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+      const res = await asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      );
+      expect(res.status).toBe(409);
+      expect((await store.getLink(userA.id))?.sendFailedAt).toBeNull();
+    });
+
+    it("c2_error LEAVES the flag as it was — set stays set, clear stays clear (ruling 7)", async () => {
+      const store = await flaggedStore();
+      const client = makeStubClient();
+      vi.mocked(client.postResult).mockResolvedValue({
+        ok: false,
+        kind: "c2_error",
+        status: 500,
+      });
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+      const res = await asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      );
+      expect(res.status).toBe(502);
+      expect((await store.getLink(userA.id))?.sendFailedReason).toBe(
+        "no_weight",
+      );
+      // and on a CLEAR link, c2_error does not set it
+      const clean = makeFakeConcept2Store();
+      await clean.upsertLink(userA.id, freshLink());
+      const { app: app2, logs: logs2 } = buildApp({ store: clean, client });
+      const id2 = await seedEligibleLog(logs2, userA.id);
+      await asA(
+        request(app2)
+          .post(`/api/concept2/results/${id2}`)
+          .send({ tz: "America/New_York" }),
+      );
+      expect((await clean.getLink(userA.id))?.sendFailedAt).toBeNull();
+    });
+
+    it("not_eligible LEAVES the flag untouched (a manual row is not a link failure)", async () => {
+      const store = await flaggedStore();
+      const { app, logs } = buildApp({ store });
+      const id = await seedEligibleLog(logs, userA.id, { source: "manual" });
+      const res = await asA(
+        request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
+      );
+      expect(res.status).toBe(422);
+      expect(res.body.error).toBe("not_eligible");
+      expect((await store.getLink(userA.id))?.sendFailedReason).toBe(
+        "no_weight",
+      );
+    });
+  });
+
+  // ── Wave E auto-send §3.3 (A10): the per-row in-flight claim. NOT a race
+  // (PR #269's lesson): request 2 is issued only after request 1 has ENTERED
+  // the wire call, and the wire call resolves only when the test says so.
+  describe("the in-flight send claim (Wave E auto-send A10)", () => {
+    function deferredPostResult() {
+      let resolve!: (v: unknown) => void;
+      let reject!: (e: unknown) => void;
+      let entered!: () => void;
+      const enteredOnce = new Promise<void>((r) => {
+        entered = r;
+      });
+      const answer = new Promise<unknown>((res, rej) => {
+        resolve = res;
+        reject = rej;
+      });
+      return {
+        enteredOnce,
+        resolve,
+        reject,
+        impl: vi.fn(() => {
+          entered();
+          return answer;
+        }),
+      };
+    }
+
+    it("two concurrent sends for ONE row reach Concept2 once, and both callers see the same resultId", async () => {
+      const store = makeFakeConcept2Store();
+      await store.upsertLink(userA.id, freshLink());
+      const client = makeStubClient();
+      const d = deferredPostResult();
+      vi.mocked(client.postResult).mockImplementation(
+        d.impl as unknown as typeof client.postResult,
+      );
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+
+      // supertest's Test is LAZY — it fires only on `.then`/`.end` — so the
+      // concurrent requests are started eagerly with `.then(r => r)`; without
+      // that, `enteredOnce` can never resolve and the test times out.
+      const first = asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      ).then((r) => r);
+      await d.enteredOnce; // request 1 is INSIDE the wire call
+      const second = asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      ).then((r) => r);
+      // Let request 2 reach the claim and chain before anything resolves.
+      await new Promise((r) => setTimeout(r, 20));
+      expect(d.impl).toHaveBeenCalledTimes(1);
+
+      d.resolve({ ok: true, resultId: 4242 });
+      const [r1, r2] = await Promise.all([first, second]);
+      expect(r1.status).toBe(200);
+      expect(r2.status).toBe(200);
+      expect(r1.body.resultId).toBe(4242);
+      expect(r2.body.resultId).toBe(4242);
+      expect(d.impl).toHaveBeenCalledTimes(1);
+    });
+
+    it("a send whose wire call THREW releases the claim: the next send for the same row reaches the wire", async () => {
+      const store = makeFakeConcept2Store();
+      await store.upsertLink(userA.id, freshLink());
+      const client = makeStubClient();
+      const d = deferredPostResult();
+      vi.mocked(client.postResult).mockImplementation(
+        d.impl as unknown as typeof client.postResult,
+      );
+      const { app, logs } = buildApp({ store, client });
+      const id = await seedEligibleLog(logs, userA.id);
+
+      const first = asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      ).then((r) => r);
+      await d.enteredOnce;
+      d.reject(new Error("socket hang up"));
+      const r1 = await first;
+      expect(r1.status).toBeGreaterThanOrEqual(500);
+
+      vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 7 });
+      const r2 = await asA(
+        request(app)
+          .post(`/api/concept2/results/${id}`)
+          .send({ tz: "America/New_York" }),
+      );
+      expect(r2.status).toBe(200);
+      expect(r2.body.resultId).toBe(7);
+      expect(client.postResult).toHaveBeenCalledTimes(2);
+    });
+  });
+
   it("resending after relinking to a DIFFERENT C2 account is allowed and overwrites the pair (plan deviation 5)", async () => {
     const store = makeFakeConcept2Store();
     await store.upsertLink(userA.id, freshLink({ c2UserId: 111 }));
diff --git a/app/server/routes/concept2.ts b/app/server/routes/concept2.ts
index f5b9a84d..f7b347d3 100644
--- a/app/server/routes/concept2.ts
+++ b/app/server/routes/concept2.ts
@@ -250,6 +250,46 @@ export function createConcept2Router({
   now = () => new Date(),
 }: Concept2RouterDeps): Router {
   const router = Router();
+  // Wave E auto-send §3.3 (A10): the per-row send CLAIM. An automatic send
+  // fires right after a row saves, and the rower can tap Send on that row
+  // while it is in flight — two `POST /results/:logId` for one row, both
+  // reading the row before either writes, with no lock on `session_logs`.
+  // Concept2's own 409 dedup is a vendor heuristic, not our guard. Callers
+  // for one `userId:logId` chain here: a later caller waits for the earlier
+  // one's RESPONSE to finish, then runs the handler itself — and finds the
+  // row already carrying `c2_result_id`, so it takes the already-sent
+  // short-circuit and answers the same `resultId`. No response is captured
+  // or replayed; the stored row is the shared result. Scoped to THIS router
+  // instance (one process serves the API — `container_name` in compose makes
+  // `--scale` impossible; one instance per test app so route tests share no
+  // table).
+  //
+  // A MIDDLEWARE, not a wrapper around the handler: the handler keeps its
+  // seventeen exits and its indentation, and the claim reads one thing —
+  // the response's own `finish`/`close` — so a handler that THREW (Express 5
+  // routes the rejection to the error handler, which answers) or a client
+  // that hung up both release the key. The map entry is the CHAIN for the
+  // key (each caller's gate appended to the last), set synchronously before
+  // any await so a third caller queues behind the second, never beside it;
+  // it is deleted when the chain it holds settles.
+  const inflightSends = new Map<string, Promise<void>>();
+  const claimSend: RequestHandler = async (req, res, next) => {
+    const key = `${req.user!.id}:${String(req.params.logId)}`;
+    let release: () => void = () => undefined;
+    const mine = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    const prior = inflightSends.get(key);
+    const chain = prior === undefined ? mine : prior.then(() => mine);
+    inflightSends.set(key, chain);
+    void chain.then(() => {
+      if (inflightSends.get(key) === chain) inflightSends.delete(key);
+    });
+    res.once("finish", release);
+    res.once("close", release);
+    if (prior !== undefined) await prior;
+    next();
+  };
 
   async function resolveCookieSession(
     req: Request,
@@ -669,10 +709,50 @@ export function createConcept2Router({
         // explicit form just spares it the argument.
         logbookBaseUrl: logbookBaseUrl,
         needsReauth: link.needsReauthAt !== null,
+        // Wave E auto-send §3.1: the sending mode and the sticky send-failed
+        // flag, read by the You row, the card's control and mode line, and
+        // the log form's post-save decision. `sendFailedAt` as an ISO string
+        // (JSON has no Date); `sendFailedReason` is the route's sub-reason
+        // verbatim (`no_weight` | `unreadable_weight` | `implausible_weight`
+        // | `no_gender`), the key the rower-facing sentence is chosen by.
+        autoSend: link.autoSend,
+        sendFailedAt: link.sendFailedAt?.toISOString() ?? null,
+        sendFailedReason: link.sendFailedReason,
       });
     },
   );
 
+  // Wave E auto-send §3.1: the ONE new write the router grows. Body
+  // `{ autoSend: boolean }` — anything else is 400 (absent, empty and a
+  // string "true" are three ways of not being a boolean, and A2's
+  // fail-closed rule wants none of them read as AUTOMATIC). 409 `unlinked`
+  // with no link row: the setting has no meaning without one (ruling 1). The
+  // send-failed flag is NOT writable here — only the send route sets it.
+  router.patch(
+    "/api/concept2/link",
+    requireUser,
+    refuseAmbiguousAuth,
+    async (req, res) => {
+      if (!availableFor(req.user!.email)) {
+        unavailableJson(res);
+        return;
+      }
+      const body = isRec(req.body) ? req.body : {};
+      if (typeof body.autoSend !== "boolean") {
+        res
+          .status(400)
+          .json({ error: "autoSend must be a boolean", field: "autoSend" });
+        return;
+      }
+      const updated = await store.setAutoSend(req.user!.id, body.autoSend);
+      if (!updated) {
+        res.status(409).json({ error: "unlinked" });
+        return;
+      }
+      res.status(204).end();
+    },
+  );
+
   router.delete(
     "/api/concept2/link",
     requireUser,
@@ -705,6 +785,7 @@ export function createConcept2Router({
     "/api/concept2/results/:logId",
     requireUser,
     refuseAmbiguousAuth,
+    claimSend,
     async (req, res) => {
       if (!availableFor(req.user!.email)) {
         unavailableJson(res);
@@ -770,6 +851,10 @@ export function createConcept2Router({
       // response. This comment used to cite that as the reason, which had
       // it backwards.)
       if (row.c2ResultId !== null && row.c2UserId === link.c2UserId) {
+        // Wave E auto-send §3.4: Concept2 has this row, so "sends are
+        // failing" is over — whatever set the flag. Unconditional and cheap
+        // (a no-op when nothing is set).
+        await store.clearSendFailed(userId);
         res.status(200).json({ resultId: row.c2ResultId });
         return;
       }
@@ -808,7 +893,10 @@ export function createConcept2Router({
       // `row.tz`) so `buildC2Payload`'s paired branch treats a freshly
       // persisted zone exactly like an already-stored one — same stable
       // `completedAt`-based date on every attempt from here on.
-      const mappingRow: SessionLogRow = { ...eligibilityRow, tz: effectiveTz };
+      const mappingRow: SessionLogRow = {
+        ...eligibilityRow,
+        tz: effectiveTz,
+      };
 
       // I4: the `c2UserId` for the weight-class read and for
       // `recordC2Result` must come from the LOCKED re-read inside
@@ -1161,6 +1249,13 @@ export function createConcept2Router({
         // one is decided from the ROW and cannot be repaired, this one is
         // decided from Concept2's own side and IS repairable — by designating
         // a class on a Concept2 result, or by fixing the profile weight.
+        // Wave E auto-send §3.4 (rulings 6, 7): the ONE outcome that sets
+        // the sticky flag — an ELIGIBLE send refused for want of a weight
+        // class, which is systematic (every row will fail the same way) and
+        // repairable by the rower. Stores the SUB-reason, the key the You
+        // screen's sentence is chosen by. `c2_error` deliberately does not
+        // set it (transient); `not_eligible` cannot reach here.
+        await store.setSendFailed(userId, resolved.reason);
         res
           .status(422)
           .json({ error: "no_weight_class", reason: resolved.reason });
@@ -1242,6 +1337,8 @@ export function createConcept2Router({
         // response is the one moment they exist, which is exactly the
         // moment a class we DERIVED can diverge from the rower's own
         // declaration.
+        // Wave E auto-send §3.4: the row is at Concept2; clear the flag.
+        await store.clearSendFailed(userId);
         res.status(200).json({
           resultId: postResult.resultId,
           weightClass: resolved.weightClass,
@@ -1270,6 +1367,9 @@ export function createConcept2Router({
           postResult.resultId,
           lockedLink.c2UserId,
         );
+        // Wave E auto-send §3.4: a duplicate means Concept2 HAS the row —
+        // the delta pass's F3, the exit "on success" enumeration missed.
+        await store.clearSendFailed(userId);
         res
           .status(409)
           .json({ error: "duplicate", c2ResultId: postResult.resultId });
diff --git a/app/src/api/useConcept2Link.test.ts b/app/src/api/useConcept2Link.test.ts
index 800236be..cab9a08d 100644
--- a/app/src/api/useConcept2Link.test.ts
+++ b/app/src/api/useConcept2Link.test.ts
@@ -1,6 +1,10 @@
 import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
 import { renderHook, waitFor, act } from "@testing-library/react";
-import { normalizeLink, LINK_UNAVAILABLE } from "./useConcept2Link";
+import {
+  normalizeLink,
+  LINK_UNAVAILABLE,
+  type Concept2Link,
+} from "./useConcept2Link";
 
 // `document.visibilityState` is replaced with `Object.defineProperty`, which
 // `vi.restoreAllMocks()` does NOT undo — the stub would leak to every later
@@ -53,6 +57,9 @@ describe("LINK_UNAVAILABLE (the flag-off answer, amendment 1h)", () => {
       c2Username: null,
       needsReauth: false,
       logbookBaseUrl: null,
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     });
   });
 });
@@ -75,6 +82,9 @@ describe("normalizeLink (GET /api/concept2/link's three response shapes)", () =>
       c2Username: null,
       needsReauth: false,
       logbookBaseUrl: null,
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     });
   });
 
@@ -86,6 +96,9 @@ describe("normalizeLink (GET /api/concept2/link's three response shapes)", () =>
       c2Username: null,
       needsReauth: false,
       logbookBaseUrl: null,
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     });
   });
 
@@ -106,6 +119,9 @@ describe("normalizeLink (GET /api/concept2/link's three response shapes)", () =>
       c2Username: "jamesawesome",
       needsReauth: true,
       logbookBaseUrl: "https://log-dev.concept2.com",
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     });
   });
 
@@ -129,6 +145,9 @@ describe("normalizeLink (GET /api/concept2/link's three response shapes)", () =>
       c2Username: null,
       needsReauth: false,
       logbookBaseUrl: null,
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     });
   });
 
@@ -183,6 +202,9 @@ describe("normalizeLink (GET /api/concept2/link's three response shapes)", () =>
       c2Username: null,
       needsReauth: false,
       logbookBaseUrl: null,
+      autoSend: false,
+      sendFailedAt: null,
+      sendFailedReason: null,
     };
     expect(normalizeLink(null)).toStrictEqual(unavailable);
     expect(normalizeLink("nope")).toStrictEqual(unavailable);
@@ -362,7 +384,7 @@ describe("useConcept2Link: a newer read always wins (review F7)", () => {
     await waitFor(() => expect(releases).toHaveLength(1));
 
     // A second read starts while the first is still unanswered.
-    let second: Promise<void>;
+    let second: Promise<Concept2Link | null>;
     await act(async () => {
       second = result.current.reload();
       await Promise.resolve();
@@ -410,7 +432,7 @@ describe("useConcept2Link: a newer read always wins (review F7)", () => {
     const { result } = renderHook(() => useConcept2Link());
     await waitFor(() => expect(releases).toHaveLength(1));
 
-    let second: Promise<void>;
+    let second: Promise<Concept2Link | null>;
     await act(async () => {
       second = result.current.reload();
       await Promise.resolve();
@@ -553,7 +575,7 @@ describe("useConcept2Link: a newer read always wins (review F7)", () => {
     const { result } = renderHook(() => useConcept2Link());
     await waitFor(() => expect(ctl).toHaveLength(1));
 
-    let second: Promise<void>;
+    let second: Promise<Concept2Link | null>;
     await act(async () => {
       second = result.current.reload();
       await Promise.resolve();
@@ -648,3 +670,130 @@ describe("useConcept2Link re-reads when the document comes back (observation 19,
     expect(api).toHaveBeenCalledTimes(1);
   });
 });
+
+// Wave E auto-send §3.1 (A2): the mode is fail-closed by construction — only a
+// literal `true` reads as AUTOMATIC — and the send-failed pair takes the same
+// ABSENT / EMPTY / VALUED treatment as the other optional strings.
+describe("normalizeLink — autoSend and the send-failed flag (Wave E auto-send)", () => {
+  const linked = {
+    available: true,
+    linked: true,
+    c2UserId: 2211,
+    c2Username: "jamesawesome",
+    needsReauth: false,
+    logbookBaseUrl: "https://log-dev.concept2.com",
+  };
+
+  it("reads a literal true as AUTOMATIC", () => {
+    expect(normalizeLink({ ...linked, autoSend: true }).autoSend).toBe(true);
+  });
+
+  it.each([
+    ["absent (a server that predates the column)", {}],
+    ['the string "true"', { autoSend: "true" }],
+    ["the number 1", { autoSend: 1 }],
+    ["false", { autoSend: false }],
+    ["null", { autoSend: null }],
+  ])(
+    "reads autoSend %s as MANUAL — only a literal true is automatic (A2)",
+    (_l, extra) => {
+      expect(normalizeLink({ ...linked, ...extra }).autoSend).toBe(false);
+    },
+  );
+
+  it("carries a valued send-failed instant and sub-reason verbatim", () => {
+    const link = normalizeLink({
+      ...linked,
+      sendFailedAt: "2026-09-05T12:00:00.000Z",
+      sendFailedReason: "no_weight",
+    });
+    expect(link.sendFailedAt).toBe("2026-09-05T12:00:00.000Z");
+    expect(link.sendFailedReason).toBe("no_weight");
+  });
+
+  it.each([
+    ["absent", {}],
+    ["empty strings", { sendFailedAt: "", sendFailedReason: "" }],
+    ["null", { sendFailedAt: null, sendFailedReason: null }],
+    ["non-strings", { sendFailedAt: 5, sendFailedReason: true }],
+  ])("reads a send-failed pair that is %s as NOT flagged", (_l, extra) => {
+    const link = normalizeLink({ ...linked, ...extra });
+    expect(link.sendFailedAt).toBeNull();
+    expect(link.sendFailedReason).toBeNull();
+  });
+
+  it("an unlinked or unavailable answer carries autoSend false and no flag, whatever the body says", () => {
+    expect(
+      normalizeLink({ available: true, linked: false, autoSend: true })
+        .autoSend,
+    ).toBe(false);
+    expect(
+      normalizeLink({ available: false, autoSend: true, sendFailedAt: "x" })
+        .sendFailedAt,
+    ).toBeNull();
+  });
+});
+
+describe("reload() resolves to what it applied (Wave E auto-send §3.3's fresh read)", () => {
+  // The log form's post-save decision reads the RESOLVED value, not
+  // `result.current.link` — a closure over state would see the mount-time
+  // link, and a mode flipped on /you/concept2 mid-form would be missed.
+  it("resolves to the normalized link on a 200", async () => {
+    let autoSend = false;
+    const api = vi.fn(
+      async () =>
+        new Response(
+          JSON.stringify({
+            available: true,
+            linked: true,
+            c2UserId: 1,
+            autoSend,
+          }),
+          { status: 200, headers: { "Content-Type": "application/json" } },
+        ),
+    );
+    vi.doMock("../api", () => ({ api }));
+    const { useConcept2Link } = await import("./useConcept2Link");
+    const { result } = renderHook(() => useConcept2Link());
+    await waitFor(() => expect(result.current.link).not.toBeNull());
+    expect(result.current.link?.autoSend).toBe(false);
+
+    autoSend = true;
+    let fresh: Concept2Link | null = null;
+    await act(async () => {
+      fresh = await result.current.reload();
+    });
+    expect(fresh).toMatchObject({ linked: true, autoSend: true });
+    expect(result.current.link?.autoSend).toBe(true);
+  });
+
+  it("resolves null on a failed read, and leaves the last good link in place", async () => {
+    let ok = true;
+    const api = vi.fn(async () =>
+      ok
+        ? new Response(
+            JSON.stringify({
+              available: true,
+              linked: true,
+              c2UserId: 1,
+              autoSend: true,
+            }),
+            { status: 200, headers: { "Content-Type": "application/json" } },
+          )
+        : new Response("gone", { status: 502 }),
+    );
+    vi.doMock("../api", () => ({ api }));
+    const { useConcept2Link } = await import("./useConcept2Link");
+    const { result } = renderHook(() => useConcept2Link());
+    await waitFor(() => expect(result.current.link).not.toBeNull());
+
+    ok = false;
+    let fresh: Concept2Link | null = LINK_UNAVAILABLE;
+    await act(async () => {
+      fresh = await result.current.reload();
+    });
+    expect(fresh).toBeNull();
+    expect(result.current.failed?.status).toBe(502);
+    expect(result.current.link?.autoSend).toBe(true);
+  });
+});
diff --git a/app/src/api/useConcept2Link.ts b/app/src/api/useConcept2Link.ts
index 8861b7ae..f7e21c7a 100644
--- a/app/src/api/useConcept2Link.ts
+++ b/app/src/api/useConcept2Link.ts
@@ -31,6 +31,21 @@ export interface Concept2Link {
    *  a hardcoded guess 404s the View-on-Concept2 link-out for the whole
    *  sandbox phase (plan observation 5). */
   logbookBaseUrl: string | null;
+  /** Wave E auto-send §3.1: the sending mode. `true` = AUTOMATIC (a finished
+   *  monitor row is sent the moment it saves); `false` = MANUAL (today's
+   *  per-row Send). Read as `raw.autoSend === true` — absent, unreadable,
+   *  `"true"`, `1` all read false (A2): the only way to be automatic is a
+   *  literal `true` from the server. */
+  autoSend: boolean;
+  /** The sticky "sends are failing" flag (rulings 6, 7): the ISO instant of
+   *  the last eligible send refused for want of a weight class, and its
+   *  SUB-reason (`no_weight` | `unreadable_weight` | `implausible_weight` |
+   *  `no_gender` — the key the You screen's sentence is chosen by). Both
+   *  null when the last send landed or Concept2 already had the row. Read by
+   *  the You row (`SEND FAILED`), the card's pill, and the screen's mode
+   *  line; never by the send block. */
+  sendFailedAt: string | null;
+  sendFailedReason: string | null;
 }
 
 /** The answer for "this deployment has no Concept2" — amendment 1h, which
@@ -47,6 +62,9 @@ export const LINK_UNAVAILABLE: Concept2Link = {
   c2Username: null,
   needsReauth: false,
   logbookBaseUrl: null,
+  autoSend: false,
+  sendFailedAt: null,
+  sendFailedReason: null,
 };
 
 export function normalizeLink(body: unknown): Concept2Link {
@@ -84,6 +102,20 @@ export function normalizeLink(body: unknown): Concept2Link {
       typeof raw.logbookBaseUrl === "string" && raw.logbookBaseUrl !== ""
         ? raw.logbookBaseUrl
         : null,
+    // Wave E auto-send: `=== true`, not truthiness — a server that predates
+    // the column sends no key and must read MANUAL, and a stray `"true"` or
+    // `1` must not put a rower on AUTOMATIC (A2, fail-closed by construction).
+    autoSend: raw.autoSend === true,
+    // ABSENT, EMPTY, VALUED — the same three-case treatment as the two
+    // strings above; an empty instant or reason is not a flag.
+    sendFailedAt:
+      typeof raw.sendFailedAt === "string" && raw.sendFailedAt !== ""
+        ? raw.sendFailedAt
+        : null,
+    sendFailedReason:
+      typeof raw.sendFailedReason === "string" && raw.sendFailedReason !== ""
+        ? raw.sendFailedReason
+        : null,
   };
 }
 
@@ -97,6 +129,30 @@ export interface LinkReadFailure {
   status: number | null;
 }
 
+/** ONE read of `GET /api/concept2/link`, parsed — the hook's own read, and
+ *  the read `log/concept2Send.ts`'s `autoSendAfterSave` takes after a 201
+ *  (Wave E auto-send §3.3: the decision is made on a FRESH answer, never on
+ *  a mount-time snapshot). `failed` carries the status the way the hook's
+ *  `failed` state does; `null` status means the request never completed.
+ *  Never throws. */
+export async function fetchLink(): Promise<
+  { link: Concept2Link } | { failed: LinkReadFailure }
+> {
+  try {
+    const res = await api("/api/concept2/link");
+    if (!res.ok) return { failed: { status: res.status } };
+    let body: unknown;
+    try {
+      body = (await res.json()) as unknown;
+    } catch {
+      return { failed: { status: res.status } };
+    }
+    return { link: normalizeLink(body) };
+  } catch {
+    return { failed: { status: null } };
+  }
+}
+
 /**
  * Reads the link on mount, on demand, and whenever the document comes back
  * in front of the rower.
@@ -155,7 +211,12 @@ export interface LinkReadFailure {
 export function useConcept2Link(): {
   link: Concept2Link | null;
   failed: LinkReadFailure | null;
-  reload: () => Promise<void>;
+  /** Reads the link and applies it. RESOLVES to the link it applied, or
+   *  `null` when the read failed or a newer read superseded it — so a caller
+   *  that must decide on a FRESH answer (Wave E auto-send §3.3: the log form,
+   *  after a 201) awaits this and never acts on a null. Existing callers that
+   *  `void reload()` are unaffected. */
+  reload: () => Promise<Concept2Link | null>;
 } {
   const [link, setLink] = useState<Concept2Link | null>(null);
   const [failed, setFailed] = useState<LinkReadFailure | null>(null);
@@ -167,35 +228,21 @@ export function useConcept2Link(): {
    *  component. Nothing outside this hook can read or write it. */
   const generation = useRef(0);
 
-  const reload = useCallback(() => {
+  const reload = useCallback((): Promise<Concept2Link | null> => {
     const mine = ++generation.current;
-    const superseded = () => mine !== generation.current;
-    return api("/api/concept2/link")
-      .then(async (res) => {
-        if (superseded()) return;
-        if (!res.ok) {
-          setFailed({ status: res.status });
-          return;
-        }
-        let body: unknown;
-        try {
-          body = (await res.json()) as unknown;
-        } catch {
-          if (superseded()) return;
-          setFailed({ status: res.status });
-          return;
-        }
-        // Re-checked AFTER the body await as well as before it: `res.json()`
-        // settles on a later task, and a foreground burst can start a newer
-        // read inside that window.
-        if (superseded()) return;
-        setLink(normalizeLink(body));
-        setFailed(null);
-      })
-      .catch(() => {
-        if (superseded()) return;
-        setFailed({ status: null });
-      });
+    return fetchLink().then((result): Concept2Link | null => {
+      // Checked once the WHOLE read has settled — `fetchLink` awaits the
+      // body as well as the headers, and a foreground burst can start a
+      // newer read inside either window. A superseded read applies nothing.
+      if (mine !== generation.current) return null;
+      if ("failed" in result) {
+        setFailed(result.failed);
+        return null;
+      }
+      setLink(result.link);
+      setFailed(null);
+      return result.link;
+    });
   }, []);
 
   useEffect(() => {
diff --git a/app/src/monitor/Concept2LinkProbe.tsx b/app/src/monitor/Concept2LinkProbe.tsx
index 9e641728..e5c9af24 100644
--- a/app/src/monitor/Concept2LinkProbe.tsx
+++ b/app/src/monitor/Concept2LinkProbe.tsx
@@ -75,6 +75,10 @@ import { startLink, type LinkOutcome } from "../adapters/linkFlow";
  * here purely to keep that equality; the probe's behaviour is unchanged and
  * it renders neither.
  */
+// The three Wave E auto-send keys (`autoSend`, `sendFailedAt`,
+// `sendFailedReason`) are declared below so `scripts/webauth-contract.test.ts`'s
+// key-set pin stays true; the probe renders none of them. No comments INSIDE
+// the braces — that pin's extractor reads the interface body verbatim.
 interface LinkStatus {
   available: boolean;
   linked?: boolean;
@@ -82,6 +86,9 @@ interface LinkStatus {
   c2Username?: string | null;
   logbookBaseUrl?: string;
   needsReauth?: boolean;
+  autoSend?: boolean;
+  sendFailedAt?: string | null;
+  sendFailedReason?: string | null;
 }
 
 /** `n/a` for the outcomes that never parsed a callback at all (a plugin
diff --git a/app/src/you/Concept2Row.test.tsx b/app/src/you/Concept2Row.test.tsx
index 962cacf1..6bfd9d9a 100644
--- a/app/src/you/Concept2Row.test.tsx
+++ b/app/src/you/Concept2Row.test.tsx
@@ -38,8 +38,16 @@ const LINKED: Concept2Link = {
   c2Username: "jamesawesome",
   needsReauth: false,
   logbookBaseUrl: "https://log-dev.concept2.com",
+  autoSend: false,
+  sendFailedAt: null,
+  sendFailedReason: null,
 };
 const REAUTH: Concept2Link = { ...LINKED, needsReauth: true };
+const SEND_FAILED: Concept2Link = {
+  ...LINKED,
+  sendFailedAt: "2026-09-05T12:00:00.000Z",
+  sendFailedReason: "no_weight",
+};
 const FAILED = { status: 502 };
 
 beforeEach(() => {
@@ -80,6 +88,40 @@ describe("rowState — the decision table, all eleven leaf cells (spec §5.1)",
     expect(rowState(link, failed, seen)).toBe(expected);
   });
 
+  // Wave E auto-send §3.4 (A8): the fifth string. Server-sticky like
+  // needsReauth — RECONNECT NEEDED > SEND FAILED > LINKED ✓, and both sticky
+  // states beat a transient read failure (ruling 5's shape).
+  it.each([
+    ["11 flagged, read ok", SEND_FAILED, null, false, "SEND FAILED"],
+    ["12 flagged, read failed", SEND_FAILED, FAILED, false, "SEND FAILED"],
+    [
+      "13 flagged AND needsReauth",
+      { ...SEND_FAILED, needsReauth: true },
+      null,
+      false,
+      "RECONNECT NEEDED",
+    ],
+    [
+      "14 flagged AND needsReauth, read failed",
+      { ...SEND_FAILED, needsReauth: true },
+      FAILED,
+      true,
+      "RECONNECT NEEDED",
+    ],
+  ] as const)("cell %s", (_cell, link, failed, seen, expected) => {
+    expect(rowState(link, failed, seen)).toBe(expected);
+  });
+
+  it("a flag on an UNLINKED shape is not a fact: SEND FAILED is a LINKED state only", () => {
+    expect(
+      rowState(
+        { ...AVAILABLE_UNLINKED, sendFailedAt: "2026-09-05T12:00:00.000Z" },
+        null,
+        false,
+      ),
+    ).toBe("NOT LINKED");
+  });
+
   it("cell 10 is ruling 5: a failed re-read does NOT overwrite a sticky RECONNECT NEEDED", () => {
     // Stated on its own because it is the cell the whole revision exists
     // for, and the one the card's own ordering would get wrong.
@@ -107,6 +149,12 @@ describe("Concept2Row on You (spec §5.1 R1-R4, R11)", () => {
     expect(await screen.findByText("LINKED ✓")).toBeInTheDocument();
   });
 
+  it("cell 11: a send-failed flag reads SEND FAILED on the row (Wave E auto-send A8)", async () => {
+    c2Link.body = SEND_FAILED;
+    renderRow();
+    expect(await screen.findByText("SEND FAILED")).toBeInTheDocument();
+  });
+
   it("cell 9: needsReauth reads RECONNECT NEEDED — the pre-emptive warning the row exists for (R3)", async () => {
     c2Link.body = REAUTH;
     renderRow();
diff --git a/app/src/you/concept2CardModel.test.ts b/app/src/you/concept2CardModel.test.ts
index 9d3af6ce..dd5f2b04 100644
--- a/app/src/you/concept2CardModel.test.ts
+++ b/app/src/you/concept2CardModel.test.ts
@@ -60,6 +60,9 @@ const LINKED: Concept2Link = {
   c2Username: "jamesawesome",
   needsReauth: false,
   logbookBaseUrl: "https://log-dev.concept2.com",
+  autoSend: false,
+  sendFailedAt: null,
+  sendFailedReason: null,
 };
 
 describe("identityLine (Gate 0 amendment 1c)", () => {
diff --git a/app/src/you/concept2RowState.ts b/app/src/you/concept2RowState.ts
index d0806f74..ea1e62b4 100644
--- a/app/src/you/concept2RowState.ts
+++ b/app/src/you/concept2RowState.ts
@@ -7,7 +7,12 @@ import type { Concept2Link, LinkReadFailure } from "../api/useConcept2Link";
  * the one place this departs from the card's own ordering (ruling 5).
  */
 export type RowState =
-  "NOT LINKED" | "LINKED ✓" | "RECONNECT NEEDED" | "COULDN'T READ" | null;
+  | "NOT LINKED"
+  | "LINKED ✓"
+  | "RECONNECT NEEDED"
+  | "SEND FAILED"
+  | "COULDN'T READ"
+  | null;
 
 export function rowState(
   link: Concept2Link | null,
@@ -27,6 +32,11 @@ export function rowState(
   // Cells 9, 10 — before `failed`, on purpose (ruling 5). R3: no other state
   // can hide a broken link.
   if (link.linked && link.needsReauth) return "RECONNECT NEEDED";
+  // Wave E auto-send §3.4 (A8): the fifth string. Server-sticky like
+  // `needsReauth`, so it too beats a transient read failure (ruling 5's
+  // reason: a read that FAILED cannot have cleared it), and sits below
+  // RECONNECT NEEDED because a dead grant is the bigger fact.
+  if (link.linked && link.sendFailedAt !== null) return "SEND FAILED";
   // Cells 6, 8: a retained AVAILABLE link, so the rower knows the feature
   // exists and the failure is worth telling them about.
   if (failed !== null) return "COULDN'T READ";
```

</details>

---

## Task 3: the card — OFF · MANUAL · AUTOMATIC replaces Unlink; the mode line; the pill; the remedy

**Commit:** `8f3b54af`.

**Files:** `app/src/you/Concept2Card.tsx`, `app/src/you/concept2CardModel.ts`, `app/src/index.css`, `app/src/you/Concept2Card.test.tsx`, `app/e2e/fixtures/c2-card-armed.html` (regenerated), `app/e2e/fixtures/c2-card-linked.html` (new), `app/e2e/design.spec.ts` (fixture heights re-registered; the in-situ tap sweep taps OFF).

**Interfaces produced:** `modeLine(link): { text, warn, remedy }` and `linkedPill(link)` in the card model — the pill and the line read the You row's precedence (`needsReauth` → flag → mode). Copy per Gate 0 §1a/§3/§4a: MANUAL _"Send each finished monitor row yourself, from the log."_, AUTOMATIC _"Finished monitor rows are sent when you save them."_, paused _"Sends are paused until you reconnect."_, three failure lines on the _"Rows aren't being sent:"_ prefix (`implausible_weight` shares `unreadable_weight`'s; unknown shares `no_gender`'s). A7 line _"Couldn't change this. Try again."_

**The control:** `role="group" aria-label="Sending mode"` holding three `<button aria-pressed>` — NOT a radiogroup (F4; arrows move focus only, via one `onKeyDown` on the group). OFF arms (existing two-tap, 4 s disarm, disclosure and foot kept); while armed OFF alone is pressed, reads _Tap again to unlink_, spans the control at 52 px (`.c2-card-mode-armed`), and the siblings are `display: none`. MANUAL/AUTOMATIC → `setMode(autoSend)`: disarm, no-op when already the server's mode, else PATCH with the JSON header and body, `modeFailed` on non-2xx/throw, and `reload()` in the `finally` (I1: pressed state is drawn from `link`, never the tap). `disabled={busy || modeBusy}` on all three. The helper _"Finished monitor rows can be sent from the log."_ and `.c2-card-helper`/`.c2-card-danger*` CSS are deleted (RF5).

**Lifetime table (RF27) for the state this task mints — invariants, not mechanisms:**

| state | mint | clear sites | survives |
| --- | --- | --- | --- |
| `armed` (the OFF arm) | first OFF tap | the second tap (unlink runs), the 4 s timer, ANY other tap on the control (`setMode` disarms first), unmount / route change (effect cleanup) | nothing — never a link change, never a screen change |
| `modeBusy` | `setMode` past the same-mode return | `setMode`'s `finally`, after the re-read | one write; the control's unmount mid-write discards it |
| `modeFailed` (the A7 line) | a non-2xx or thrown PATCH | any tap that reaches `setMode`; and the UNMOUNT of `SendingModeControl`, which the card mounts only while `link.linked` (review fix round, `4bfe26f3` — the earlier `connect()`-entry clear missed the `pageshow` re-read and the Retry paths back to a linked card) | nothing past the card reading UNLINKED; a same-account relink the card never saw as unlinked (the link, to this card, never changed) |
| `link` / `failed` (the hook) | mount read | every re-read (`pageshow`, `visibilitychange`, `reload()`) | a superseded read applies nothing (generation token) |

**Layout departure (recorded on the design page §9):** the mode line sits in the ACT column beneath the control in both orientations; the page's landscape frame drew it in the tell column.

**Numbers (Gate 0 §7, restated in `index.css`):** unpressed `--ink` on `--surface` 17.11:1; pressed `--on-color` on `--ink` 17.11:1; armed `--on-color` on `--accent` 5.94:1; disabled `--ink-3` on `--surface` 7.43:1; mode line `--ink-3` 7.43:1, warn `--ink` 17.11:1; remedy link-out `--ink` mono 12px (NOT the block's accent — `--accent` gains no new use). Segments ≥ 44 px; portrait width ≥ 104 px.

**Tests:** card suite 64 passed — "the sending-mode control (§3.2)" 12 tests (group shape and pressed states; PATCH body/header/order; no PATCH on the pressed segment; disabled in flight; A7 on 500 and on throw; A7 clears; arrows focus-only; Enter commits; armed OFF pressed alone + disarm restores; MANUAL while armed disarms and writes nothing); "the mode line and pill" 9 tests (paused; five sub-reasons; remedy opens the live profile; no remedy without an origin; needsReauth beats the flag); fixture equality for `c2-card-linked.html` and the regenerated `c2-card-armed.html`. Model suite 28 passed.

**Mutations (measured):**

| # | mutation | failure |
| --- | --- | --- |
| M9 | MANUAL's `aria-pressed={!armed && !link.autoSend}` → `{!link.autoSend}` | `c2-card-armed.html is what the armed card renders` — fixture equality (two pressed segments) |
| M10 | delete the same-mode early return in `setMode` | `tapping the segment that is already pressed writes NOTHING` — `called 1 times, but got 3 times`; and the armed-MANUAL test |
| M11 | delete `await reload()` from `setMode`'s `finally` | 3 failed: `tapping AUTOMATIC PATCHes … then re-reads and presses what the server holds` (pressed state never moves), MANUAL-from-AUTOMATIC, Enter |
| M12 | delete `modeLine`'s `needsReauth` branch | `needsReauth: the line reads paused…` and `needsReauth beats SEND FAILED…` |
| M16 | delete `.c2-card-mode-is-armed > .c2-card-mode-btn:not(.c2-card-mode-armed) { display: none }` | e2e `armed OFF spans the control alone; the other segments are hidden until it disarms` — `expect(locator).toBeHidden() failed … Expected: hidden, Received: visible` on MANUAL (stack rebuilt with the mutant, 1 failed) |

- [ ] **Step 1: the commit is the implementation.** Review package: `git show 8f3b54af` (stat below). Reviewer: brief = this task's section; diff = the commit; gates = the suites named above, re-run from `app/`.

```
8f3b54af Auto-send: OFF · MANUAL · AUTOMATIC replaces Unlink on the card

 app/e2e/design.spec.ts               |  18 +-
 app/e2e/fixtures/c2-card-armed.html  |   6 +-
 app/e2e/fixtures/c2-card-linked.html |  20 ++
 app/src/index.css                    | 129 +++++++--
 app/src/you/Concept2Card.test.tsx    | 499 +++++++++++++++++++++++++++++++----
 app/src/you/Concept2Card.tsx         | 184 +++++++++++--
 app/src/you/concept2CardModel.ts     |  78 ++++++
 7 files changed, 836 insertions(+), 98 deletions(-)
```

<details>
<summary>The diff, verbatim (<code>git show 8f3b54af</code>)</summary>

```diff
diff --git a/app/e2e/design.spec.ts b/app/e2e/design.spec.ts
index 575e671f..0ee3b5d6 100644
--- a/app/e2e/design.spec.ts
+++ b/app/e2e/design.spec.ts
@@ -10524,7 +10524,12 @@ test.describe("Concept2 card: the landscape interior (Gate 0 amendment §1a-1j)"
     // census, and this one had already gone stale in the round that wrote it.
     const cases: [string, string, number][] = [
       ["c2-card-unlinked.html", ".c2-card-primary", 48],
-      ["c2-card-armed.html", ".c2-card-danger", 52],
+      // Wave E auto-send: the armed OFF segment spans the control at the
+      // danger button's 52px (Gate 0 amendment 2026-09-05 §2a); at rest each
+      // segment is the row's 44px — measured on the pressed one, which is
+      // the only segment a selector can name once.
+      ["c2-card-armed.html", ".c2-card-mode-armed", 52],
+      ["c2-card-linked.html", '.c2-card-mode-btn[aria-pressed="true"]', 44],
       ["c2-card-read-failed.html", ".c2-card-retry", 52],
     ];
     for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
@@ -10891,15 +10896,15 @@ test.describe("Concept2 surfaces on the real screens (Wave E PR2)", () => {
     await openYouLinked(page, "taps");
     for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
       await page.setViewportSize(vp);
-      await expect(
-        page.getByRole("button", { name: "Unlink Concept2" }),
-      ).toBeVisible();
+      // Wave E auto-send: the three-segment control where Unlink was; every
+      // segment is a tappable this sweep measures in the real column.
+      await expect(page.getByRole("button", { name: "OFF" })).toBeVisible();
       await assertTapTargets(page);
     }
     // And the ARMED state, whose control is a different element with
     // different text — a sweep of the resting card alone would never
     // measure it.
-    await page.getByRole("button", { name: "Unlink Concept2" }).click();
+    await page.getByRole("button", { name: "OFF" }).click();
     await expect(
       page.getByRole("button", { name: "Tap again to unlink" }),
     ).toBeVisible();
@@ -10953,7 +10958,8 @@ test.describe("Concept2 surfaces on the real screens (Wave E PR2)", () => {
         body: JSON.stringify(C2_LINKED),
       });
     });
-    await page.getByRole("button", { name: "Unlink Concept2" }).click();
+    // Wave E auto-send: the unlink is the control's OFF segment.
+    await page.getByRole("button", { name: "OFF" }).click();
     await page.getByRole("button", { name: "Tap again to unlink" }).click();
     const reason = page.locator(".c2-card-panel-reason");
     await expect(reason).toBeVisible();
diff --git a/app/e2e/fixtures/c2-card-armed.html b/app/e2e/fixtures/c2-card-armed.html
index 1b28479c..513570f7 100644
--- a/app/e2e/fixtures/c2-card-armed.html
+++ b/app/e2e/fixtures/c2-card-armed.html
@@ -10,7 +10,11 @@
 <p class="c2-card-explain">Unlink removes this app's access. Rows already sent stay on Concept2.</p>
 </div>
 <div class="c2-card-act">
-<button type="button" class="c2-card-danger c2-card-danger-armed">Tap again to unlink</button>
+<div class="c2-card-mode c2-card-mode-is-armed" role="group" aria-label="Sending mode">
+<button type="button" class="c2-card-mode-btn c2-card-mode-armed" aria-pressed="true">Tap again to unlink</button>
+<button type="button" class="c2-card-mode-btn" aria-pressed="false">MANUAL</button>
+<button type="button" class="c2-card-mode-btn" aria-pressed="false">AUTOMATIC</button>
+</div>
 <p class="c2-card-foot">DISARMS ON ITS OWN AFTER 4 SECONDS</p>
 </div>
 </div>
diff --git a/app/e2e/fixtures/c2-card-linked.html b/app/e2e/fixtures/c2-card-linked.html
new file mode 100644
index 00000000..53321142
--- /dev/null
+++ b/app/e2e/fixtures/c2-card-linked.html
@@ -0,0 +1,20 @@
+<section class="c2-card" aria-labelledby="c2-card-label">
+<div class="c2-card-head">
+<h2 class="c2-card-label" id="c2-card-label">CONCEPT2</h2>
+<span class="c2-card-status c2-card-status-on">LINKED ✓</span>
+</div>
+<div class="c2-card-body c2-card-body-split">
+<div class="c2-card-tell">
+<p class="c2-card-identity">Concept2 jamesawesome · Ergomatic james@jamestheaweso.me</p>
+</div>
+<div class="c2-card-act">
+<hr class="c2-card-hair">
+<div class="c2-card-mode" role="group" aria-label="Sending mode">
+<button type="button" class="c2-card-mode-btn" aria-pressed="false">OFF</button>
+<button type="button" class="c2-card-mode-btn" aria-pressed="true">MANUAL</button>
+<button type="button" class="c2-card-mode-btn" aria-pressed="false">AUTOMATIC</button>
+</div>
+<p class="c2-card-mode-line">Send each finished monitor row yourself, from the log.</p>
+</div>
+</div>
+</section>
diff --git a/app/src/index.css b/app/src/index.css
index 83a6e36b..9e6cf8c8 100644
--- a/app/src/index.css
+++ b/app/src/index.css
@@ -10273,12 +10273,6 @@ section:not(.news-pinned) .news-row:last-of-type {
   color: var(--ink);
 }
 
-.c2-card-helper {
-  margin: 0;
-  font-size: 12px;
-  color: var(--ink-3);
-}
-
 .c2-card-foot {
   margin: 0;
   text-align: center;
@@ -10405,26 +10399,123 @@ section:not(.news-pinned) .news-row:last-of-type {
   font-weight: 600;
 }
 
-/* Board 1c/1d. Accent's third canonical job, a destructive control
-   (docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md), so it needs no
-   dispensation — unlike the log row's link-out, which is recorded as a
-   DEVIATIONS row (this PR's Task 13). Outlined at rest, filled when armed:
-   index.css's own "4 · destructive" comment sets that vocabulary. */
-.c2-card-danger {
-  min-height: 52px;
+/* Wave E auto-send (spec 2026-09-05 §3.2; Gate 0 amendment 2026-09-05 §1,
+   §2, §7). The sending-mode control, OFF · MANUAL · AUTOMATIC, where the
+   `Unlink Concept2` button stood (`.c2-card-danger` and `-armed` were
+   deleted with it — RF5). Three `aria-pressed` buttons on one grid, one
+   hairline border shared, each segment the row's 44px and a third of the
+   act column (≥ 104px in portrait).
+
+   NO NEW TIER: the pressed segment is the primary button's fill (`--ink`,
+   `--on-color` on it 17.11:1) and the unpressed one its outline (`--ink` on
+   `--surface` 17.11:1). The armed OFF is the danger button's own fill moved
+   onto the segment — `--on-color` on `--accent` 5.94:1, 52px, 15px sans
+   600, spanning the control — so `--accent` gains no new use. Disabled
+   (a PATCH in flight): `--ink-3` on `--surface` 7.43:1. All ≥ 4.5. */
+.c2-card-mode {
+  display: grid;
+  grid-template-columns: 1fr 1fr 1fr;
+  gap: 0;
+  border: 1px solid var(--ink);
+}
+
+.c2-card-mode-btn {
+  min-height: var(--tap);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  padding: 0 4px;
   background: transparent;
-  border: 1px solid var(--accent);
+  border: 0;
+  border-left: 1px solid var(--ink);
   border-radius: 0;
-  color: var(--accent);
-  font-family: var(--font-sans);
-  font-size: 16px;
+  color: var(--ink);
+  font-family: var(--font-mono);
+  font-size: 12px;
+  letter-spacing: 0.1em;
+}
+
+.c2-card-mode-btn:first-child {
+  border-left: 0;
+}
+
+.c2-card-mode-btn[aria-pressed="true"] {
+  background: var(--ink);
+  color: var(--on-color);
   font-weight: 600;
 }
 
-.c2-card-danger-armed {
-  background: var(--accent);
+.c2-card-mode-btn:disabled {
+  color: var(--ink-3);
+  border-color: var(--rule-3);
+}
+
+/* Armed OFF spans the control as today's full-width "Tap again to unlink"
+   (Gate 0 §2a, ruled on sight: the segments' mono caps wrapped and sat
+   off-centre). The sibling segments are hidden, not disabled — the pressed
+   state has not committed, and a disarm brings them back reading the
+   server's mode. `[aria-pressed="true"]` is restated so the specificity of
+   the pressed rule above cannot win the fill back to `--ink`. */
+.c2-card-mode-is-armed {
   border-color: var(--accent);
+}
+
+.c2-card-mode-armed,
+.c2-card-mode-armed[aria-pressed="true"] {
+  grid-column: 1 / -1;
+  min-height: 52px;
+  background: var(--accent);
   color: var(--on-color);
+  font-family: var(--font-sans);
+  font-size: 15px;
+  font-weight: 600;
+  letter-spacing: 0;
+  border-left: 0;
+}
+
+.c2-card-mode-is-armed > .c2-card-mode-btn:not(.c2-card-mode-armed) {
+  display: none;
+}
+
+/* The line beneath the control (Gate 0 §1a, §3, §4a). `--ink-3` at rest,
+   `--ink` when it carries the send-failed reason — the same two steps the
+   card's helper and explain lines already use, no new colour. */
+.c2-card-mode-line {
+  margin: 0;
+  font-size: 12px;
+  color: var(--ink-3);
+}
+
+.c2-card-mode-line-warn {
+  color: var(--ink);
+}
+
+/* A7: a refused or thrown PATCH. Plain `--ink` at the explain size — it is
+   a sentence, not a panel; the pressed segment already shows the truth. */
+.c2-card-mode-error {
+  margin: 0;
+  font-size: 14px;
+  color: var(--ink);
+}
+
+/* The block's remedy on the card (Gate 0 amendment 2026-09-05 §4a, drawn
+   in the frame's `.linkrow`): `--ink` on `--surface` 17.11:1 (§7's "remedy
+   link-out" row), mono caps at the row's 44px. NOT the block's own
+   `.c2-send-linkout` accent — §7 rules that `--accent` gains no new use
+   beyond the armed OFF, and DEVIATIONS' link-out row stays scoped to
+   Surface 2. */
+.c2-card-linkout {
+  min-height: var(--tap);
+  display: flex;
+  align-items: center;
+  background: transparent;
+  border: 0;
+  padding: 0;
+  color: var(--ink);
+  font-family: var(--font-mono);
+  font-size: 12px;
+  letter-spacing: 0.08em;
+  text-align: left;
 }
 
 /* Landscape: the two-column card interior, for the SEVEN frames the
diff --git a/app/src/you/Concept2Card.test.tsx b/app/src/you/Concept2Card.test.tsx
index 920bc379..542bbe70 100644
--- a/app/src/you/Concept2Card.test.tsx
+++ b/app/src/you/Concept2Card.test.tsx
@@ -5,6 +5,7 @@ import {
   act,
   waitFor,
   fireEvent,
+  within,
 } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 import { readFileSync } from "node:fs";
@@ -178,9 +179,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
   it("does not delete on the first tap", async () => {
     const { api } = mount(LINKED);
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     expect(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     ).toBeTruthy();
@@ -192,9 +191,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
   it("deletes on the second tap", async () => {
     const { api } = mount(LINKED);
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -217,7 +214,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     mount(LINKED);
     await renderCard();
     const unlink = await screen.findByRole("button", {
-      name: "Unlink Concept2",
+      name: "OFF",
     });
     vi.useFakeTimers();
     fireEvent.click(unlink);
@@ -235,9 +232,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     act(() => {
       vi.advanceTimersByTime(1);
     });
-    expect(
-      screen.getByRole("button", { name: "Unlink Concept2" }),
-    ).toBeTruthy();
+    expect(screen.getByRole("button", { name: "OFF" })).toBeTruthy();
   });
 
   it("says the link is unchanged when the DELETE is refused, instead of appearing to do nothing", async () => {
@@ -256,9 +251,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     vi.doMock("../api", () => ({ api }));
     vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -286,17 +279,13 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     vi.doMock("../api", () => ({ api }));
     vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
     await screen.findByText("Couldn't unlink. Your link is unchanged.");
     deleteOk = true;
-    await userEvent.click(
-      screen.getByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(screen.getByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -338,9 +327,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
       await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
     );
     await screen.findByText("LINKED ✓");
-    await userEvent.click(
-      screen.getByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(screen.getByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -392,9 +379,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     await userEvent.click(
       await screen.findByRole("button", { name: "RECONNECT CONCEPT2" }),
     );
-    await userEvent.click(
-      screen.getByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(screen.getByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -422,9 +407,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     vi.doMock("../api", () => ({ api }));
     vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -435,9 +418,7 @@ describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
     // The grant is genuinely still live and the card still says so; and the
     // arm is spent on this exit too, so no stray tap re-fires the DELETE.
     expect(screen.getByText("LINKED ✓")).toBeTruthy();
-    expect(
-      screen.getByRole("button", { name: "Unlink Concept2" }),
-    ).toBeTruthy();
+    expect(screen.getByRole("button", { name: "OFF" })).toBeTruthy();
   });
 });
 
@@ -699,6 +680,423 @@ describe("Concept2Card panel lines no type protects (Task 1 review F9)", () => {
   });
 });
 
+// Wave E auto-send, spec 2026-09-05 §3.2 and §3.4; Gate 0 amendment
+// 2026-09-05. The control that replaced `Unlink Concept2`: OFF arms the
+// unlink (tested above under "unlink"), MANUAL and AUTOMATIC each PATCH the
+// link and re-read it. Every PATCH assertion below reads the BODY the wire
+// would carry, not a call count — the delta pass's F1 was a send call that
+// did not typecheck behind a green count.
+describe("the sending-mode control (Wave E auto-send §3.2)", () => {
+  function patches(api: ReturnType<typeof vi.fn>) {
+    return api.mock.calls
+      .filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")
+      .map((c) => ({
+        path: c[0] as string,
+        headers: (c[1] as RequestInit).headers,
+        body: JSON.parse(String((c[1] as RequestInit).body)) as unknown,
+      }));
+  }
+
+  /** A link mock whose GET answer FOLLOWS the last PATCH, the way the server
+   *  does — so the pressed segment after a tap is the re-read's answer, and
+   *  a test that saw it move has proved the re-read, not the tap. */
+  function mountFollowing(initial: typeof LINKED & { autoSend?: boolean }) {
+    let current: Record<string, unknown> = { ...initial };
+    const api = vi.fn(async (_path: string, init?: RequestInit) => {
+      if (init?.method === "PATCH") {
+        const body = JSON.parse(String(init.body)) as { autoSend: boolean };
+        current = { ...current, autoSend: body.autoSend };
+        return new Response(null, { status: 204 });
+      }
+      return new Response(JSON.stringify(current), {
+        status: 200,
+        headers: { "Content-Type": "application/json" },
+      });
+    });
+    vi.doMock("../api", () => ({ api }));
+    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
+    return { api };
+  }
+
+  it("renders three aria-pressed buttons in a labelled group, MANUAL pressed for a fresh link (A2: fail-closed)", async () => {
+    mount(LINKED);
+    await renderCard();
+    const group = await screen.findByRole("group", { name: "Sending mode" });
+    const buttons = within(group).getAllByRole("button");
+    expect(buttons.map((b) => b.textContent)).toStrictEqual([
+      "OFF",
+      "MANUAL",
+      "AUTOMATIC",
+    ]);
+    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toStrictEqual([
+      "false",
+      "true",
+      "false",
+    ]);
+    // Never a radiogroup (F4): the roving idiom commits on arrow.
+    expect(screen.queryByRole("radiogroup")).toBeNull();
+    expect(
+      screen.queryByRole("button", { name: "Unlink Concept2" }),
+    ).toBeNull();
+  });
+
+  it("AUTOMATIC pressed when the server says autoSend, with the promise as its line", async () => {
+    mount({ ...LINKED, autoSend: true });
+    await renderCard();
+    expect(
+      await screen.findByRole("button", { name: "AUTOMATIC", pressed: true }),
+    ).toBeTruthy();
+    expect(
+      screen.getByRole("button", { name: "MANUAL", pressed: false }),
+    ).toBeTruthy();
+    expect(
+      screen.getByText("Finished monitor rows are sent when you save them."),
+    ).toBeTruthy();
+  });
+
+  it("tapping AUTOMATIC PATCHes { autoSend: true } as JSON, then re-reads and presses what the server holds", async () => {
+    const { api } = mountFollowing(LINKED);
+    await renderCard();
+    await userEvent.click(
+      await screen.findByRole("button", { name: "AUTOMATIC" }),
+    );
+    await screen.findByRole("button", { name: "AUTOMATIC", pressed: true });
+    expect(patches(api)).toStrictEqual([
+      {
+        path: "/api/concept2/link",
+        headers: { "Content-Type": "application/json" },
+        body: { autoSend: true },
+      },
+    ]);
+    // Invariant I1: the pressed state came from a GET AFTER the PATCH.
+    const order = api.mock.calls.map(
+      (c) => (c[1] as RequestInit | undefined)?.method ?? "GET",
+    );
+    expect(order.indexOf("PATCH")).toBeLessThan(order.lastIndexOf("GET"));
+    expect(
+      screen.getByText("Finished monitor rows are sent when you save them."),
+    ).toBeTruthy();
+  });
+
+  it("tapping MANUAL from AUTOMATIC PATCHes { autoSend: false }", async () => {
+    const { api } = mountFollowing({ ...LINKED, autoSend: true });
+    await renderCard();
+    await userEvent.click(
+      await screen.findByRole("button", { name: "MANUAL" }),
+    );
+    await screen.findByRole("button", { name: "MANUAL", pressed: true });
+    expect(patches(api).map((p) => p.body)).toStrictEqual([
+      { autoSend: false },
+    ]);
+  });
+
+  it("tapping the segment that is already pressed writes NOTHING", async () => {
+    const { api } = mountFollowing(LINKED);
+    await renderCard();
+    await userEvent.click(
+      await screen.findByRole("button", { name: "MANUAL" }),
+    );
+    // Await something the tap could have produced before asserting it did
+    // not: the mount GET is the only call there should be.
+    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
+    expect(patches(api)).toHaveLength(0);
+  });
+
+  it("disables the whole control while the PATCH is in flight, and re-enables after the re-read (A7)", async () => {
+    let release: (() => void) | null = null;
+    const api = vi.fn(async (_path: string, init?: RequestInit) => {
+      if (init?.method === "PATCH") {
+        await new Promise<void>((r) => {
+          release = r;
+        });
+        return new Response(null, { status: 204 });
+      }
+      return new Response(JSON.stringify({ ...LINKED, autoSend: true }), {
+        status: 200,
+        headers: { "Content-Type": "application/json" },
+      });
+    });
+    vi.doMock("../api", () => ({ api }));
+    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
+    await renderCard();
+    await userEvent.click(
+      await screen.findByRole("button", { name: "MANUAL" }),
+    );
+    await waitFor(() => expect(release).not.toBeNull());
+    for (const name of ["OFF", "MANUAL", "AUTOMATIC"]) {
+      expect(screen.getByRole("button", { name })).toBeDisabled();
+    }
+    await act(async () => {
+      release?.();
+    });
+    await waitFor(() =>
+      expect(screen.getByRole("button", { name: "MANUAL" })).toBeEnabled(),
+    );
+  });
+
+  it.each([
+    ["a refused PATCH (500)", new Response("nope", { status: 500 })],
+    ["a thrown PATCH", null],
+  ])(
+    "%s shows the A7 line and leaves the pressed state on the SERVER's value",
+    async (_label, answer) => {
+      const api = vi.fn(async (_path: string, init?: RequestInit) => {
+        if (init?.method === "PATCH") {
+          if (answer === null) throw new Error("offline");
+          return answer;
+        }
+        return new Response(JSON.stringify(LINKED), {
+          status: 200,
+          headers: { "Content-Type": "application/json" },
+        });
+      });
+      vi.doMock("../api", () => ({ api }));
+      vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
+      await renderCard();
+      await userEvent.click(
+        await screen.findByRole("button", { name: "AUTOMATIC" }),
+      );
+      expect(
+        await screen.findByText("Couldn't change this. Try again."),
+      ).toBeTruthy();
+      // The server still says MANUAL, and so does the control.
+      expect(
+        screen.getByRole("button", { name: "MANUAL", pressed: true }),
+      ).toBeTruthy();
+      expect(
+        screen.getByRole("button", { name: "AUTOMATIC", pressed: false }),
+      ).toBeTruthy();
+      expect(screen.getByRole("button", { name: "AUTOMATIC" })).toBeEnabled();
+    },
+  );
+
+  it("the A7 line clears when the next write is attempted", async () => {
+    let fail = true;
+    const api = vi.fn(async (_path: string, init?: RequestInit) => {
+      if (init?.method === "PATCH") {
+        return fail
+          ? new Response("nope", { status: 500 })
+          : new Response(null, { status: 204 });
+      }
+      return new Response(JSON.stringify(LINKED), {
+        status: 200,
+        headers: { "Content-Type": "application/json" },
+      });
+    });
+    vi.doMock("../api", () => ({ api }));
+    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
+    await renderCard();
+    await userEvent.click(
+      await screen.findByRole("button", { name: "AUTOMATIC" }),
+    );
+    await screen.findByText("Couldn't change this. Try again.");
+    fail = false;
+    await userEvent.click(screen.getByRole("button", { name: "AUTOMATIC" }));
+    await waitFor(() =>
+      expect(screen.queryByText("Couldn't change this. Try again.")).toBeNull(),
+    );
+  });
+
+  it("arrows move focus only — no PATCH, no arm (F4)", async () => {
+    const { api } = mount(LINKED);
+    await renderCard();
+    const off = await screen.findByRole("button", { name: "OFF" });
+    off.focus();
+    await userEvent.keyboard("{ArrowRight}");
+    expect(screen.getByRole("button", { name: "MANUAL" })).toHaveFocus();
+    await userEvent.keyboard("{ArrowRight}");
+    expect(screen.getByRole("button", { name: "AUTOMATIC" })).toHaveFocus();
+    await userEvent.keyboard("{ArrowRight}");
+    expect(off).toHaveFocus();
+    await userEvent.keyboard("{ArrowLeft}");
+    expect(screen.getByRole("button", { name: "AUTOMATIC" })).toHaveFocus();
+    expect(patches(api)).toHaveLength(0);
+    expect(
+      screen.queryByRole("button", { name: "Tap again to unlink" }),
+    ).toBeNull();
+    expect(
+      api.mock.calls.filter(
+        (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
+      ),
+    ).toHaveLength(0);
+  });
+
+  it("Enter and Space on AUTOMATIC commit, as a button's own keys do", async () => {
+    const { api } = mountFollowing(LINKED);
+    await renderCard();
+    (await screen.findByRole("button", { name: "AUTOMATIC" })).focus();
+    await userEvent.keyboard("{Enter}");
+    await screen.findByRole("button", { name: "AUTOMATIC", pressed: true });
+    expect(patches(api).map((p) => p.body)).toStrictEqual([{ autoSend: true }]);
+  });
+
+  it("armed OFF is the ONLY segment, pressed, reading the danger copy; disarm returns the pressed state to the server's mode", async () => {
+    vi.useFakeTimers({ shouldAdvanceTime: true });
+    mount({ ...LINKED, autoSend: true });
+    await renderCard();
+    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
+    await user.click(await screen.findByRole("button", { name: "OFF" }));
+    const armed = screen.getByRole("button", { name: "Tap again to unlink" });
+    expect(armed.getAttribute("aria-pressed")).toBe("true");
+    expect(armed.className).toContain("c2-card-mode-armed");
+    // The pressed state has NOT committed: MANUAL/AUTOMATIC are unpressed
+    // (and hidden by CSS the fixture test measures), so a screen reader
+    // hears one pressed state — the one about to be committed.
+    expect(
+      screen
+        .getByRole("button", { name: "MANUAL" })
+        .getAttribute("aria-pressed"),
+    ).toBe("false");
+    expect(
+      screen
+        .getByRole("button", { name: "AUTOMATIC" })
+        .getAttribute("aria-pressed"),
+    ).toBe("false");
+    expect(screen.getByText("DISARMS ON ITS OWN AFTER 4 SECONDS")).toBeTruthy();
+    expect(
+      screen.queryByText("Finished monitor rows are sent when you save them."),
+    ).toBeNull();
+    await act(async () => {
+      vi.advanceTimersByTime(4000);
+    });
+    expect(
+      await screen.findByRole("button", { name: "AUTOMATIC", pressed: true }),
+    ).toBeTruthy();
+    expect(
+      screen.getByRole("button", { name: "OFF", pressed: false }),
+    ).toBeTruthy();
+  });
+
+  it("a tap on MANUAL while armed disarms and writes nothing (the mode is already MANUAL)", async () => {
+    const { api } = mount(LINKED);
+    await renderCard();
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
+    await screen.findByRole("button", { name: "Tap again to unlink" });
+    await userEvent.click(screen.getByRole("button", { name: "MANUAL" }));
+    expect(await screen.findByRole("button", { name: "OFF" })).toBeTruthy();
+    expect(patches(api)).toHaveLength(0);
+    expect(
+      api.mock.calls.filter(
+        (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
+      ),
+    ).toHaveLength(0);
+  });
+});
+
+describe("the mode line and pill under needsReauth and SEND FAILED (Wave E auto-send §3.4)", () => {
+  it("needsReauth: the line reads paused, never AUTOMATIC's promise, and the pill reads RECONNECT NEEDED", async () => {
+    mount({ ...LINKED, needsReauth: true, autoSend: true });
+    await renderCard();
+    expect(await screen.findByText("RECONNECT NEEDED")).toBeTruthy();
+    expect(
+      screen.getByText("Sends are paused until you reconnect."),
+    ).toBeTruthy();
+    expect(
+      screen.queryByText("Finished monitor rows are sent when you save them."),
+    ).toBeNull();
+    // The control is still there, AUTOMATIC still pressed — the mode is the
+    // rower's, only the sending is paused.
+    expect(
+      screen.getByRole("button", { name: "AUTOMATIC", pressed: true }),
+    ).toBeTruthy();
+    expect(
+      screen.getByRole("button", { name: "RECONNECT CONCEPT2" }),
+    ).toBeTruthy();
+  });
+
+  it.each([
+    [
+      "no_weight",
+      "Rows aren't being sent: Concept2 needs a weight class, and your Concept2 profile has no weight set.",
+    ],
+    [
+      "unreadable_weight",
+      "Rows aren't being sent: Concept2 needs a weight class, and we couldn't read the weight on your Concept2 profile.",
+    ],
+    [
+      "implausible_weight",
+      "Rows aren't being sent: Concept2 needs a weight class, and we couldn't read the weight on your Concept2 profile.",
+    ],
+    [
+      "no_gender",
+      "Rows aren't being sent: Concept2 needs a weight class, and we couldn't work one out from your Concept2 profile.",
+    ],
+    [
+      "something_new",
+      "Rows aren't being sent: Concept2 needs a weight class, and we couldn't work one out from your Concept2 profile.",
+    ],
+  ])(
+    "SEND FAILED · %s: the pill, the reason line in warn weight, and the profile remedy",
+    async (reason, line) => {
+      mount({
+        ...LINKED,
+        autoSend: true,
+        sendFailedAt: "2026-09-05T12:00:00.000Z",
+        sendFailedReason: reason,
+      });
+      await renderCard();
+      expect(await screen.findByText("SEND FAILED")).toBeTruthy();
+      const p = screen.getByText(line);
+      expect(p.className).toContain("c2-card-mode-line-warn");
+      expect(
+        screen.getByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
+      ).toBeTruthy();
+      expect(screen.queryByText("LINKED ✓")).toBeNull();
+    },
+  );
+
+  it("the remedy opens the LIVE link's profile in the read-only browser", async () => {
+    const openReadOnlyUrl = vi.fn();
+    vi.doMock("../adapters/externalBrowser", () => ({ openReadOnlyUrl }));
+    mount({
+      ...LINKED,
+      sendFailedAt: "2026-09-05T12:00:00.000Z",
+      sendFailedReason: "no_weight",
+    });
+    await renderCard();
+    await userEvent.click(
+      await screen.findByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
+    );
+    expect(openReadOnlyUrl).toHaveBeenCalledTimes(1);
+    expect(String(openReadOnlyUrl.mock.calls[0]?.[0])).toMatch(
+      /^https:\/\/log-dev\.concept2\.com\//,
+    );
+    vi.doUnmock("../adapters/externalBrowser");
+  });
+
+  it("no remedy when the origin is unreadable — an empty base would build a RELATIVE path", async () => {
+    mount({
+      ...LINKED,
+      logbookBaseUrl: null,
+      sendFailedAt: "2026-09-05T12:00:00.000Z",
+      sendFailedReason: "no_weight",
+    });
+    await renderCard();
+    await screen.findByText("SEND FAILED");
+    expect(
+      screen.queryByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
+    ).toBeNull();
+  });
+
+  it("needsReauth beats SEND FAILED on the pill and the line, as it does on the You row", async () => {
+    mount({
+      ...LINKED,
+      needsReauth: true,
+      sendFailedAt: "2026-09-05T12:00:00.000Z",
+      sendFailedReason: "no_weight",
+    });
+    await renderCard();
+    expect(await screen.findByText("RECONNECT NEEDED")).toBeTruthy();
+    expect(screen.queryByText("SEND FAILED")).toBeNull();
+    expect(
+      screen.getByText("Sends are paused until you reconnect."),
+    ).toBeTruthy();
+    expect(
+      screen.queryByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
+    ).toBeNull();
+  });
+});
+
 // FIX ROUND 2, F5 — the anti-drift claim, made TRUE rather than narrowed.
 // `e2e/design.spec.ts` measures committed fixtures, and the previous round
 // claimed the component "pins the same two class names so the fixture cannot
@@ -745,15 +1143,21 @@ describe("the e2e fixtures ARE this component's output (F5)", () => {
 
   it("c2-card-armed.html is what the armed card renders", async () => {
     const { container } = await renderTo(LINKED);
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await screen.findByRole("button", { name: "Tap again to unlink" });
     expect(norm(container.innerHTML)).toBe(
       norm(committed("c2-card-armed.html")),
     );
   });
 
+  it("c2-card-linked.html is what the linked card renders at rest (MANUAL)", async () => {
+    const { container } = await renderTo(LINKED);
+    await screen.findByRole("button", { name: "OFF" });
+    expect(norm(container.innerHTML)).toBe(
+      norm(committed("c2-card-linked.html")),
+    );
+  });
+
   it("c2-card-read-failed.html is what the read-failed card renders", async () => {
     const api = vi.fn(
       async () => new Response("<html>502</html>", { status: 502 }),
@@ -908,21 +1312,26 @@ describe("Concept2Card copy, pinned literal by literal (F4)", () => {
     expect(screen.getByText("WAITING")).toBeTruthy();
   });
 
-  it("1c linked: the helper that says where sending happens", async () => {
+  it("1c linked: the mode line beneath the control says where sending happens (Wave E auto-send §1a)", async () => {
     mount(LINKED);
     await renderCard();
     await screen.findByText("LINKED \u2713");
+    // The helper this line replaces ("Finished monitor rows can be sent from
+    // the log.") is gone: it contradicted AUTOMATIC (spec §3.2, F5).
     expect(
-      screen.getByText("Finished monitor rows can be sent from the log."),
+      screen.getByText(
+        "Send each finished monitor row yourself, from the log.",
+      ),
     ).toBeTruthy();
+    expect(
+      screen.queryByText("Finished monitor rows can be sent from the log."),
+    ).toBeNull();
   });
 
   it("1d armed: the warning and the auto-disarm footnote", async () => {
     mount(LINKED);
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     expect(
       screen.getByText(
         "Unlink removes this app's access. Rows already sent stay on Concept2.",
@@ -966,9 +1375,7 @@ describe("Concept2Card copy, pinned literal by literal (F4)", () => {
     vi.doMock("../api", () => ({ api }));
     vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
@@ -1027,17 +1434,13 @@ describe("Concept2Card unlink failure does not latch (Gate 0 amendment 1j)", ()
     vi.doMock("../api", () => ({ api }));
     vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
     await renderCard();
-    await userEvent.click(
-      await screen.findByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(await screen.findByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
     await screen.findByText("REASON: THE SERVER ANSWERED 500");
 
-    await userEvent.click(
-      screen.getByRole("button", { name: "Unlink Concept2" }),
-    );
+    await userEvent.click(screen.getByRole("button", { name: "OFF" }));
     await userEvent.click(
       screen.getByRole("button", { name: "Tap again to unlink" }),
     );
diff --git a/app/src/you/Concept2Card.tsx b/app/src/you/Concept2Card.tsx
index ba9278e9..32391817 100644
--- a/app/src/you/Concept2Card.tsx
+++ b/app/src/you/Concept2Card.tsx
@@ -1,18 +1,30 @@
-import { useCallback, useEffect, useRef, useState } from "react";
+import {
+  useCallback,
+  useEffect,
+  useRef,
+  useState,
+  type KeyboardEvent,
+} from "react";
 import { api } from "../api";
 import { startLink, type LinkOutcome } from "../adapters/linkFlow";
 import { useConcept2Link, type LinkReadFailure } from "../api/useConcept2Link";
+import { openReadOnlyUrl } from "../adapters/externalBrowser";
+import { c2ProfileUrl } from "../log/concept2Send";
 import {
   describeFailure,
   identityLine,
+  linkedPill,
+  modeLine,
   type LinkFailure,
 } from "./concept2CardModel";
 
 /**
  * Wave E PR2, Surface 1 (board `docs/design/handoffs/2026-08-31-concept2-
  * connect/README.md` states 1a-1e, amended 2026-09-03 by
- * `amendment-2026-09-03.html` states 1f-1j). The rower's only door to the
- * Concept2 link: connect, see which account is linked, unlink.
+ * `amendment-2026-09-03.html` states 1f-1j; amended again 2026-09-05 by
+ * `amendment-2026-09-05-autosend.html`). The rower's only door to the
+ * Concept2 link: connect, see which account is linked, choose the sending
+ * mode (OFF · MANUAL · AUTOMATIC — OFF is the unlink), unlink.
  *
  * IT ASKS NOTHING. James, 2026-09-03: "I don't want that set in our app. I
  * want it to be set on Concept2's side." The weight class Concept2 needs on
@@ -90,6 +102,13 @@ export default function Concept2Card({ email }: { email: string }) {
   );
   const [armed, setArmed] = useState(false);
   const disarmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
+  // Wave E auto-send §3.2 (A7): the sending-mode control is `disabled` while
+  // its PATCH is in flight, and a refused or thrown write shows one line.
+  // Neither is folded into `busy`: that flag disables Connect/RECONNECT and
+  // the arm, and a mode write must not grey the RECONNECT button above it.
+  const [modeBusy, setModeBusy] = useState(false);
+  const [modeFailed, setModeFailed] = useState(false);
+  const modeRef = useRef<HTMLDivElement | null>(null);
 
   const disarm = useCallback(() => {
     if (disarmRef.current !== null) {
@@ -207,6 +226,58 @@ export default function Concept2Card({ email }: { email: string }) {
     }
   }
 
+  // Wave E auto-send §3.2: MANUAL and AUTOMATIC each PATCH the link and
+  // then RE-READ it (invariant I1 — the pressed segment is drawn from `link`,
+  // never from the tap). A refused or thrown write therefore leaves the
+  // pressed state on the SERVER's value by construction and adds the A7
+  // line; the re-read runs in the `finally` so both outcomes converge on
+  // whatever the server holds. Tapping the segment that is ALREADY pressed
+  // writes nothing (there is nothing to change) but does disarm, because
+  // any tap outside the armed OFF is a decision not to unlink (I2's "any
+  // other tap" disarmer, kept from the button this control replaces).
+  async function setMode(autoSend: boolean): Promise<void> {
+    disarm();
+    if (link !== null && link.linked && link.autoSend === autoSend) return;
+    setModeBusy(true);
+    setModeFailed(false);
+    try {
+      const res = await api("/api/concept2/link", {
+        method: "PATCH",
+        headers: { "Content-Type": "application/json" },
+        body: JSON.stringify({ autoSend }),
+      });
+      if (!res.ok) setModeFailed(true);
+    } catch {
+      setModeFailed(true);
+    } finally {
+      await reload();
+      setModeBusy(false);
+    }
+  }
+
+  // Arrows move FOCUS only (spec §3.2, F4): this is three `aria-pressed`
+  // buttons and NOT a radiogroup, because the roving idiom commits on
+  // arrow, and here one arrow would arm the unlink or fire a PATCH. Commit
+  // stays on click / Enter / Space, which are the button's own.
+  // While armed the only visible segment is OFF (the other two are
+  // `display: none`), so arrows have nowhere to go and do nothing.
+  function moveFocus(e: KeyboardEvent<HTMLDivElement>): void {
+    const step =
+      e.key === "ArrowRight" || e.key === "ArrowDown"
+        ? 1
+        : e.key === "ArrowLeft" || e.key === "ArrowUp"
+          ? -1
+          : 0;
+    if (step === 0 || armed || modeRef.current === null) return;
+    const buttons = [
+      ...modeRef.current.querySelectorAll<HTMLButtonElement>("button"),
+    ];
+    const at = buttons.findIndex((b) => b === document.activeElement);
+    if (at === -1) return;
+    e.preventDefault();
+    buttons[(at + step + buttons.length) % buttons.length]?.focus();
+  }
+
   // Amendment 1h: nothing renders while the surface is unavailable, or
   // before the first read resolves. A capability gate, not a cosmetic
   // hide, and a card that does not yet know what it is showing shows
@@ -286,13 +357,19 @@ export default function Concept2Card({ email }: { email: string }) {
   // whether the outcome exists.
   const updateRequired = outcome !== null && outcome.kind === "updateRequired";
 
+  // LINKED pills come from the model so the card and the You row read one
+  // precedence (spec 2026-09-05 §3.4: RECONNECT NEEDED > SEND FAILED >
+  // LINKED ✓).
   const status = link.linked
-    ? link.needsReauth
-      ? "RECONNECT NEEDED"
-      : "LINKED ✓"
+    ? linkedPill(link)
     : opening
       ? "WAITING"
       : "NOT LINKED";
+  const mode = link.linked ? modeLine(link) : null;
+  const profileUrl =
+    link.linked && link.logbookBaseUrl !== null
+      ? c2ProfileUrl(link.logbookBaseUrl)
+      : null;
 
   // WHICH STATES THE PAGE DRAWS AS TWO COLUMNS (fix round 2, F1).
   //
@@ -391,12 +468,6 @@ export default function Concept2Card({ email }: { email: string }) {
             </div>
           )}
 
-          {link.linked && !link.needsReauth && !armed && (
-            <p className="c2-card-helper">
-              Finished monitor rows can be sent from the log.
-            </p>
-          )}
-
           {/* The armed hairline sits ABOVE the warning, not below it: the
               page's 1d frames order the card identity, hair, explain, button,
               foot, in BOTH orientations (fix round 2, F6 — a previous
@@ -508,27 +579,92 @@ export default function Concept2Card({ email }: { email: string }) {
             </>
           )}
 
-          {link.linked && (
+          {link.linked && mode !== null && (
             <>
               {/* Not while armed: 1d's hairline is above the warning, in the
                   tell column (F6). Two hairlines would be a rule the page
                   never draws. */}
               {!armed && <hr className="c2-card-hair" />}
-              <button
-                type="button"
-                className={`c2-card-danger${armed ? " c2-card-danger-armed" : ""}`}
-                disabled={busy}
-                onClick={() => {
-                  if (armed) void unlink();
-                  else arm();
-                }}
+              {/* Wave E auto-send §3.2 — OFF · MANUAL · AUTOMATIC, where
+                  Unlink Concept2 was (RF23: OFF IS the unlink, so a second
+                  control would be two affordances for one destructive act).
+                  Three `aria-pressed` buttons, not a radiogroup (F4). OFF
+                  keeps the two-tap arm the button had: while armed it spans
+                  the control and reads "Tap again to unlink" in the danger
+                  button's own typography (Gate 0 §2a, ruled on sight), and
+                  the other two segments are hidden — the pressed state does
+                  not commit until the second tap, and a disarm returns it to
+                  the server's mode because that is all `link` ever held.
+                  `aria-pressed` while armed is on OFF alone, so a screen
+                  reader hears the state the rower is about to commit. */}
+              <div
+                ref={modeRef}
+                className={`c2-card-mode${armed ? " c2-card-mode-is-armed" : ""}`}
+                role="group"
+                aria-label="Sending mode"
+                onKeyDown={moveFocus}
               >
-                {armed ? "Tap again to unlink" : "Unlink Concept2"}
-              </button>
-              {armed && (
+                <button
+                  type="button"
+                  className={`c2-card-mode-btn${armed ? " c2-card-mode-armed" : ""}`}
+                  aria-pressed={armed}
+                  disabled={busy || modeBusy}
+                  onClick={() => {
+                    if (armed) void unlink();
+                    else arm();
+                  }}
+                >
+                  {armed ? "Tap again to unlink" : "OFF"}
+                </button>
+                <button
+                  type="button"
+                  className="c2-card-mode-btn"
+                  aria-pressed={!armed && !link.autoSend}
+                  disabled={busy || modeBusy}
+                  onClick={() => void setMode(false)}
+                >
+                  MANUAL
+                </button>
+                <button
+                  type="button"
+                  className="c2-card-mode-btn"
+                  aria-pressed={!armed && link.autoSend}
+                  disabled={busy || modeBusy}
+                  onClick={() => void setMode(true)}
+                >
+                  AUTOMATIC
+                </button>
+              </div>
+              {armed ? (
                 <p className="c2-card-foot">
                   DISARMS ON ITS OWN AFTER 4 SECONDS
                 </p>
+              ) : (
+                <>
+                  <p
+                    className={`c2-card-mode-line${mode.warn ? " c2-card-mode-line-warn" : ""}`}
+                  >
+                    {mode.text}
+                  </p>
+                  {/* The block's own remedy (Gate 0 §4a), built from the LIVE
+                      link exactly as `log/Concept2SendBlock.tsx` builds it,
+                      and for the same reason omitted when the origin is not
+                      readable: an empty base would make a RELATIVE path. */}
+                  {mode.remedy === "profile" && profileUrl !== null && (
+                    <button
+                      type="button"
+                      className="c2-card-linkout"
+                      onClick={() => void openReadOnlyUrl(profileUrl)}
+                    >
+                      OPEN CONCEPT2 PROFILE
+                    </button>
+                  )}
+                  {modeFailed && (
+                    <p className="c2-card-mode-error">
+                      Couldn&apos;t change this. Try again.
+                    </p>
+                  )}
+                </>
               )}
             </>
           )}
diff --git a/app/src/you/concept2CardModel.ts b/app/src/you/concept2CardModel.ts
index b99c0add..6c7649b4 100644
--- a/app/src/you/concept2CardModel.ts
+++ b/app/src/you/concept2CardModel.ts
@@ -148,3 +148,81 @@ export function describeFailure(outcome: LinkOutcome): LinkFailure | null {
       };
   }
 }
+
+/** Wave E auto-send (spec 2026-09-05 §3.2, §3.4; Gate 0 amendment
+ *  2026-09-05 §1a, §3, §4a): the line beneath the sending-mode control.
+ *
+ *  It reads from the SAME inputs the You row's `rowState` does and in the
+ *  same order — `needsReauth` first, then the sticky send-failed flag, then
+ *  the mode — so the card and the row can never disagree about why rows
+ *  are or are not going to Concept2. Rev 1's AUTOMATIC line ("Finished
+ *  monitor rows are sent when you save them.") was a promise the link
+ *  cannot keep in two states the antagonist found: every automatic send
+ *  409s while the card reads CONCEPT2 STOPPED ACCEPTING THIS LINK, and
+ *  every one 422s while the flag is set. Those two states own the line.
+ *
+ *  `warn` is the colour step (Gate 0 §7: `--ink` 17.11:1 instead of
+ *  `--ink-3` 7.43:1, both on `--surface`); `remedy` says whether the block's
+ *  OPEN CONCEPT2 PROFILE link-out follows the line — it does for exactly the
+ *  failure lines, since every one of them is answerable from the rower's
+ *  Concept2 profile (`log/concept2Send.ts`'s `noWeightCopy` comment). */
+export interface ModeLine {
+  text: string;
+  warn: boolean;
+  remedy: "profile" | null;
+}
+
+export const MODE_LINE_MANUAL =
+  "Send each finished monitor row yourself, from the log.";
+export const MODE_LINE_AUTOMATIC =
+  "Finished monitor rows are sent when you save them.";
+export const MODE_LINE_PAUSED = "Sends are paused until you reconnect.";
+
+/** The block's three no-weight sentences re-hung on "Rows aren't being
+ *  sent:" (Gate 0 §4a, the prefix ruled in) so they read as a status rather
+ *  than a reply to a tap. Grouping mirrors `noWeightCopy`: `implausible_weight`
+ *  shares `unreadable_weight`'s line, and an unrecognised sub-reason shares
+ *  `no_gender`'s — a switch, not a Record, for the `Object.prototype` reason
+ *  given there. */
+function sendFailedLine(reason: string | null): string {
+  switch (reason) {
+    case "no_weight":
+      return "Rows aren't being sent: Concept2 needs a weight class, and your Concept2 profile has no weight set.";
+    case "unreadable_weight":
+    case "implausible_weight":
+      return "Rows aren't being sent: Concept2 needs a weight class, and we couldn't read the weight on your Concept2 profile.";
+    case "no_gender":
+    default:
+      return "Rows aren't being sent: Concept2 needs a weight class, and we couldn't work one out from your Concept2 profile.";
+  }
+}
+
+export function modeLine(link: Concept2Link): ModeLine {
+  if (link.needsReauth) {
+    return { text: MODE_LINE_PAUSED, warn: false, remedy: null };
+  }
+  if (link.sendFailedAt !== null) {
+    return {
+      text: sendFailedLine(link.sendFailedReason),
+      warn: true,
+      remedy: "profile",
+    };
+  }
+  return {
+    text: link.autoSend ? MODE_LINE_AUTOMATIC : MODE_LINE_MANUAL,
+    warn: false,
+    remedy: null,
+  };
+}
+
+/** The card's status pill, LINKED states only — the same precedence as the
+ *  You row's `rowState` (RECONNECT NEEDED > SEND FAILED > LINKED ✓), stated
+ *  once here so the pill above the control and the row on You are one
+ *  reading (spec §3.4, "the card's own status pill mirrors the row"). */
+export function linkedPill(
+  link: Concept2Link,
+): "RECONNECT NEEDED" | "SEND FAILED" | "LINKED ✓" {
+  if (link.needsReauth) return "RECONNECT NEEDED";
+  if (link.sendFailedAt !== null) return "SEND FAILED";
+  return "LINKED ✓";
+}
```

</details>

---

## Task 4: the automatic send — after the 201, on a fresh read

**Commit:** `e92531dc`.

**Files:** `app/src/log/concept2Send.ts` (`autoSendAfterSave`), `app/src/log/autoSend.test.ts` (new), `app/src/session/LogSession.tsx` (one line in `useLogForm`'s 201 path + import), `app/src/session/LogSession.test.tsx`, `app/src/session/ReviewSession.test.tsx`, `app/src/workout/WorkoutDetail.connectedRecovery.test.tsx`, `app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx`.

**As BUILT (spec rev 4 §3.3):** `onSaved(logId); if (logId !== null) void autoSendAfterSave(logId);` — after navigation, not awaited. `autoSendAfterSave` takes ONE `fetchLink()`; `failed` → return; `!available || !linked || !autoSend` → return; else the manual site's exact `POST /api/concept2/results/:logId` with `Content-Type: application/json` and `{ tz }`; every outcome and throw swallowed. No client eligibility check (F3): a 422 `not_eligible` on a timer or hand-entered row is expected and sets no flag. Departure from rev 3: no `useConcept2Link()` mounted on the four log doors.

**Test consequence, named:** every suite that drives a real save through `useLogForm` and counted the shared `api` spy now filters to `/api/logs` (28 count assertions + 2 index reads in `LogSession.test.tsx`, 2 in `ReviewSession.test.tsx`, `parsedBodies` in `WorkoutDetail.connectedRecovery.test.tsx`, three `calls.at(-1)` in `WorkoutDetail.postReleaseCommit.test.tsx`) — a 201 is followed by a body-less `GET /api/concept2/link`.

**Tests:** `autoSend.test.ts` 16 passed (exact wire shape; read-first order; six no-send shapes; four failed-read answers resolve without a send; four send answers resolve). `LogSession.test.tsx` 194 passed including the RF24 seam block: from the Save tap, a 201 under AUTOMATIC → one POST to the NEW row's route with the header and a string `tz`, in the order `POST /api/logs → GET /link → POST /results/:id`; MANUAL/unlinked/unavailable/absent → the read happens and nothing is sent; a 502 read → nothing; a failed save → no read; a hanging send route still lands on Today.

**Mutations (measured):**

| # | mutation | failure |
| --- | --- | --- |
| M13 | delete `if (logId !== null) void autoSendAfterSave(logId);` | 6 failed in the seam block — `expected [] to have a length of 1` and the reads never happen |
| M14 | drop `|| !link.autoSend` | 5 failed across both suites: `MANUAL: no send`, `autoSend absent…`, `"true"…` — a send went out |
| M15 | drop the `Content-Type` header | `expected undefined to strictly equal { 'Content-Type': 'application/json' }` in both suites |

- [ ] **Step 1: the commit is the implementation.** Review package: `git show e92531dc` (stat below). Reviewer: brief = this task's section; diff = the commit; gates = the suites named above, re-run from `app/`.

```
e92531dc Auto-send: the Send button pressed for you, after the 201

 app/src/log/autoSend.test.ts                       | 116 ++++++++++
 app/src/log/concept2Send.ts                        |  45 +++-
 app/src/session/LogSession.test.tsx                | 250 ++++++++++++++++++---
 app/src/session/LogSession.tsx                     |   8 +
 app/src/session/ReviewSession.test.tsx             |  12 +-
 .../WorkoutDetail.connectedRecovery.test.tsx       |   8 +-
 .../WorkoutDetail.postReleaseCommit.test.tsx       |  18 +-
 7 files changed, 416 insertions(+), 41 deletions(-)
```

<details>
<summary>The diff, verbatim (<code>git show e92531dc</code>)</summary>

```diff
diff --git a/app/src/log/autoSend.test.ts b/app/src/log/autoSend.test.ts
new file mode 100644
index 00000000..bb2187ad
--- /dev/null
+++ b/app/src/log/autoSend.test.ts
@@ -0,0 +1,116 @@
+import { describe, it, expect, vi, afterEach } from "vitest";
+
+// Wave E auto-send, spec 2026-09-05 §3.3: `autoSendAfterSave`'s decision
+// table, one row per clause, each asserted on the WIRE (the parsed body the
+// send route would receive) rather than on a call count — delta F1 was a
+// send call that did not typecheck behind a green count.
+afterEach(() => {
+  vi.resetModules();
+  vi.doUnmock("../api");
+});
+
+const LINKED_AUTO = {
+  available: true,
+  linked: true,
+  c2UserId: 2211,
+  c2Username: "jamesawesome",
+  needsReauth: false,
+  logbookBaseUrl: "https://log-dev.concept2.com",
+  autoSend: true,
+};
+
+function mockApi(
+  linkAnswer: () => Response | Promise<Response>,
+  sendAnswer: () => Response | Promise<Response> = () =>
+    new Response(JSON.stringify({ resultId: 1 }), { status: 200 }),
+) {
+  const api = vi.fn(async (path: string, _init?: RequestInit) =>
+    path === "/api/concept2/link" ? linkAnswer() : sendAnswer(),
+  );
+  vi.doMock("../api", () => ({ api }));
+  return api;
+}
+
+function json(body: unknown, status = 200) {
+  return new Response(JSON.stringify(body), {
+    status,
+    headers: { "Content-Type": "application/json" },
+  });
+}
+
+async function run(logId: string) {
+  const { autoSendAfterSave } = await import("./concept2Send");
+  await autoSendAfterSave(logId);
+}
+
+function sends(api: ReturnType<typeof mockApi>) {
+  return api.mock.calls.filter(([p]) => p.startsWith("/api/concept2/results/"));
+}
+
+describe("autoSendAfterSave (Wave E auto-send §3.3)", () => {
+  it("AUTOMATIC: POSTs the manual site's exact shape to the saved row's route", async () => {
+    const api = mockApi(() => json(LINKED_AUTO));
+    await run("log-77");
+    expect(sends(api)).toHaveLength(1);
+    const [path, init] = sends(api)[0]!;
+    expect(path).toBe("/api/concept2/results/log-77");
+    expect(init?.method).toBe("POST");
+    expect(init?.headers).toStrictEqual({ "Content-Type": "application/json" });
+    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
+    expect(Object.keys(body)).toStrictEqual(["tz"]);
+    expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
+  });
+
+  it("reads the link FRESH, once, before deciding", async () => {
+    const api = mockApi(() => json(LINKED_AUTO));
+    await run("log-77");
+    expect(api.mock.calls.map(([p]) => p)).toStrictEqual([
+      "/api/concept2/link",
+      "/api/concept2/results/log-77",
+    ]);
+  });
+
+  it.each([
+    ["MANUAL", { ...LINKED_AUTO, autoSend: false }],
+    ["autoSend absent (older server)", { ...LINKED_AUTO, autoSend: undefined }],
+    ['autoSend the string "true"', { ...LINKED_AUTO, autoSend: "true" }],
+    ["unlinked", { available: true, linked: false }],
+    ["unavailable", { available: false }],
+    ["a non-object body", "nope"],
+  ])("%s: no send", async (_l, link) => {
+    const api = mockApi(() => json(link));
+    await run("log-77");
+    expect(sends(api)).toHaveLength(0);
+  });
+
+  it.each([
+    ["a 502", () => new Response("<html>502</html>", { status: 502 })],
+    ["a 401", () => new Response("", { status: 401 })],
+    ["unparseable JSON", () => new Response("{", { status: 200 })],
+    ["a thrown request", () => Promise.reject(new Error("offline"))],
+  ])(
+    "a link read that fails with %s: no send, and it resolves",
+    async (_l, answer) => {
+      const api = mockApi(answer);
+      await expect(run("log-77")).resolves.toBeUndefined();
+      expect(sends(api)).toHaveLength(0);
+    },
+  );
+
+  it.each([
+    [
+      "a 422 (not eligible: a timer row)",
+      () => json({ error: "not_eligible" }, 422),
+    ],
+    ["a 409 (duplicate)", () => json({ error: "duplicate" }, 409)],
+    ["a 500", () => new Response("", { status: 500 })],
+    ["a thrown send", () => Promise.reject(new Error("offline"))],
+  ])(
+    "a send answered by %s resolves without throwing — the row and the link carry the outcome",
+    async (_l, answer) => {
+      const api = mockApi(() => json(LINKED_AUTO), answer);
+      await expect(run("log-77")).resolves.toBeUndefined();
+      expect(sends(api)).toHaveLength(1);
+    },
+  );
+});
diff --git a/app/src/log/concept2Send.ts b/app/src/log/concept2Send.ts
index 60e21faf..17c25b62 100644
--- a/app/src/log/concept2Send.ts
+++ b/app/src/log/concept2Send.ts
@@ -1,6 +1,49 @@
-import type { Concept2Link } from "../api/useConcept2Link";
+import { api } from "../api";
+import { fetchLink, type Concept2Link } from "../api/useConcept2Link";
 import type { StoredLog } from "./storedSummary";
 
+/** Wave E auto-send, spec 2026-09-05 §3.3 — "the Send button pressed for
+ *  you". Called by `useLogForm` (`session/LogSession.tsx`) after a 201,
+ *  AFTER `onSaved` has navigated: fire-and-forget, the row and the link
+ *  carry the outcome (a `c2_result_id` on the row, or the send-failed flag
+ *  on the link), and no client state is kept.
+ *
+ *  ONE FRESH READ decides (A4, delta F5): the link is read again here, not
+ *  taken from any mounted hook's state, so a mode flipped on `/you/concept2`
+ *  mid-form is honoured and a pending or failed read sends nothing. A
+ *  failed read is a decision (no send), not a silence.
+ *
+ *  NO CLIENT ELIGIBILITY CHECK (F3): `isSendable` above reads a STORED row's
+ *  nullable totals, and a form body has different fields — two of its
+ *  clauses were inert against one. The server re-derives eligibility and is
+ *  the authority; a `422 not_eligible` on a timer or hand-entered row is the
+ *  expected answer, swallowed here, and it does not set the failure flag
+ *  (§3.4). Cost: one 422 per non-monitor save for an AUTOMATIC rower.
+ *
+ *  THE CALL IS THE MANUAL SITE'S SHAPE VERBATIM (`Concept2SendBlock.tsx`'s
+ *  `post`): `api()` takes a `RequestInit`, and without the `Content-Type`
+ *  header `express.json()` skips the body and the route 400s on the
+ *  missing `tz` — silently, under AUTOMATIC (delta F1). Every gate on this
+ *  function reads the parsed wire body, not a call count. */
+export async function autoSendAfterSave(logId: string): Promise<void> {
+  const fresh = await fetchLink();
+  if ("failed" in fresh) return;
+  const { link } = fresh;
+  if (!link.available || !link.linked || !link.autoSend) return;
+  try {
+    await api(`/api/concept2/results/${logId}`, {
+      method: "POST",
+      headers: { "Content-Type": "application/json" },
+      body: JSON.stringify({
+        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
+      }),
+    });
+  } catch {
+    // Nothing to do and nowhere to say it: the row's block offers Send on
+    // its next mount, and a request that never left cannot set the flag.
+  }
+}
+
 /** Client mirror of `server/concept2/mapping.ts`'s `eligibilityFailure`
  *  (that function's four clauses, same order). The SERVER is authoritative
  *  — it re-checks and 422s — so this predicate exists only to decide
diff --git a/app/src/session/LogSession.test.tsx b/app/src/session/LogSession.test.tsx
index 9d91e027..635a983c 100644
--- a/app/src/session/LogSession.test.tsx
+++ b/app/src/session/LogSession.test.tsx
@@ -1,6 +1,12 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
 import { useEffect } from "react";
-import { fireEvent, render, screen, within } from "@testing-library/react";
+import {
+  fireEvent,
+  render,
+  screen,
+  waitFor,
+  within,
+} from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
 import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
@@ -465,10 +471,19 @@ function mockApi(
   return fn;
 }
 
+/** The calls that went to `POST /api/logs`, and only those. Since Wave E
+ *  auto-send a 201 is followed by one `GET /api/concept2/link` (the
+ *  automatic-send decision, `log/concept2Send.ts`), so a raw call count or
+ *  `mock.calls[0]` on the shared `api` spy would count the read too. Every
+ *  save assertion in this file goes through here. */
+function logCalls(fn: ReturnType<typeof mockApi>) {
+  return fn.mock.calls.filter(([path]) => path === "/api/logs");
+}
+
 function parsedBodies(
   fn: ReturnType<typeof mockApi>,
 ): Record<string, unknown>[] {
-  return fn.mock.calls.map(([, init]) =>
+  return logCalls(fn).map(([, init]) =>
     JSON.parse((init as RequestInit).body as string),
   );
 }
@@ -1500,8 +1515,8 @@ describe("LogSession: save", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
-    const [path, init] = apiFn.mock.calls[0]!;
+    expect(logCalls(apiFn)).toHaveLength(1);
+    const [path, init] = logCalls(apiFn)[0]!;
     expect(path).toBe("/api/logs");
     const body = JSON.parse((init as RequestInit).body as string) as Record<
       string,
@@ -1580,8 +1595,8 @@ describe("LogSession: save", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
-    const [, init] = apiFn.mock.calls[0]!;
+    expect(logCalls(apiFn)).toHaveLength(1);
+    const [, init] = logCalls(apiFn)[0]!;
     const body = JSON.parse((init as RequestInit).body as string) as Record<
       string,
       unknown
@@ -1727,7 +1742,7 @@ describe("LogSession: save", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     const body = parsedBodies(apiFn)[0]!;
     expect(body.steps).toStrictEqual([{ label: "2k test" }]);
     expect(loadDraft()).toBeNull();
@@ -1767,7 +1782,7 @@ describe("LogSession: save", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     expect(loadDraft()).not.toBeNull();
     expect(loadRun()).not.toBeNull();
     expect(
@@ -1789,7 +1804,7 @@ describe("LogSession: save", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     expect(loadDraft()).not.toBeNull();
     expect(loadRun()).not.toBeNull();
   });
@@ -1808,7 +1823,7 @@ describe("LogSession: save", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     expect(loadDraft()).not.toBeNull();
     expect(loadRun()).not.toBeNull();
   });
@@ -1840,7 +1855,7 @@ describe("LogSession: save", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
     const bodies = parsedBodies(apiFn);
     expect(bodies[0]!.workoutId).toBe(run.workoutId);
     expect(bodies[1]!.workoutId).toBeNull();
@@ -1879,7 +1894,7 @@ describe("LogSession: save", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
     const bodies = parsedBodies(apiFn);
     expect(bodies[1]).toStrictEqual({ ...bodies[0], workoutId: null });
     expect(loadDraft()).not.toBeNull();
@@ -1911,7 +1926,7 @@ describe("LogSession: save", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     expect(loadDraft()).not.toBeNull();
     expect(loadRun()).not.toBeNull();
   });
@@ -1923,6 +1938,177 @@ describe("LogSession: save", () => {
 // copy keeps the house `Tap again to discard` (the mock never designed its
 // own armed state, PROVENANCE item 4). The two-tap safety itself, and the
 // clear-both-records-then-navigate behaviour, are unchanged.
+// Wave E auto-send, spec 2026-09-05 §3.3 — the automatic send, gated at the
+// SEAM it crosses (RF24): these tests start at the rower's Save tap and
+// assert the wire body of the send that follows the 201. `autoSend.test.ts`
+// pins the decision table on `autoSendAfterSave` alone; this block proves the
+// form actually calls it, after the 201, with the row's own id.
+describe("LogSession: the automatic Concept2 send (Wave E auto-send §3.3)", () => {
+  const LINK_AUTO = {
+    available: true,
+    linked: true,
+    c2UserId: 2211,
+    c2Username: "jamesawesome",
+    needsReauth: false,
+    logbookBaseUrl: "https://log-dev.concept2.com",
+    autoSend: true,
+  };
+
+  function sends(fn: ReturnType<typeof mockApi>) {
+    return fn.mock.calls.filter(([path]) =>
+      path.startsWith("/api/concept2/results/"),
+    );
+  }
+
+  it("a 201 under AUTOMATIC is followed by ONE POST to the new row's send route, JSON body carrying tz", async () => {
+    const { workout } = buildSessionFixture();
+    mockWorkouts([workout]);
+    const order: string[] = [];
+    const apiFn = mockApi((path, init) => {
+      order.push(`${init?.method ?? "GET"} ${path}`);
+      if (path === "/api/logs") {
+        return new Response(JSON.stringify({ id: "log-auto-1" }), {
+          status: 201,
+        });
+      }
+      if (path === "/api/concept2/link") {
+        return new Response(JSON.stringify(LINK_AUTO), {
+          status: 200,
+          headers: { "Content-Type": "application/json" },
+        });
+      }
+      return new Response(JSON.stringify({ resultId: 1 }), { status: 200 });
+    });
+    await renderLog();
+    await screen.findByRole("heading", { name: "Hoarfrost" });
+    await chooseHeldAndPain();
+    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
+    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
+
+    await waitFor(() => expect(sends(apiFn)).toHaveLength(1));
+    const [path, init] = sends(apiFn)[0]!;
+    expect(path).toBe("/api/concept2/results/log-auto-1");
+    expect((init as RequestInit).method).toBe("POST");
+    expect((init as RequestInit).headers).toStrictEqual({
+      "Content-Type": "application/json",
+    });
+    const body = JSON.parse((init as RequestInit).body as string) as {
+      tz: unknown;
+    };
+    expect(typeof body.tz).toBe("string");
+    expect((body.tz as string).length).toBeGreaterThan(0);
+    // The decision was made on a read taken AFTER the 201 — never before.
+    expect(order).toStrictEqual([
+      "POST /api/logs",
+      "GET /api/concept2/link",
+      "POST /api/concept2/results/log-auto-1",
+    ]);
+  });
+
+  it.each([
+    ["MANUAL (autoSend false)", { ...LINK_AUTO, autoSend: false }],
+    ["unlinked", { available: true, linked: false }],
+    ["unavailable", { available: false }],
+    [
+      "a server that predates the column (autoSend absent)",
+      { ...LINK_AUTO, autoSend: undefined },
+    ],
+  ])("a 201 with the link reading %s sends nothing", async (_l, link) => {
+    const { workout } = buildSessionFixture();
+    mockWorkouts([workout]);
+    const apiFn = mockApi((path) => {
+      if (path === "/api/logs") {
+        return new Response(JSON.stringify({ id: "log-auto-2" }), {
+          status: 201,
+        });
+      }
+      return new Response(JSON.stringify(link), {
+        status: 200,
+        headers: { "Content-Type": "application/json" },
+      });
+    });
+    await renderLog();
+    await screen.findByRole("heading", { name: "Hoarfrost" });
+    await chooseHeldAndPain();
+    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
+    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
+    // Await the read the decision waits on, THEN assert the absence.
+    await waitFor(() =>
+      expect(
+        apiFn.mock.calls.filter(([p]) => p === "/api/concept2/link"),
+      ).toHaveLength(1),
+    );
+    expect(sends(apiFn)).toHaveLength(0);
+  });
+
+  it("a failed link read after the 201 sends nothing — a failed read is a decision, not a silence", async () => {
+    const { workout } = buildSessionFixture();
+    mockWorkouts([workout]);
+    const apiFn = mockApi((path) => {
+      if (path === "/api/logs") {
+        return new Response(JSON.stringify({ id: "log-auto-3" }), {
+          status: 201,
+        });
+      }
+      return new Response("<html>502</html>", { status: 502 });
+    });
+    await renderLog();
+    await screen.findByRole("heading", { name: "Hoarfrost" });
+    await chooseHeldAndPain();
+    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
+    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
+    await waitFor(() =>
+      expect(
+        apiFn.mock.calls.filter(([p]) => p === "/api/concept2/link"),
+      ).toHaveLength(1),
+    );
+    expect(sends(apiFn)).toHaveLength(0);
+  });
+
+  it("a failed save reads the link NOT AT ALL — the decision belongs to a 201", async () => {
+    const { workout } = buildSessionFixture();
+    mockWorkouts([workout]);
+    const apiFn = mockApi(
+      () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
+    );
+    await renderLog();
+    await screen.findByRole("heading", { name: "Hoarfrost" });
+    await chooseHeldAndPain();
+    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
+    expect(
+      await screen.findByText("Couldn't save this session. Try again."),
+    ).toBeInTheDocument();
+    expect(
+      apiFn.mock.calls.filter(([p]) => p === "/api/concept2/link"),
+    ).toHaveLength(0);
+    expect(sends(apiFn)).toHaveLength(0);
+  });
+
+  it("the send is not awaited: a send route that never answers still lands the rower on Today", async () => {
+    const { workout } = buildSessionFixture();
+    mockWorkouts([workout]);
+    mockApi((path) => {
+      if (path === "/api/logs") {
+        return new Response(JSON.stringify({ id: "log-auto-4" }), {
+          status: 201,
+        });
+      }
+      if (path === "/api/concept2/link") {
+        return new Response(JSON.stringify(LINK_AUTO), {
+          status: 200,
+          headers: { "Content-Type": "application/json" },
+        });
+      }
+      return new Promise<Response>(() => {});
+    });
+    await renderLog();
+    await screen.findByRole("heading", { name: "Hoarfrost" });
+    await chooseHeldAndPain();
+    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
+    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
+  });
+});
+
 describe("LogSession: staged discard", () => {
   it("arms on the first press without clearing anything or firing a network request", async () => {
     buildSessionFixture();
@@ -2214,7 +2400,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     const body = parsedBodies(apiFn)[0]!;
     expect(body).toMatchObject({
       workoutId: workout.id,
@@ -2276,7 +2462,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
 
     await userEvent.click(
       screen.getByRole("button", { name: "SIMULATE BROWSER BACK" }),
@@ -2291,7 +2477,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     expect(
       screen.queryByRole("button", { name: SAVE_BUTTON }),
     ).not.toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
   });
 
   it("leaves an unrelated live run/draft byte-identical in storage after a manual log saves", async () => {
@@ -2315,7 +2501,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     expect(localStorage.getItem(DRAFT_KEY)).toBe(draftBefore);
     expect(localStorage.getItem(RUN_KEY)).toBe(runBefore);
   });
@@ -2337,7 +2523,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     expect(
       screen.getByRole("button", { name: SAVE_BUTTON }),
     ).not.toBeDisabled();
@@ -2375,7 +2561,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     const body = parsedBodies(apiFn)[0]!;
     expect(body.steps).toStrictEqual([{ label: "2k test" }]);
   });
@@ -2408,7 +2594,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
     const bodies = parsedBodies(apiFn);
     expect(bodies[0]!.workoutId).toBe(workout.id);
     expect(bodies[1]!.workoutId).toBeNull();
@@ -2438,7 +2624,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
   });
 
   it("treats an unparseable 400 body as 'no field named' — no retry, a genuine failure surfaces", async () => {
@@ -2456,7 +2642,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
   });
 
   it("catches a thrown network error and surfaces the same inline failure", async () => {
@@ -2474,7 +2660,7 @@ describe("LogSession: the manual door (Task 3)", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
   });
 
   it("resolves each PACES OFF base from its OWN matching baseline when a workout references both", async () => {
@@ -3555,7 +3741,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     const body = parsedBodies(apiFn)[0]!;
     expect(body.workoutId).toBe(MONITOR_WORKOUT_ID);
     expect(body.deviceName).toBe("PM5 432331249 Row");
@@ -4093,7 +4279,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
     const body = parsedBodies(apiFn)[0]!;
     expect(body.series).toStrictEqual(series);
     expect(loadMonitorRun()).toBeNull();
@@ -4163,7 +4349,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
     const bodies = parsedBodies(apiFn);
     expect(bodies[0]!.series).toStrictEqual(series);
     expect("series" in bodies[1]!).toBe(false);
@@ -4267,7 +4453,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
 
     const ring = JSON.parse(
       sessionStorage.getItem("ergomatic:last-rowed-log")!,
@@ -4322,7 +4508,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
     expect(loadMonitorRun()).not.toBeNull();
     expect(retireSpy).not.toHaveBeenCalled();
   });
@@ -4380,7 +4566,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(3);
+    expect(logCalls(apiFn)).toHaveLength(3);
     const bodies = parsedBodies(apiFn);
     expect(bodies[0]!.workoutId).toBe(MONITOR_WORKOUT_ID);
     expect(bodies[0]!.series).toStrictEqual(series);
@@ -4418,7 +4604,7 @@ describe("LogSession: the manual door's monitor mode (7C Task 4)", () => {
     expect(
       await screen.findByText("Couldn't save this session. Try again."),
     ).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
   });
 
   it("a failed save does NOT clear MonitorRun — the record survives so a retry can still prefill", async () => {
@@ -5585,7 +5771,7 @@ describe("LogSession: the save stack's plan position (§2F, replaces the outside
     );
 
     expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
-    expect(apiFn).toHaveBeenCalledTimes(2);
+    expect(logCalls(apiFn)).toHaveLength(2);
     const bodies = parsedBodies(apiFn);
     expect(bodies[0]!.workoutId).toBe(run.workoutId);
     expect(bodies[0]!.advancesPlan).toBe(false);
@@ -5697,7 +5883,7 @@ describe("LogSession: the save stack's plan position (§2F, replaces the outside
     await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
     await screen.findByText("TODAY SCREEN");
 
-    expect(apiFn).toHaveBeenCalledTimes(1);
+    expect(logCalls(apiFn)).toHaveLength(1);
   });
 
   it("manual door: plan-hook error renders no Log against plan button either", async () => {
diff --git a/app/src/session/LogSession.tsx b/app/src/session/LogSession.tsx
index 353e7ffd..5b45c819 100644
--- a/app/src/session/LogSession.tsx
+++ b/app/src/session/LogSession.tsx
@@ -64,6 +64,7 @@ import { clearSelectedTimer } from "./clearSelectedTimer";
 import ReadOnlyRecording from "./ReadOnlyRecording";
 import { requireFiniteRecording, validWorkoutType } from "./recoveryValidation";
 import { recordTestResult } from "../api/testHistory";
+import { autoSendAfterSave } from "../log/concept2Send";
 
 // Hand-off store design spec (rev 4), §8/§1: this route's own hydration
 // boundary. `monitorModeEntry`/`connectedArrivalWithNoRecord` below are both
@@ -871,6 +872,13 @@ export function useLogForm(onSaved: (logId: string | null) => void) {
           logId = null;
         }
         onSaved(logId);
+        // Wave E auto-send §3.3: AFTER the door has navigated, and not
+        // awaited — the save is done, the rower is on Today, and whether
+        // Concept2 gets the row is the row's own business from here
+        // (`log/concept2Send.ts`'s `autoSendAfterSave` reads the link fresh
+        // and decides). A null id (an unreadable 201 body) sends nothing:
+        // there is no row to name.
+        if (logId !== null) void autoSendAfterSave(logId);
         return;
       }
       setSaveError("Couldn't save this session. Try again.");
diff --git a/app/src/session/ReviewSession.test.tsx b/app/src/session/ReviewSession.test.tsx
index 4f02af54..dbcc654a 100644
--- a/app/src/session/ReviewSession.test.tsx
+++ b/app/src/session/ReviewSession.test.tsx
@@ -379,7 +379,11 @@ describe("selected recording recovery", () => {
       expect(
         await screen.findByRole("heading", { name: "Today" }),
       ).toBeVisible();
-      expect(api).toHaveBeenCalledTimes(1);
+      // Wave E auto-send: a 201 is followed by one `GET /api/concept2/link`
+      // (the automatic-send decision), so count the log POSTs, not the spy.
+      expect(
+        api.mock.calls.filter(([path]) => path === "/api/logs"),
+      ).toHaveLength(1);
       expect(api.mock.calls[0]![0]).toBe("/api/logs");
       const body = JSON.parse(api.mock.calls[0]![1].body);
       expect(body).not.toHaveProperty("advancesPlan");
@@ -867,7 +871,11 @@ describe("selected recording recovery", () => {
     expect(store.read()?.sessionKey).toBe(newer.startedAt);
     await userEvent.click(screen.getByRole("button", { name: "Save" }));
     await screen.findByRole("heading", { name: "Today" });
-    expect(api).toHaveBeenCalledTimes(2);
+    // Two log POSTs (the failed save and the retry); the auto-send link read
+    // after the 201 is not one of them.
+    expect(
+      api.mock.calls.filter(([path]) => path === "/api/logs"),
+    ).toHaveLength(2);
     expect(JSON.parse(api.mock.calls[1]![1].body)).toMatchObject({
       workoutTitle: "Stationary Front",
       source: "pm5",
diff --git a/app/src/workout/WorkoutDetail.connectedRecovery.test.tsx b/app/src/workout/WorkoutDetail.connectedRecovery.test.tsx
index ffbd7757..b7bb594a 100644
--- a/app/src/workout/WorkoutDetail.connectedRecovery.test.tsx
+++ b/app/src/workout/WorkoutDetail.connectedRecovery.test.tsx
@@ -160,9 +160,11 @@ vi.mock("../adapters/monitorTransport", () => ({
 }));
 
 function parsedBodies(fn: typeof apiFn): Record<string, unknown>[] {
-  return fn.mock.calls.map(([, init]) =>
-    JSON.parse((init as RequestInit).body as string),
-  );
+  // Only the log POSTs: since Wave E auto-send a 201 is followed by a
+  // body-less `GET /api/concept2/link`.
+  return fn.mock.calls
+    .filter(([path]) => path === "/api/logs")
+    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
 }
 
 beforeEach(() => {
diff --git a/app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx b/app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx
index d04ca5b2..7a5da4a2 100644
--- a/app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx
+++ b/app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx
@@ -695,7 +695,11 @@ describe("§10 row 2 through the real destination seam: a producer update after
     await waitFor(() => {
       expect(apiFn).toHaveBeenCalled();
     });
-    const [path, init] = apiFn.mock.calls.at(-1)!;
+    // The LAST log POST — since Wave E auto-send the very last call is the
+    // `GET /api/concept2/link` the 201 triggers.
+    const [path, init] = apiFn.mock.calls
+      .filter(([p]) => p === "/api/logs")
+      .at(-1)!;
     expect(path).toBe("/api/logs");
     const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
     // The three fields that spread would have added, all absent: the late
@@ -951,7 +955,11 @@ describe("§10 row 2 through the real destination seam: a producer update after
     await waitFor(() => {
       expect(apiFn).toHaveBeenCalled();
     });
-    const [path, init] = apiFn.mock.calls.at(-1)!;
+    // The LAST log POST — since Wave E auto-send the very last call is the
+    // `GET /api/concept2/link` the 201 triggers.
+    const [path, init] = apiFn.mock.calls
+      .filter(([p]) => p === "/api/logs")
+      .at(-1)!;
     expect(path).toBe("/api/logs");
     const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
     expect(body.machineWorkMeters).toBe(LATE_SUMMARY.meters);
@@ -1023,7 +1031,11 @@ describe("§10 row 2 through the real destination seam: a producer update after
     await waitFor(() => {
       expect(apiFn).toHaveBeenCalled();
     });
-    const [path, init] = apiFn.mock.calls.at(-1)!;
+    // The LAST log POST — since Wave E auto-send the very last call is the
+    // `GET /api/concept2/link` the 201 triggers.
+    const [path, init] = apiFn.mock.calls
+      .filter(([p]) => p === "/api/logs")
+      .at(-1)!;
     expect(path).toBe("/api/logs");
     const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
     expect(body.machineWorkMeters).toBe(LATE_SUMMARY.meters);
```

</details>

---

## Task 5: browser tests and captures

**Commit:** `b1d21c47`.

**Files:** `app/e2e/concept2.spec.ts`, `app/e2e/screenshots.spec.ts`, `docs/screenshots/{concept2-screen-linked,concept2-screen-armed}.png` (re-shot), `docs/screenshots/{concept2-screen-automatic,concept2-screen-send-failed,you-concept2-send-failed}.png` (new).

**The fake** (`C2Fake`) answers `PATCH /link` (`patch`, default 204) and records `patches` + `patchHeaders`; the results branch records `sendPaths`, `sendBodies` (`postDataJSON()`) and `sendHeaders`. `LinkBody` gains the three fields.

**Tests (describe "Concept2 auto-send, in a real browser", 7):** fresh link is MANUAL (group, pressed states, Unlink gone, every segment ≥ 44×44); AUTOMATIC PATCHes `{autoSend:true}` with a JSON content-type and the control follows the RE-READ (the fake's link answer is flipped before the tap; `linkReads` must move); a refused PATCH shows the A7 line with MANUAL still pressed; armed OFF is `aria-pressed`, 52 px, spans the control's content width (group width − 2 px borders, tolerance 1 px), siblings `toBeHidden()`, no DELETE/PATCH, disarms; SEND FAILED on the row and the pill together with the reason line and the remedy, then RECONNECT NEEDED wins on both; **AUTOMATIC: a save through the manual door's own form fires ONE send to the row the form wrote** (path id = the newest history row's id), JSON `tz`, JSON header, Today not held; MANUAL: the same save reads the link and sends nothing. The three unlink tests tap OFF. Run: `bash scripts/e2e.sh e2e/concept2.spec.ts e2e/design.spec.ts -g "Concept2|concept2|c2-card|C2"` → 43 passed (after two fixes: a 0.016 px width tolerance and one un-renamed Unlink click in `design.spec.ts`'s token test).

**Captures:** `--project=screenshots -g "concept2|you-concept2"` → 16 passed; the five above kept, seven unrelated re-shots reverted (identity line carries the run stamp). Each opened and checked against the Gate 0 frames.

- [ ] **Step 1: the commit is the implementation.** Review package: `git show b1d21c47` (stat below). Reviewer: brief = this task's section; diff = the commit; gates = the suites named above, re-run from `app/`.

```
b1d21c47 Auto-send: browser tests and captures

 app/e2e/concept2.spec.ts                         | 286 ++++++++++++++++++++++-
 app/e2e/screenshots.spec.ts                      |  79 ++++++-
 docs/screenshots/concept2-screen-armed.png       | Bin 30905 -> 31120 bytes
 docs/screenshots/concept2-screen-automatic.png   | Bin 0 -> 25851 bytes
 docs/screenshots/concept2-screen-linked.png      | Bin 25066 -> 25870 bytes
 docs/screenshots/concept2-screen-send-failed.png | Bin 0 -> 31663 bytes
 docs/screenshots/you-concept2-send-failed.png    | Bin 0 -> 28845 bytes
 7 files changed, 359 insertions(+), 6 deletions(-)
```

<details>
<summary>The diff, verbatim (<code>git show b1d21c47</code>)</summary>

```diff
diff --git a/app/e2e/concept2.spec.ts b/app/e2e/concept2.spec.ts
index 40f5c272..a2523912 100644
--- a/app/e2e/concept2.spec.ts
+++ b/app/e2e/concept2.spec.ts
@@ -55,6 +55,10 @@ interface LinkBody {
   c2Username?: string | null;
   needsReauth?: boolean;
   logbookBaseUrl?: string | null;
+  // Wave E auto-send §3.1.
+  autoSend?: boolean;
+  sendFailedAt?: string | null;
+  sendFailedReason?: string | null;
 }
 
 interface Answer {
@@ -89,6 +93,8 @@ class C2Fake {
   connect: Answer = { status: 200, body: {} };
   unlink: Answer = { status: 204 };
   send: Answer = { status: 200, body: {} };
+  /** `PATCH /api/concept2/link` — the sending-mode write (auto-send §3.2). */
+  patch: Answer = { status: 204 };
 
   /** Reads of `GET /api/concept2/link`. The POSITIVE readiness signal every
    *  negative assertion in this file waits on: "the card is absent" is only
@@ -100,6 +106,14 @@ class C2Fake {
   connectBodies: unknown[] = [];
   deletes = 0;
   sends = 0;
+  /** Every PATCH body and its Content-Type, verbatim off the wire. */
+  patches: unknown[] = [];
+  patchHeaders: string[] = [];
+  /** Every send's path, parsed body and Content-Type — the automatic send is
+   *  gated on what the route would RECEIVE, never on a count alone. */
+  sendPaths: string[] = [];
+  sendBodies: unknown[] = [];
+  sendHeaders: string[] = [];
 
   async install(page: Page): Promise<void> {
     await page.route(/\/api\/concept2\//, async (route: Route) => {
@@ -111,6 +125,10 @@ class C2Fake {
         if (method === "DELETE") {
           this.deletes += 1;
           answer = this.unlink;
+        } else if (method === "PATCH") {
+          this.patches.push(req.postDataJSON());
+          this.patchHeaders.push(req.headers()["content-type"] ?? "");
+          answer = this.patch;
         } else {
           this.linkReads += 1;
           answer = this.link;
@@ -120,6 +138,9 @@ class C2Fake {
         answer = this.connect;
       } else if (url.pathname.includes("/api/concept2/results/")) {
         this.sends += 1;
+        this.sendPaths.push(url.pathname);
+        this.sendBodies.push(req.postDataJSON());
+        this.sendHeaders.push(req.headers()["content-type"] ?? "");
         answer = this.send;
       } else {
         // The stubbed consent landing page: a document inside the app's own
@@ -429,7 +450,9 @@ test.describe("Concept2 link and send, in a real browser", () => {
     );
     await expect(page.locator(".c2-card-status")).toHaveText("LINKED ✓");
 
-    const unlink = page.getByRole("button", { name: "Unlink Concept2" });
+    // Wave E auto-send: Unlink is the control's OFF segment now (spec §3.2,
+    // RF23 — one affordance for one destructive act).
+    const unlink = page.getByRole("button", { name: "OFF" });
     await unlink.click();
     // ONE tap arms and fires nothing. The DELETE count is the assertion,
     // not the button's label: a card that changed its words while also
@@ -709,7 +732,7 @@ test.describe("Concept2 link and send, in a real browser", () => {
     fake.unlink = { status: 500, body: { error: "boom" } };
     await openConcept2Screen(page, fake);
 
-    await page.getByRole("button", { name: "Unlink Concept2" }).click();
+    await page.getByRole("button", { name: "OFF" }).click();
     await page.getByRole("button", { name: "Tap again to unlink" }).click();
     await expect.poll(() => fake.deletes).toBe(1);
 
@@ -729,9 +752,7 @@ test.describe("Concept2 link and send, in a real browser", () => {
     // The arm is SPENT on every exit, not only the happy one (invariant
     // I2): a live "Tap again to unlink" sitting under a REASON line is one
     // stray tap away from a DELETE the rower has not decided to repeat.
-    await expect(
-      page.getByRole("button", { name: "Unlink Concept2" }),
-    ).toBeVisible();
+    await expect(page.getByRole("button", { name: "OFF" })).toBeVisible();
     await expect(
       page.getByRole("button", { name: "Tap again to unlink" }),
     ).toHaveCount(0);
@@ -933,3 +954,258 @@ test.describe("Concept2 row on You (Wave E PR A)", () => {
     await expect(page.getByRole("link", { name: /CONCEPT2/ })).toHaveCount(0);
   });
 });
+
+/**
+ * WAVE E AUTO-SEND (spec 2026-09-05; Gate 0 amendment 2026-09-05). The
+ * sending-mode control that replaced Unlink, the sticky SEND FAILED flag on
+ * the row and the card, and the automatic send itself — driven from the
+ * rower's own Save tap on the log form, so the gate starts upstream of the
+ * producer (RF24) and reads the wire body the send route would receive.
+ */
+test.describe("Concept2 auto-send, in a real browser", () => {
+  /** Same in-page-`fetch` idiom as `log.spec.ts`'s own `setBaselines` (e2e
+   *  helpers are copied across files here, not shared). The manual door
+   *  short-circuits to a "Set baselines" stub for a workout whose steps
+   *  resolve against a pace reference; the form under test needs them. */
+  async function setBaselines(page: Page): Promise<void> {
+    const result = await page.evaluate(async () => {
+      const res = await fetch("/api/baselines", {
+        method: "PUT",
+        headers: { "Content-Type": "application/json" },
+        body: JSON.stringify({ k2Seconds: 105, k6Seconds: 115 }),
+      });
+      return { ok: res.ok, status: res.status, body: await res.text() };
+    });
+    if (!result.ok) {
+      throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
+    }
+  }
+
+  /** Saves ONE row through the manual door's real form — HELD, Pain 3, Save —
+   *  and returns once Today has rendered. This is the producer every
+   *  automatic-send assertion below must start upstream of. */
+  async function saveThroughTheForm(page: Page): Promise<void> {
+    await setBaselines(page);
+    await page.goto("/library");
+    await page.locator(".workout-row").first().click();
+    await expect(page.locator("h1.workout-detail-title")).toBeVisible();
+    const workoutId = page.url().match(/\/library\/([^/]+)$/)?.[1];
+    expect(workoutId).toBeTruthy();
+    await page.goto(`/library/${workoutId!}/log`);
+    await expect(page.locator("h1.screen-title")).toBeVisible();
+    await page.getByRole("button", { name: "HELD" }).click();
+    await page.getByRole("button", { name: "Pain 3" }).click();
+    await page.getByRole("button", { name: "Save", exact: true }).click();
+    await expect(page).toHaveURL(/\/today$/);
+  }
+
+  const control = (page: Page) =>
+    page.getByRole("group", { name: "Sending mode" });
+
+  test("a fresh link is MANUAL: three aria-pressed buttons, Unlink gone, the mode line beneath", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "mode-manual");
+    fake.linked();
+    await openConcept2Screen(page, fake);
+    const group = control(page);
+    await expect(group.getByRole("button")).toHaveText([
+      "OFF",
+      "MANUAL",
+      "AUTOMATIC",
+    ]);
+    await expect(group.getByRole("button", { name: "MANUAL" })).toHaveAttribute(
+      "aria-pressed",
+      "true",
+    );
+    await expect(
+      group.getByRole("button", { name: "AUTOMATIC" }),
+    ).toHaveAttribute("aria-pressed", "false");
+    await expect(
+      page.getByText("Send each finished monitor row yourself, from the log."),
+    ).toBeVisible();
+    await expect(
+      page.getByRole("button", { name: "Unlink Concept2" }),
+    ).toHaveCount(0);
+    // Every segment clears the house floor in the real column.
+    for (const name of ["OFF", "MANUAL", "AUTOMATIC"]) {
+      const box = await group.getByRole("button", { name }).boundingBox();
+      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
+      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
+    }
+  });
+
+  test("AUTOMATIC PATCHes { autoSend: true } as JSON, then the control follows the RE-READ, not the tap", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "mode-auto");
+    fake.linked();
+    await openConcept2Screen(page, fake);
+    await expect(
+      control(page).getByRole("button", { name: "MANUAL" }),
+    ).toHaveAttribute("aria-pressed", "true");
+
+    // The server will say AUTOMATIC on the read that follows the write.
+    const readsBefore = fake.linkReads;
+    fake.linked({ autoSend: true });
+    await control(page).getByRole("button", { name: "AUTOMATIC" }).click();
+    await expect.poll(() => fake.patches.length).toBe(1);
+    expect(fake.patches[0]).toEqual({ autoSend: true });
+    expect(fake.patchHeaders[0]).toMatch(/^application\/json/);
+    await expect.poll(() => fake.linkReads).toBeGreaterThan(readsBefore);
+    await expect(
+      control(page).getByRole("button", { name: "AUTOMATIC" }),
+    ).toHaveAttribute("aria-pressed", "true");
+    await expect(
+      page.getByText("Finished monitor rows are sent when you save them."),
+    ).toBeVisible();
+
+    // Back to MANUAL.
+    fake.linked();
+    await control(page).getByRole("button", { name: "MANUAL" }).click();
+    await expect.poll(() => fake.patches.length).toBe(2);
+    expect(fake.patches[1]).toEqual({ autoSend: false });
+    await expect(
+      control(page).getByRole("button", { name: "MANUAL" }),
+    ).toHaveAttribute("aria-pressed", "true");
+  });
+
+  test("a refused PATCH shows the A7 line and leaves the pressed state on the server's value", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "mode-refused");
+    fake.linked();
+    fake.patch = { status: 500, body: { error: "boom" } };
+    await openConcept2Screen(page, fake);
+    await control(page).getByRole("button", { name: "AUTOMATIC" }).click();
+    await expect.poll(() => fake.patches.length).toBe(1);
+    await expect(
+      page.getByText("Couldn't change this. Try again."),
+    ).toBeVisible();
+    await expect(
+      control(page).getByRole("button", { name: "MANUAL" }),
+    ).toHaveAttribute("aria-pressed", "true");
+    await expect(
+      control(page).getByRole("button", { name: "AUTOMATIC" }),
+    ).toHaveAttribute("aria-pressed", "false");
+    await expect(
+      control(page).getByRole("button", { name: "AUTOMATIC" }),
+    ).toBeEnabled();
+  });
+
+  test("armed OFF spans the control alone; the other segments are hidden until it disarms", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "mode-armed");
+    fake.linked({ autoSend: true });
+    await openConcept2Screen(page, fake);
+    const group = control(page);
+    const groupBox = await group.boundingBox();
+    await group.getByRole("button", { name: "OFF" }).click();
+    const armed = page.getByRole("button", { name: "Tap again to unlink" });
+    await expect(armed).toBeVisible();
+    await expect(armed).toHaveAttribute("aria-pressed", "true");
+    // Gate 0 §2a in a real engine: the CSS that hides the siblings and spans
+    // the armed segment is measured, not read (RF21).
+    await expect(group.getByRole("button", { name: "MANUAL" })).toBeHidden();
+    await expect(group.getByRole("button", { name: "AUTOMATIC" })).toBeHidden();
+    const armedBox = await armed.boundingBox();
+    expect(armedBox?.height).toBe(52);
+    // Spans the control's whole CONTENT width: the group's box less its two
+    // 1px borders (measured 2.016 at 390px; the tolerance is for subpixels).
+    expect(
+      Math.abs((armedBox?.width ?? 0) - ((groupBox?.width ?? -1) - 2)),
+    ).toBeLessThanOrEqual(1);
+    await expect(
+      page.getByText("DISARMS ON ITS OWN AFTER 4 SECONDS"),
+    ).toBeVisible();
+    expect(fake.deletes).toBe(0);
+    expect(fake.patches).toHaveLength(0);
+
+    // A tap on a sibling that is hidden cannot happen; the timer disarms.
+    await expect(group.getByRole("button", { name: "OFF" })).toBeVisible({
+      timeout: 6000,
+    });
+    await expect(
+      group.getByRole("button", { name: "AUTOMATIC" }),
+    ).toHaveAttribute("aria-pressed", "true");
+    expect(fake.patches).toHaveLength(0);
+  });
+
+  test("SEND FAILED reads on the You row and the card's pill together; the screen names the reason and offers the profile", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "send-failed");
+    fake.linked({
+      autoSend: true,
+      sendFailedAt: "2026-09-05T12:00:00.000Z",
+      sendFailedReason: "no_weight",
+    });
+    await openYou(page);
+    const row = page.getByRole("link", { name: /CONCEPT2/ });
+    await expect(row.locator(".diag-row-state")).toHaveText("SEND FAILED");
+    await row.click();
+    await expect(page.locator(".c2-card-status")).toHaveText("SEND FAILED");
+    await expect(
+      page.getByText(
+        "Rows aren't being sent: Concept2 needs a weight class, and your Concept2 profile has no weight set.",
+      ),
+    ).toBeVisible();
+    await expect(
+      page.getByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
+    ).toBeVisible();
+    await expect(
+      control(page).getByRole("button", { name: "AUTOMATIC" }),
+    ).toHaveAttribute("aria-pressed", "true");
+
+    // RECONNECT NEEDED wins over the flag on both surfaces (ruling 5's shape).
+    fake.linked({
+      needsReauth: true,
+      sendFailedAt: "2026-09-05T12:00:00.000Z",
+      sendFailedReason: "no_weight",
+    });
+    await page.getByRole("link", { name: /BACK/ }).click();
+    await expect(row.locator(".diag-row-state")).toHaveText("RECONNECT NEEDED");
+    await row.click();
+    await expect(page.locator(".c2-card-status")).toHaveText(
+      "RECONNECT NEEDED",
+    );
+    await expect(
+      page.getByText("Sends are paused until you reconnect."),
+    ).toBeVisible();
+  });
+
+  test("AUTOMATIC: saving a row through the log form fires ONE send to that row, JSON tz body, without holding Today", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "auto-save");
+    fake.linked({ autoSend: true });
+    fake.send = { status: 200, body: { resultId: 901 } };
+    await saveThroughTheForm(page);
+
+    await expect.poll(() => fake.sends).toBe(1);
+    expect(fake.sendBodies[0]).toMatchObject({ tz: expect.any(String) });
+    expect((fake.sendBodies[0] as { tz: string }).tz.length).toBeGreaterThan(0);
+    expect(fake.sendHeaders[0]).toMatch(/^application\/json/);
+
+    // The row the send named is the row the form just wrote: open the
+    // newest history row and compare ids.
+    const sentId = fake.sendPaths[0]!.match(/\/results\/([^/]+)$/)?.[1];
+    expect(sentId).toBeTruthy();
+    await page.goto("/today/log");
+    await page.locator(".today-log-row").first().click();
+    await expect(page).toHaveURL(new RegExp(`/today/log/${sentId!}$`));
+  });
+
+  test("MANUAL: the same save reads the link and sends nothing", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "manual-save");
+    fake.linked();
+    const readsBefore = fake.linkReads;
+    await saveThroughTheForm(page);
+    // The decision's own read is the positive signal the negative waits on.
+    await expect.poll(() => fake.linkReads).toBeGreaterThan(readsBefore);
+    expect(fake.sends).toBe(0);
+  });
+});
diff --git a/app/e2e/screenshots.spec.ts b/app/e2e/screenshots.spec.ts
index 53b08d4b..231c6137 100644
--- a/app/e2e/screenshots.spec.ts
+++ b/app/e2e/screenshots.spec.ts
@@ -6424,6 +6424,32 @@ test("you-concept2-linked", async ({ page }) => {
   });
 });
 
+test("you-concept2-send-failed", async ({ page }) => {
+  // Wave E auto-send §3.4, Gate 0 amendment 2026-09-05 §4b: the fifth row
+  // string, at its siblings' weight (`--ink-3`, ruled).
+  const fake: C2ShotFake = {
+    link: {
+      status: 200,
+      body: {
+        ...C2_SHOT_LINKED,
+        autoSend: true,
+        sendFailedAt: "2026-09-05T12:00:00.000Z",
+        sendFailedReason: "no_weight",
+      },
+    },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2You(page, "screenshots-c2-send-failed@e2e.test");
+  await expect(
+    page.getByRole("link", { name: /CONCEPT2/ }).locator(".diag-row-state"),
+  ).toHaveText("SEND FAILED");
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "you-concept2-send-failed.png"),
+    fullPage: true,
+  });
+});
+
 test("you-concept2-reconnect", async ({ page }) => {
   // Cell 9: the pre-emptive warning the row exists for — the server's own
   // `needs_reauth_at`, on a surface the rower passes anyway, before they
@@ -6517,11 +6543,61 @@ test("concept2-screen-linked", async ({ page }) => {
     "Concept2 jamesawesome · Ergomatic screenshots-c2-screen-linked",
   );
   await expect(page.locator(".c2-card-status")).toHaveText("LINKED ✓");
+  // Wave E auto-send: the control where Unlink was, MANUAL pressed for a
+  // fresh link, the mode line beneath (Gate 0 amendment 2026-09-05 §1).
+  await expect(
+    page.getByRole("button", { name: "MANUAL", pressed: true }),
+  ).toBeVisible();
   await page.screenshot({
     path: path.join(SCREENSHOTS_DIR, "concept2-screen-linked.png"),
   });
 });
 
+test("concept2-screen-automatic", async ({ page }) => {
+  // Gate 0 amendment 2026-09-05 §1, AUTOMATIC: the promise as the mode line.
+  const fake: C2ShotFake = {
+    link: { status: 200, body: { ...C2_SHOT_LINKED, autoSend: true } },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2Screen(page, "screenshots-c2-screen-automatic@e2e.test");
+  await expect(
+    page.getByRole("button", { name: "AUTOMATIC", pressed: true }),
+  ).toBeVisible();
+  await expect(
+    page.getByText("Finished monitor rows are sent when you save them."),
+  ).toBeVisible();
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-automatic.png"),
+  });
+});
+
+test("concept2-screen-send-failed", async ({ page }) => {
+  // Gate 0 amendment 2026-09-05 §4: the pill, the reason line in warn
+  // weight, the profile remedy — the card's half of the sticky flag.
+  const fake: C2ShotFake = {
+    link: {
+      status: 200,
+      body: {
+        ...C2_SHOT_LINKED,
+        autoSend: true,
+        sendFailedAt: "2026-09-05T12:00:00.000Z",
+        sendFailedReason: "no_weight",
+      },
+    },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2Screen(page, "screenshots-c2-screen-send-failed@e2e.test");
+  await expect(page.locator(".c2-card-status")).toHaveText("SEND FAILED");
+  await expect(
+    page.getByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
+  ).toBeVisible();
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-send-failed.png"),
+  });
+});
+
 test("concept2-screen-armed", async ({ page }) => {
   // 1d, on the screen it now lives on. Unlink keeps its tier, its size and
   // its two-tap arm (spec §5.1 R8/R9): on a screen whose only job is this
@@ -6532,7 +6608,8 @@ test("concept2-screen-armed", async ({ page }) => {
   };
   await routeC2(page, fake);
   await openC2Screen(page, "screenshots-c2-screen-armed@e2e.test");
-  await page.getByRole("button", { name: "Unlink Concept2" }).click();
+  // Wave E auto-send: OFF is the unlink (Gate 0 amendment 2026-09-05 §2).
+  await page.getByRole("button", { name: "OFF" }).click();
   await expect(
     page.getByRole("button", { name: "Tap again to unlink" }),
   ).toBeVisible();
diff --git a/docs/screenshots/concept2-screen-armed.png b/docs/screenshots/concept2-screen-armed.png
index d87b2b40..eb15f90c 100644
Binary files a/docs/screenshots/concept2-screen-armed.png and b/docs/screenshots/concept2-screen-armed.png differ
diff --git a/docs/screenshots/concept2-screen-automatic.png b/docs/screenshots/concept2-screen-automatic.png
new file mode 100644
index 00000000..76d0460d
Binary files /dev/null and b/docs/screenshots/concept2-screen-automatic.png differ
diff --git a/docs/screenshots/concept2-screen-linked.png b/docs/screenshots/concept2-screen-linked.png
index 2d2399ce..a30195c5 100644
Binary files a/docs/screenshots/concept2-screen-linked.png and b/docs/screenshots/concept2-screen-linked.png differ
diff --git a/docs/screenshots/concept2-screen-send-failed.png b/docs/screenshots/concept2-screen-send-failed.png
new file mode 100644
index 00000000..cff83f57
Binary files /dev/null and b/docs/screenshots/concept2-screen-send-failed.png differ
diff --git a/docs/screenshots/you-concept2-send-failed.png b/docs/screenshots/you-concept2-send-failed.png
new file mode 100644
index 00000000..14dfeadb
Binary files /dev/null and b/docs/screenshots/you-concept2-send-failed.png differ
```

</details>

---

## Task 6: docs — spec rev 4, design page §9, handoff README, ROADMAP status, release note

**Commit:** `c70b1dfa`.

**Files:** `docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md` (rev 4: the two as-built mechanisms in §3.3), `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html` (§9 Built — the landscape mode-line departure, the ink remedy, segment padding), `docs/design/handoffs/2026-08-31-concept2-connect/README.md` (intro; 1c/1d superseded notes; the linked-state line), `ROADMAP.md` (Gate 0 approved + BUILT status on the auto-send row; ticks at merge), `docs/RELEASING.md` ("Not a floor — migration 0024": defaulted/nullable columns; PATCH 404s on an older server and the card says so).

**Phrase sweep at head:** `grep -rn "Unlink Concept2\|can be sent from the log\|c2-card-danger\|c2-card-helper" app/src app/e2e app/server docs/design/DEVIATIONS.md` → only the two comments that NAME the removal (`index.css`'s control header, `Concept2Card.tsx`'s control comment). `DEVIATIONS.md`: no row added — the card's remedy is `--ink`, so the accent link-out row stays scoped to Surface 2.

- [ ] **Step 1: the commit is the implementation.** Review package: `git show c70b1dfa` (stat below). Reviewer: brief = this task's section; diff = the commit; gates = the suites named above, re-run from `app/`.

```
c70b1dfa Auto-send: docs — spec rev 4, design page §9, ROADMAP status, release note

 ROADMAP.md                                         |  7 +++
 docs/RELEASING.md                                  |  8 ++++
 .../handoffs/2026-08-31-concept2-connect/README.md | 25 ++++++++---
 .../amendment-2026-09-05-autosend.html             |  8 ++++
 .../specs/2026-09-05-concept2-auto-send-design.md  | 52 ++++++++++++++--------
 5 files changed, 77 insertions(+), 23 deletions(-)
```

<details>
<summary>The diff, verbatim (<code>git show c70b1dfa</code>)</summary>

```diff
diff --git a/ROADMAP.md b/ROADMAP.md
index d796e1e4..973dc23e 100644
--- a/ROADMAP.md
+++ b/ROADMAP.md
@@ -1141,6 +1141,13 @@ closed with zero Concept2 contact.
       redrawn card. Rulings (James, 2026-09-05): off = unlinked; silent;
       default manual; no backlog send. Spec:
       `docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md`.
+      **Gate 0 APPROVED 2026-09-05** (amendment
+      `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html`,
+      one fix on sight: armed OFF spans the control). **BUILT on
+      `wave-e-c2-autosend`, 2026-09-05** — spec rev 4 records the two
+      implementation departures (§3.3: the fresh read is one direct
+      `fetchLink()` after the 201, not a mounted hook; the in-flight claim is
+      a wait-then-rerun chain, not a stored response). Ticks at merge.
 - [ ] **Verification code: hide it, say "verified".** James, 2026-09-05: like
       Concept2's own UI, the MACHINE CONFIRMED block should not show the raw
       16-digit code by default; once Concept2 has accepted the code for that
diff --git a/docs/RELEASING.md b/docs/RELEASING.md
index 3645a528..4ce54543 100644
--- a/docs/RELEASING.md
+++ b/docs/RELEASING.md
@@ -174,3 +174,11 @@ not a redeploy.
 | the tag carrying migration 0020 (`session_logs.source`, unconnected-JR PR) | 0020 adds `source` NOT NULL with a backfill. A server older than it does not write the column, so rolling the API back past it makes every new save fail the NOT NULL constraint (no row is written, the app shows its save failure and holds the record). Not data loss, but a total write outage until rolled forward. |
 | the tag carrying migration 0022 (`log_source` gains `no-reading`; door PR A) | Two one-way changes. (1) `log_source` widens to a fourth member, `no-reading` — a server older than this migration 400s every `no-reading` save (`LOG_SOURCES` doesn't know the member) on field `source`. The client's only 400 retry is scoped to `field === "workoutId"` (`LogSession.tsx:773-783`), so a `source` 400 does not retry; it falls to `setSaveError` and returns WITHOUT `onSaved` (`:806-808`: "a failed save ... leaves the caller's own records intact so the rower can retry without redoing anything") — the same shape as the 0020 row above: the app shows its save failure and holds the record. Not data loss, a write outage until rolled forward. (2) `preferences.warmup` is DROPPED — a server older than this migration still declares and selects that column, so `GET /api/prefs` fails outright (`column "warmup" does not exist`) until rolled forward. Not data loss either way, but a write outage on `no-reading` saves plus a read outage on `/api/prefs` until rolled forward. **An AUTOMATED path can cross this floor unattended:** `scripts/deploy.sh:23-29`'s `rollback()` fires from an `ERR` trap when the new build fails its health wait, and by then the new container has already booted and MIGRATED — so `git checkout --force "$PREV"` plus `up` restores an image whose `schema.ts` still declares `preferences.warmup` against a database where the column is gone. `GET /api/prefs` then 500s while the deploy log reports the rollback succeeded. Recovery is FORWARD-FIX ONLY: re-deploy the newer SHA. The 0020 row above has the same exposure by the same path. |
 | the tag carrying migration 0023 (`concept2_links.c2_username` added; both `weight_class` columns and the enum type DROPPED; Wave E PR2) | One-way, and NOT rollback-image compatible — 0021's `NOT NULL DEFAULT` affordance does not apply, because this migration DROPS rather than adds. A server older than it still declares `weight_class` on `concept2_links` and `concept2_auth_attempts`, so any INSERT it makes into either table names a column that no longer exists and errors. **Today the exposure is zero and that is exactly the trap:** `computeAvailable` requires `C2_LINK_ENABLED === "1"`, the flag is set-but-empty in production (measured on the deploy host by James, 2026-09-04), and both tables held 0 rows at merge — so no writer exists to break. **The debt comes due at the FLAG FLIP, which is a config change with no PR of its own**, and therefore no later change would naturally add this row. **The AUTOMATED path crosses it unattended, same as the two rows above:** `scripts/deploy.sh:23-29`'s `rollback()` fires from an `ERR` trap after the new container has already booted and migrated, so the restored older image meets a database whose columns are gone. Recovery is FORWARD-FIX ONLY: re-deploy the newer SHA. |
+
+**Not a floor — migration 0024 (`concept2_links.auto_send` / `send_failed_*`,
+Wave E auto-send).** All three columns are defaulted or nullable, so a server
+older than it inserts and reads the link row unchanged; the one new write,
+`PATCH /api/concept2/link`, 404s on such a server and the card shows
+_"Couldn't change this. Try again."_ with the mode left on whatever the server
+holds. A rollback past it is a read-only outage on one control, never data
+loss or a save failure.
diff --git a/docs/design/handoffs/2026-08-31-concept2-connect/README.md b/docs/design/handoffs/2026-08-31-concept2-connect/README.md
index 93aefe00..1c4c452f 100644
--- a/docs/design/handoffs/2026-08-31-concept2-connect/README.md
+++ b/docs/design/handoffs/2026-08-31-concept2-connect/README.md
@@ -43,7 +43,9 @@ implementation.
 ## Overview
 
 Two surfaces that link a rower's Concept2 logbook account and send finished
-monitor rows to it, one row at a time, manually:
+monitor rows to it — one row at a time from the log, or, since the 2026-09-05
+auto-send amendment, automatically as each row saves when the rower has set
+AUTOMATIC (`amendment-2026-09-05-autosend.html`):
 
 1. **Concept2 card** — owns the link (OAuth via the system browser) and
    unlink. It asks the rower nothing (2026-09-03 ruling). **Moved
@@ -137,7 +139,10 @@ this file still quotes an older one, the amendment wins.
   PROVISIONAL until one logged-in glance names the page that carries the
   weight and weight-class fields.
 - **Weight class does not show on ANY card** (1a, 1c, 1d) — there is none
-  to show. Linked state is LINKED ✓, the identity line, helper, unlink.
+  to show. Linked state is LINKED ✓, the identity line, helper, unlink
+  (**CHANGED 2026-09-05:** the helper and the Unlink button are gone; the
+  OFF · MANUAL · AUTOMATIC control stands where Unlink was, with the mode
+  line beneath it — `amendment-2026-09-05-autosend.html` §1).
 - **Not linked → nothing on the log row.** The Concept2 block renders only
   when an account is linked. No pointer, no disabled control. The CONCEPT2
   row on You (opening the card's screen, since PR A) is the sole discovery
@@ -242,9 +247,15 @@ WAITING / CHECKING; `#1b1a17` 600 for LINKED ✓).
   tappable) and the outcome arrives in `startLink`'s promise; on web
   `openExternalUrl` is `window.location.assign`, so the document unloads.
   See `amendment-2026-09-03.html` §1b for the rendered frame and its copy.
-- **1c Linked**: LINKED ✓ status; helper "Finished monitor rows can be sent from the log." (12px `#57544c`); hairline;
+- **1c Linked**: ~~LINKED ✓ status; helper "Finished monitor rows can be sent from the log." (12px `#57544c`); hairline;
   **Unlink Concept2** button (52px, outline `1px solid #b5341f`, text
-  `#b5341f` 16px 600). No weight class shown — as of 2026-09-03 none
+  `#b5341f` 16px 600).~~ **SUPERSEDED 2026-09-05 (auto-send, Gate 0
+  approved):** the helper contradicted AUTOMATIC and is replaced by the
+  mode line (_"Send each finished monitor row yourself, from the log."_ /
+  _"Finished monitor rows are sent when you save them."_, 12px `--ink-3`);
+  the Unlink button is replaced by the three-segment OFF · MANUAL ·
+  AUTOMATIC control (44px segments, pressed = `--ink` fill). The pill gains
+  SEND FAILED. `amendment-2026-09-05-autosend.html` §1, §4. No weight class shown — as of 2026-09-03 none
   exists to show, on this card or any other, and as of 2026-09-04 no card
   mentions one either. **Gate 0 amendment,
   callback pages: APPROVED 2026-09-02 and BUILT at PR1.75a — the shared
@@ -257,7 +268,11 @@ WAITING / CHECKING; `#1b1a17` 600 for LINKED ✓).
 - **1d Unlink armed confirm** (two-tap): first tap swaps in explainer
   "Unlink removes this app's access. Rows already sent stay on Concept2."
   and the button becomes filled `#b5341f` / `#fffdf7`, label "Tap again to
-  unlink". Auto-disarms after 4 s (footnote states this).
+  unlink". Auto-disarms after 4 s (footnote states this). **CHANGED
+  2026-09-05:** the first tap is the control's OFF segment; while armed it
+  spans the control at the old button's 52px, fill and copy, and the MANUAL
+  / AUTOMATIC segments are hidden until it disarms
+  (`amendment-2026-09-05-autosend.html` §2, ruled on sight).
 - **1e Link failed** (OAuth callback bounced): status NOT LINKED; sunken
   panel THE LINK DIDN'T FINISH: "The connection didn't complete. Nothing was linked." (the trailing "Your weight class pick is
   kept." is dropped 2026-09-03: there is no pick to keep) · **Try again**
diff --git a/docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html b/docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html
index 475b66e7..db050246 100644
--- a/docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html
+++ b/docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html
@@ -428,3 +428,11 @@
   <tr><td class="num">6</td><td>UNSENT-without-reason after an automatic failure</td><td>accept; the reason lives on the screen and the row</td></tr>
 </table></div>
 <p class="lede">Approving the page approves the recommendations; naming a number overrides it. Then STOP: the plan is written only after this gate.</p>
+
+<h2>9 · Built (2026-09-05) — what departs from the frames</h2>
+<p class="lede"><strong>APPROVED 2026-09-05</strong> with one fix on sight (2a). Every recommendation in §8 shipped as drawn, with one placement departure recorded here rather than silently:</p>
+<ul>
+  <li><strong>Landscape mode line.</strong> §1's landscape frame draws the mode line in the TELL column under the identity and the control alone in the ACT column; the portrait frames draw identity → hairline → control → mode line. One DOM cannot honour both, so the built card keeps the portrait order and in landscape the mode line sits in the act column beneath the control (the same class of departure 1f already records for its identity line). Portrait is the primary surface and reads exactly as drawn.</li>
+  <li><strong>The remedy link-out</strong> is <code>.c2-card-linkout</code>: <code>--ink</code> mono 12px at 44px, as §4a's frame and §7's row draw it — not the log block's accent link-out, since §7 rules <code>--accent</code> gains no new use.</li>
+  <li><strong>Segment padding</strong> <code>0 4px</code> so AUTOMATIC's caps never touch the hairline at 375px; widths measured ≥ 104px in portrait.</li>
+</ul>
diff --git a/docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md b/docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md
index 20115d16..5dcecf3b 100644
--- a/docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md
+++ b/docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md
@@ -1,5 +1,14 @@
 # Wave E follow-on — automatic Concept2 sends: OFF · MANUAL · AUTOMATIC
 
+**Rev 4 (2026-09-05, implementation).** Two mechanisms in §3.3 are recorded
+as BUILT rather than as first written, same invariants, cheaper shape: the
+fresh read is one direct `fetchLink()` (the hook's own read, exported) after
+the 201 instead of a `useConcept2Link()` mounted on every log door — no new
+`GET /link` on three doors that never read it; and the in-flight claim is a
+wait-then-rerun chain rather than a stored `{status, body}` — the second
+caller awaits the first's settlement and re-runs the handler, whose own
+already-sent short-circuit then answers it. Nothing a rower sees changes.
+
 **Rev 3 (2026-09-05).** Rev 1 took the full antagonist pass (TRIAD, phase-open
 anchor): eight falsified, one ruling to James (§3.4, "A"). Rev 2 took the DELTA
 pass on its four new mechanisms: eight more falsified, one ruling to James
@@ -219,12 +228,14 @@ automatic send 400s silently (delta F1). §4's gate reads the PARSED wire body.
   answer, swallowed, and does NOT set the failure flag (§3.4). Cost: one 422
   per non-monitor save for an AUTOMATIC rower.
 - **The decision waits for a fresh read, so it is never made on a stale or
-  pending link (A4).** The form mounts `useConcept2Link()` (a `GET /link` on
-  every log door — programmed, Just Row, timer, hand entry: four `useLogForm`
-  call sites, three of which had no such read before; named as a cost) and,
-  after the 201, calls the hook's reload once more and awaits it. A failed read
-  → no send. This converts an unobservable silence into a decision; the save's
-  own round trip means the extra read costs the rower nothing visible.
+  pending link (A4).** BUILT (rev 4): `useLogForm`'s 201 path calls
+  `autoSendAfterSave(logId)` (`log/concept2Send.ts`), which takes ONE
+  `fetchLink()` — the same parsing `useConcept2Link` uses, exported from it —
+  and decides on the result. Rev 3 mounted the hook on every log door for
+  this read (a `GET /link` on four doors, three of which never read it); the
+  direct read keeps the invariant — the decision is made on an answer fetched
+  AFTER the 201, and a failed read → no send — without the mount-time cost.
+  The save's own round trip means the read costs the rower nothing visible.
 - **Fire-and-forget; navigation is not held** (A5, HELD). The server writes the
   outcome onto the row (`c2_result_id`) or onto the link (the failure flag);
   the row's block and the You row read those on their next mount. No
@@ -232,18 +243,23 @@ automatic send 400s silently (delta F1). §4's gate reads the PARSED wire body.
 - **The in-process claim (F1) — and it is a refactor, not a line.** The send
   route's short-circuit covers a RETRY, not two sends in flight (both read the
   row before either writes; no lock on `session_logs`). Rev 1 leaned on
-  Concept2's dedup — a vendor heuristic. **Rule: `createConcept2Router` holds a
-  `Map<"userId:logId", Promise<{status, body}>>`; a second caller for a key
-  already present awaits the first's promise and answers with its result; the
-  entry clears in `finally`, including when the send THREW.** Keyed by user as
-  well as row (the 200 carries a weight class), scoped to the router instance
-  (one process in production — `container_name` in compose makes `--scale`
-  impossible, measured; one per test app so route tests do not share a table).
-  **The cost, said plainly (delta F7): the upload handler's exits — seventeen
-  `res.status(...)` calls over ~585 lines — become a returned `{status, body}`
-  the claim can store; the plan sizes that refactor as its own task.** Sharing
-  a failure between callers is correct in both directions: a manual tap that
-  joins a failing automatic send gets the 422 it can act on.
+  Concept2's dedup — a vendor heuristic. **Rule (as BUILT, rev 4):
+  `createConcept2Router` holds a `Map<"userId:logId", Promise<void>>`; a
+  second caller for a key already present AWAITS the first's settlement and
+  then RE-RUNS the handler against the row the first one wrote — the
+  already-sent short-circuit answers a 200 carrying the recorded result, a
+  first that failed leaves the second to try for itself; the entry clears in
+  `finally`, including when the send THREW.** Keyed by user as well as row,
+  scoped to the router instance (one process in production —
+  `container_name` in compose makes `--scale` impossible, measured; one per
+  test app so route tests do not share a table). Rev 3 stored a
+  `{status, body}` and answered the second caller with it, which meant
+  turning seventeen `res.status(...)` exits into returned values (delta F7);
+  the chain keeps the invariant that matters — two overlapping sends of one
+  row never both reach Concept2 — with no response capture and no exit
+  refactor. The one behavioural difference: a second caller behind a FAILED
+  first gets its own fresh attempt rather than a copy of the failure, which
+  is the manual tap's normal retry.
 - **No `trigger` field** (rev 2's diagnostic, withdrawn at the delta pass): a
   client-asserted arm label rides only on sends that ARRIVE, and both silent
   failure modes produce no request. The route stays blind to the arm by design
```

</details>

---

## Harden fix round — commits `cfb99c98` and `a46cb712`

`/harden` ran both lenses in parallel on the plan as committed (`32d4b594`); reports in the session scratchpad (`harden-lens1.md`, `harden-lens2.md`). Lens 1 (antagonist delta on the two as-built mechanisms) and lens 2 (the code read as code) converged on ONE mechanism defect and five smaller ones; everything below changed a code block, a gate, or an expected value — bookkeeping findings (a stale helper comment, a RELEASING clause, a confirmed-clean RF5 sweep) were folded without a pass.

| # | finding (lens) | fix | gate |
| --- | --- | --- | --- |
| F1 | the claim released on the response's `finish`/`close`, freeing the key while the handler still posted (1 + 2, PROVEN `wireCalls = 2`) | `claimSend` is a handler WRAPPER released in `finally`; key lower-cased | A10 abort leg: enter the wire call, `.abort()` request 1, issue request 2, assert one wire call BEFORE releasing — deterministic |
| F2 | pressed segment `--ink-3` on `--ink` = 2.30:1 while disabled (2) | `:disabled` colour scoped `:not([aria-pressed="true"])`; comment states both pairings | `design.spec.ts` reads computed `color`/`background-color` of the pressed segment against a held PATCH |
| F3 | a 201 body `{ id: "" }` sent to `/results/` (2) | `parsed.id !== ""` | `LogSession.test.tsx`: empty id → Today, zero `/api/concept2/` calls |
| F4 | `modeFailed` outlived unlink + relink (1 + 2) | cleared at `connect()` entry and on any control tap | card test: fail a PATCH, unlink, relink, line gone |
| F5 | `implausible_weight` missing from three enumerations of the column (2) | schema comment, store comment, spec §3.1 / §3.4 | — |
| F6 | no test from a real 422 to the GET's `sendFailedReason` (2, RF24) | six lines in A11's `no_weight_class` test | the same test |
| F7 | `reload()`'s widened return had no reader (1 + 2, RF29) | narrowed back to `Promise<void>`; two tests deleted; doc names `fetchLink` | typecheck |

**Mutations (measured, committed tree `a46cb712`):**

| # | mutation | failure |
| --- | --- | --- |
| M17 | `claimSend` releases BEFORE `await handler(req, res)` (the middleware's hole, re-created) | 2 failed: the concurrent test AND the abort leg — `expected "vi.fn()" to be called 1 times, but got 2 times` |
| M18 | delete `:not([aria-pressed="true"])` from the disabled colour rule | e2e `the pressed mode segment keeps --on-color on --ink while its PATCH is in flight` — `Expected: "rgb(255, 253, 247)" Received: "rgb(87, 84, 76)"` (the pressed segment painted `--ink-3`; stack rebuilt with the mutant, 1 failed) |
| M19 | `&& parsed.id !== ""` removed | `a 201 whose body carries an EMPTY id sends nothing…` — `expected [ [ '/api/concept2/link' ], …(1) ] to have a length of +0 but got 2` |
| M20 | `setModeFailed(false)` removed from `connect()` | `the A7 line does not survive an unlink and relink…` — `expected <p class="c2-card-mode-error"></p> to be null`. (With the clear ALSO in `unlink()`, this probe stayed green — that site was redundant and is gone.) |

**Gates on the fixed head:** `pnpm typecheck` clean; `pnpm lint` clean; routes 160 passed (159 + the abort leg); `webauth-contract` 8; card 65; hook 36; `LogSession` 195; `autoSend` 16; `Concept2SendBlock`, `Concept2Row` green. Browser suites: `bash scripts/e2e.sh e2e/concept2.spec.ts e2e/design.spec.ts -g "Concept2\|concept2\|c2-card\|C2"` → 44 passed (43 + the mid-PATCH contrast test).

## Review fix round — commit `4bfe26f3`

Seven task reviewers (one per commit plus one for the harden fix round; reports in `.superpowers/sdd/2026-09-05-concept2-auto-send/`). Spec ✅ on every task; quality "fix" on Tasks 1, 2, 3 and the harden round. Folded in one commit:

| finding (review) | fix | gate |
| --- | --- | --- |
| harden-round I1: `modeFailed` cleared only at `connect()`, but the `pageshow` re-read and the Retry `reload()` return a card to linked without it | the control is `SendingModeControl`, mounted only while `link.linked`; its state dies on unmount | card test: fail a PATCH, unlink, relink by a `pageshow` re-read, line gone |
| T3 I2: `disabled` during the write drops keyboard focus to `<body>` | the activated segment is re-focused when the control re-enables (effect on `modeBusy`, no state) | card test: Enter on AUTOMATIC → after the write it has focus |
| T3 I3: the pill spelled the precedence a second time | `linkedStatus()` in `concept2RowState.ts` feeds `rowState`, `linkedPill` and `modeLine` (a total switch) | model tests; Row cells 13/14 |
| T3 I1 / lens 2 bookkeeping: the `.c2-card-helper` assertion could never go red | re-pointed at `.c2-card-mode-line` absent on the unlinked card | itself |
| T3 M4/M5/M6/M7: Up/Down swallowed; `aria-pressed` on an armed OFF; mode line not associated | Left/Right only; OFF `aria-pressed="false"` always; `aria-describedby` → the mode line | card tests (arrows, description); fixtures regenerated; e2e armed test asserts the false state and the armed pairing as literals |
| T2 F1/F2: `PATCH /link` absent from the ambiguous-auth and per-user-gate sweeps | rows added; the 400 rows seed AUTOMATIC | M22, M23 |
| T2 F4: the case-folded key had no test | two spellings of one uuid → one wire call; the fake logs store folds uuid case as Postgres does | M21 |
| T1 / T2 F7: `setSendFailed(reason: string)` | typed `WeightClassFailure` (store + fake), schema comment names the type | typecheck |
| T2 F5/F6/F8/F13, T6, lens 2 bookkeeping 2 | comment counts (five strings, fifteen cells, nine keys); the contract extractor's window ends at the nearest of PATCH/DELETE; the post-ok-record-failed 502 says why it keeps the flag; the intermediate A10 assertion labelled fast-fail; §9 lede; RELEASING clause | — |
| T4 minor | `autoSend.test`: AUTOMATIC under `needsReauth` still sends (server answers 409) | itself |
| T3 M1/M2/M8 | `MODE_LINE_*` module-private; model tests for `modeLine`/`linkedPill`; the A7 `it.each` typed | — |

Not taken, with the reason: T2 F9 (the already-sent short-circuit clears the flag on historical evidence) is the spec's own ruling and goes to the PM gate as an observation; T2 F11 (`sendFailedAt` not validated as ISO) — the mode line never formats the instant, so nothing renders `Invalid Date`; T3 M5's alternative (drop arrows) — the spec's F4 chose arrows-move-focus explicitly.

**Mutations (measured, committed tree `4bfe26f3`):**

| # | mutation | failure |
| --- | --- | --- |
| M21 | `claimSend`'s key without `.toLowerCase()` | `two spellings of one row's id take ONE claim` — `called 1 times, but got 2 times` |
| M22 | `refuseAmbiguousAuth` removed from `PATCH /link` | `patch /api/concept2/link -> 400 ambiguous_auth` — `expected 204 to be 400` |
| M23 | `PATCH /link` gated on `available()` instead of `availableFor(email)` | `PATCH /link: an off-list user gets 403…` — `expected 204 to be 403` |

**Gates on `4bfe26f3`:** typecheck clean; lint clean; routes 163; contract 8; card + model + Row + hook + LogSession + autoSend + SendBlock 412 passed; browser suites `bash scripts/e2e.sh e2e/concept2.spec.ts e2e/design.spec.ts -g "Concept2\|concept2\|c2-card\|C2"` → 44 passed.

## Task 7: the whole-branch gate, the PR, and STOP

- [ ] `pnpm lint && pnpm typecheck && pnpm test --project unit --project client` on the final head; `pnpm test --project integration`; `pnpm build && pnpm dist:grep`; `pnpm e2e` (full) — record each result in the PR's Record block.
- [ ] Whole-branch final review (most capable model), ONE fix round, scoped re-review.
- [ ] PM final gate (TRIAD): present with the PR body.
- [ ] PR body per `.claude/agent-briefing.md` (≤ ~120 words above the fold; Record block: gates, M1-M16 verbatim, the two as-built departures, the layout departure, the test-count consequence). Then STOP — no merge without James.
