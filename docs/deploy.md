# Deploying Ergomatic

Push to main → CI → `deploy` job on the self-hosted runner SSHes the commit SHA
to the host → a forced command runs `scripts/deploy.sh <sha>` → compose rebuilds
and waits for health → on failure, automatic rollback to the previous commit.

CI's jobs are `changes`, `root-hooks`, `app`, `docker`, `e2e`, `scripts` and
`deploy`. **`changes` runs first and decides whether the code jobs run at all**
(`scripts/ci-changes.sh`): a push touching only `docs/`, `.claude/` or root
markdown skips `app`, `docker` and `e2e`. Every uncertainty — a bad SHA, an
empty diff, an unrecognised path, the script itself failing — resolves to
running them.

## One-time host setup (same host as nataliesawacritter.info)

1. **Checkout**: `git clone git@github.com:JamesAwesome/Ergomatic.git ~/Ergomatic`
   (as the deploy user). `cp .env.example .env && chmod 600 .env`; fill in
   `POSTGRES_PASSWORD` and, for the tunnel, `CLOUDFLARE_TUNNEL_TOKEN` +
   `COMPOSE_PROFILES=tunnel`.
2. **Forced-command SSH key**: on the host, create `~/deploy-forced-ergomatic.sh`:

   ```bash
   #!/usr/bin/env bash
   # The only thing the Ergomatic CI deploy key can do: deploy a main SHA.
   set -Eeuo pipefail
   SHA="${SSH_ORIGINAL_COMMAND:-}"
   [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy-forced: not a sha" >&2; exit 2; }
   export DEPLOY_PATH="$HOME/Ergomatic"
   exec "$DEPLOY_PATH/scripts/deploy.sh" "$SHA"
   ```

   `chmod +x` it. Generate a dedicated keypair (`ssh-keygen -t ed25519 -C ergomatic-deploy`)
   and add to `~/.ssh/authorized_keys`:

   ```
   restrict,command="/home/DEPLOYUSER/deploy-forced-ergomatic.sh" ssh-ed25519 AAAA... ergomatic-deploy
   ```

   A stolen key can only trigger a deploy of a real 40-hex SHA — never a shell.
3. **Runner**: register a repo-level self-hosted runner for
   `JamesAwesome/Ergomatic` (Settings → Actions → Runners → New self-hosted
   runner) on the host, installed as a service. The deploy user must be in the
   `docker` group.
4. **Tunnel**: Cloudflare Zero Trust → Networks → Tunnels → create
   `ergomatic`; add a public hostname `ergomatic.waffle.haus` →
   `http://web:8080`; copy the token into `.env`. (Hostname may change later —
   it lives only here and in `SITE_URL`.)
   **The service URL must use the CONTAINER port 8080** — `web` resolves on
   the compose network, where `APP_PORT`/8082 does not exist (that's only the
   host-side bind). Setting `http://web:8082` yields 502s from the edge.
   Also: keep exactly ONE `APP_PORT=` line in `.env` — compose takes the
   last occurrence when duplicates exist.
   After changing the compose topology, the tunnel origin must be edited in
   the Cloudflare Zero Trust dashboard — expect 502s from the edge until
   it is.
5. **GitHub environment**: create environment `production` with secrets
   `DEPLOY_SSH_KEY` (the private key), `DEPLOY_KNOWN_HOSTS`
   (`ssh-keyscan -H <host>` output), `DEPLOY_HOST`, `DEPLOY_USER`.
6. **First deploy**: `cd ~/Ergomatic && POSTGRES_PASSWORD=... docker compose up -d --wait`
   once by hand to seed the stack, then let CI take over.

## Rollback

> **CHECK THE FLOOR FIRST. `docs/RELEASING.md` § "Rollback constraints" is the
> floor: its NEWEST row. Each row names the migration it carries and the first
> tag that carried it ("untagged" means every build since that migration
> merged is above the floor). To re-derive a tag from the migration file:
> `git tag --contains $(git log --diff-filter=A --format=%h -- app/drizzle/00NN_*.sql) --sort=v:refname | head -1`.
> This sentence carries no version of its own because the last one it
> carried (v0.16.0) stayed after the table grew five rows.** Crossing it makes the
> seed DELETE renamed global rows and null every `session_logs.workout_id` that
> pointed at them. That is unrecoverable link loss, and rolling forward again
> does not bring the links back. **Recovery is a database backup, and no backup
> script exists in this repo yet** (roadmap Wave B). Read that section before
> typing a rollback command, not after.

**Automatic**, on a failed health gate: `deploy.sh` traps the error and checks
out `PREV`, which is **the host checkout's HEAD when the deploy started** — not
"the last known-good deploy". If the previous deploy left the host on a bad
commit, that is what it returns to.

**Manual**: `ssh` to the host, then

```bash
cd ~/Ergomatic && git checkout <good-sha> && docker compose up -d --build --wait
```

Two things that bite here:

- **`deploy.sh` refuses to run on a dirty checkout** (`exit 3`), and a
  hand-rolled rollback is the most likely way to leave one dirty. Check
  `git status --porcelain` on the host before letting CI deploy again.
- **A LOCK COLLISION ON THE HOST LOOKS EXACTLY LIKE A FAILED BUILD.** Seen
  2026-09-14 on run `34907509845` (merge `a847148b`): all six code jobs
  green, `deploy` red, and the only honest line in a 166-line log was

  ```
  fatal: update_ref failed for ref 'HEAD': cannot lock ref 'HEAD':
  Unable to create '/home/<user>/Ergomatic/.git/HEAD.lock': File exists.
  ```

  `git checkout --force "$SHA"` could not move HEAD, the `ERR` trap fired,
  and the rollback did its job perfectly — `PREV` rebuilt, every container
  healthy, `exit 1`. **The tell is that the log ends with everything
  HEALTHY and still exits 1**, because what you are reading is the
  ROLLBACK's `up`, not the deploy's. Prod then serves the PREVIOUS commit
  while main's tip looks merged and green (RF28's exact shape).

  **That lock was TRANSIENT, not stale** — checked on the host minutes
  later and the file did not exist, so nothing had to be removed and a
  re-run was the whole recovery. **Do not reach for `rm` first.** Look:

  ```bash
  ls -l ~/Ergomatic/.git/HEAD.lock     # usually absent by the time you look
  ```

  If it is ABSENT, some git process held it for the moment the deploy
  needed it and has since finished: just `gh run rerun <run-id> --failed`.
  Only if it is PRESENT, with no live git process to explain it, is it
  genuinely stale and safe to `rm`.

  **What held it is NOT established.** The leading candidate is the
  background `git gc --auto` that `git fetch` can spawn, since `deploy.sh`
  runs `git fetch --prune origin` on the line before the checkout — but
  that is INFERENCE, untested. Two reads on the host would settle it:
  `git config --get gc.auto` and `ls -l ~/Ergomatic/.git/gc.log`.

  Either way, **confirm prod actually moved** rather than trusting the
  green tick: the deploy is only real if the host's `git rev-parse HEAD`
  equals the merge SHA.
- **A rollback is only safe above the floor.** If the good SHA is below it,
  restoring the database comes first.

## Google sign-in (one-time)

1. Google Cloud Console → APIs & Services → Credentials → Create credentials
   → OAuth client ID → type **Web application**, name `ergomatic`.
2. Authorized redirect URIs — preserve the existing callbacks and add the
   confirmed-signup callback:
   - `https://ergomatic.waffle.haus/api/auth/callback`
   - `https://ergomatic.waffle.haus/api/auth/google/callback` (combined provider flow)
   - `http://localhost:5173/api/auth/callback` (local dev)
3. Configure the consent screen if prompted (External, app name Ergomatic;
   publish it or add your rowers as test users).
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the host `.env`, plus
   `ACCESS_MODE=restricted` and `ALLOWED_EMAILS=you@example.com,other@example.com`.
5. **iOS native sign-in (Phase 3+)**: Google Cloud Console → Credentials →
   Create credentials → OAuth client ID → type **iOS**, bundle ID
   `haus.waffle.ergomatic`. iOS clients have no secret. Put its client ID in
   `.env` as `GOOGLE_IOS_CLIENT_ID`.
6. `docker compose up -d` to recreate the app with the new env.

Notes:
- `ACCESS_MODE` accepts `restricted` or `public`, trimming surrounding
  whitespace. Missing or blank defaults to `restricted`; any other value
  rejects startup. Restricted mode checks `ALLOWED_EMAILS` for both Apple and
  Google, for new and existing accounts. An empty list admits nobody. Public
  mode allows signup and login without the list.
- The account's saved email is the access key after provider-subject lookup.
  Returning sign-ins and linking preserve that email. Removing it blocks
  existing cookie and bearer sessions on their next protected server request
  after configuration reload, and blocks later sign-ins through either
  linked provider. Account and workout data remain stored. Reallowing the
  account can restore access with a still-unexpired session.
- `ACCESS_MODE` and `ALLOWED_EMAILS` changes take effect on container
  recreate, not live. Requests already admitted may finish. This is server
  access control; it does not wipe cached client data.
- If sign-in breaks after a deploy, check the app logs for the boot warning
  about missing Google env before debugging anything else.

## Apple sign-in setup

Apple is available when its complete valid configuration is present. All
five Apple values absent or blank keeps Google-only operation, including
HTTP localhost. Partial or invalid Apple configuration rejects startup.
`ACCESS_MODE` controls account access independently of which providers are
configured. (An earlier draft of this page told you to delete an obsolete
`FRONT_DOOR_ENABLED` assignment from the host `.env`. That variable has never
existed on `main` — `git grep FRONT_DOOR_ENABLED main` is empty — so there is
nothing to delete unless you set it by hand while this branch was in
progress.)

**Check the boot log after any `ALLOWED_EMAILS` change.** In `restricted`
mode the API now reports how many existing accounts the list excludes, because
an incomplete list signs those accounts out at their next request while the
container still reports healthy. The log gives a count, never the addresses —
Apple-first accounts are private-relay addresses. To see which:

```sh
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select email from users;"'
```

The service is `postgres`, not `db`, and the role and database both default to
`ergomatic`, not `postgres` (`compose.yml`) — an earlier version of this block
got both wrong. Expanding `$POSTGRES_USER`/`$POSTGRES_DB` INSIDE the container
means the command works whatever the host `.env` sets them to, and needs no
editing.

**Before a deploy that changes access, check the whole condition at once.**
This reads only the api container's own environment, prints counts rather than
addresses, and applies the same trim-and-lowercase normalization the server
uses, so it answers what the server will actually decide:

```sh
docker compose exec api node -e '
const {Pool}=require("pg");
const p=new Pool({connectionString:process.env.DATABASE_URL});
const allow=new Set((process.env.ALLOWED_EMAILS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean));
p.query("select email from users").then(r=>{
const miss=r.rows.filter(x=>!allow.has(x.email.trim().toLowerCase())).length;
console.log("ACCESS_MODE :",process.env.ACCESS_MODE||"(unset -> restricted)");
console.log("accounts    :",r.rowCount);
console.log("allowlist   :",allow.size);
console.log("LOCKED OUT  :",miss,miss?"<-- FIX BEFORE DEPLOY":"(none)");
return require("jose").importPKCS8(process.env.APPLE_PRIVATE_KEY||"","ES256").then(()=>console.log("PEM         : OK"),e=>console.log("PEM         : BAD -",e.message));
}).then(()=>p.end());'
```

`LOCKED OUT: 0` and `PEM: OK` is the passing state. A bad PEM reads
`Found a character that cannot be part of a valid base64 string` when the
escaped `\n` was never decoded, and `"pkcs8" must be PKCS#8 formatted string`
when the value is missing — and a partial `APPLE_*` set fails the boot outright
rather than disabling Apple, so the whole API is down, not just sign-in. Both
forms were measured against a real container on 2026-09-13.

The current deployment at `ergomatic.waffle.haus` is staging. Use
`ACCESS_MODE=restricted` and explicitly list tester account emails. Future
production will have its own domain and web Services ID; those values are
not yet chosen. The existing CI environment is still named `production`;
this access-policy change does not split deployment infrastructure. Public
access and external TestFlight still require in-app deletion and the Wave A
release gates.

For an HTTPS deployment:

1. Enable Sign in with Apple for the primary App ID `haus.waffle.ergomatic`.
   Refresh provisioning for the native entitlement; an unsigned simulator
   build does not verify provisioning or an actual Apple authorization.
2. Register a distinct Services ID and associate it with that primary App ID.
   Staging uses `haus.waffle.ergomatic.web.staging`. Register the deployment
   domain and exact return URL
   `https://ergomatic.waffle.haus/api/auth/apple/callback` (substitute the
   configured `SITE_URL` origin for another deployment). Grouping and shared
   subject identity still require the real native/web continuity check.
3. Create a Sign in with Apple private key associated with the primary App ID.
   Put its Team ID, Key ID and downloaded PKCS8 `.p8` key in the server-only
   `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` values. This is a
   Sign in with Apple service key, separate from an App Store upload key.
4. Set `APPLE_NATIVE_CLIENT_ID=haus.waffle.ergomatic` and
   `APPLE_WEB_CLIENT_ID` to the registered Services ID. Neither is a secret;
   the private key must never be a `VITE_` value or enter the app bundle.
5. Add `https://ergomatic.waffle.haus/api/auth/google/callback` to the Google
   web client's redirect URLs, preserving `/api/auth/callback` for installed
   clients. For a different deployment use that HTTPS `SITE_URL` origin.

With any Apple value present, the server rejects missing or invalid Apple
configuration at boot, including a non-HTTPS site or identical native/web
audiences. Changes require container recreation. Compose's double-quoted
`.env` values decode `\n` to
actual line breaks, so the PEM can occupy one quoted assignment. Do not print
a resolved compose configuration containing real credentials.

Keep the native App ID, web Services ID and service key associated with the
intended Apple developer team. Apple states: “The user identifier remains
unique and static for your developer team.” Its relay documentation also
scopes private addresses to the developer team. Separate app groups alone
are not a documented reason to expect new subjects or relay addresses;
a developer-team transfer needs Apple's explicit migration process. Keep
separate environment Services IDs/callbacks, and verify real native/web
account continuity before public activation. These are configuration
requirements, not a claim that the live continuity check has passed.
[Identity-token contract](https://developer.apple.com/documentation/signinwithapple/receiving-a-users-identity-token)
· [relay scope](https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service)
· [team transfer](https://developer.apple.com/documentation/signinwithapple/transferring-your-apps-and-users-to-another-team).

Hide My Email works through the Apple subject. In restricted mode, an
Apple-first account needs its actual relay address in `ALLOWED_EMAILS`.
Apple linked to an existing Google account uses that account's saved email
for access, so adding the relay address is unnecessary. If an Apple-first
tester's relay address is not yet listed, they can retrieve it from their
Apple Account's Sign in with Apple → Apps and Websites details for Ergomatic,
then give that address to the operator for the allowlist. After the API
configuration reloads, they can retry sign-in. Apple's
[relay guide](https://developer.apple.com/documentation/signinwithapple/communicating-using-the-private-email-relay-service)
documents where users can view and manage the address. Sending mail to relay
addresses is a separate configuration: register outgoing email sources with Apple's relay service
before adding an email-sending feature. This login slice adds no email sender.

PRIMARY setup references: [web association](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web),
[service key](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key),
and [relay mail sources](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service).

## Concept2 logbook (optional, currently dark)

The broker is wired on every deploy and refuses everything until the host
`.env` says otherwise. Three variables turn it on, a fourth says who for, and
a fifth picks which Concept2 it talks to:

- `C2_CLIENT_ID` / `C2_CLIENT_SECRET` — the OAuth app registered at Concept2.
- `C2_LINK_ENABLED=1` — the literal `1`, nothing else counts.
- `C2_BASE_URL` — which Concept2 this deploy talks to. Does NOT turn
  anything on: it defaults to the sandbox (`https://log-dev.concept2.com`),
  so it is never absent. The live logbook is `https://log.concept2.com` and
  needs write approval first.
- `C2_ALLOWED_EMAILS` — a comma-separated list, same shape and same parser
  as `ALLOWED_EMAILS` (case-insensitive, whitespace trimmed).
  **Unset or empty means NOBODY can link, not everybody**: it is the per-user
  gate that lets the surface go live for one account before it goes live for
  the whole sign-in allowlist. Widening this list is what a real cutover
  does; nothing else has to change.

Notes:
- The two lists are independent. In restricted mode, `ALLOWED_EMAILS`
  controls account access through either provider. `C2_ALLOWED_EMAILS`
  controls the Concept2 card in either access mode
  and does not create an Ergomatic account.
- A rower off the C2 list reads exactly what a flag-off server sends
  (`{available:false}`), so the card is simply absent — there is no error to
  explain.
- Like the sign-in allowlist, changes take effect on container recreate.
- **Removing an email takes the Concept2 surface away**: that rower's card
  disappears and their sends are refused at the next recreate. Their stored link and its Concept2 tokens
  are NOT deleted by the removal — but they can still disconnect it
  themselves while they retain Ergomatic account access, because unlink is
  deliberately not per-user gated (a capability gate closes use, not a rower's
  way out). To revoke it FOR them, delete the
  row; the account and its rows are untouched:
  `docker exec -it ergomatic-postgres psql -U ergomatic -c "delete from concept2_links where user_id=(select id from users where email='x@y.com')"`.
  The container name is `${ERGO_STACK:-ergomatic}-postgres`; local worktree
  stacks set their own prefix. Run `docker ps` first to find it. Revoking
  Ergomatic's access at Concept2's end is the rower's own action, in their Concept2
  account settings; we have no revocation endpoint (spec V5).
- **Read the boot log after any change to the list.** With the flag on, the
  app prints `Concept2 per-user gate: N allowed email(s) configured`, or
  warns that the list is empty. It never prints the addresses. `N` is the
  number that reached the container after parsing, so it separates "the
  variable never arrived" from "it arrived and I typo'd an address" — the
  two failures that otherwise look identical from the outside, since both
  end in an absent card.

## TestFlight releases

See `docs/RELEASING.md` for the complete process: when to release, versioning
discipline (tag-driven, never hand-edit), and step-by-step cutting a release.

**First-time iOS build machine setup is NOT written down anywhere.** This file
used to say it lived in RELEASING.md and RELEASING.md said it lived here; it
lives in neither, and both pointers were wrong for as long as they existed.
What is missing is everything between a fresh Mac and a working `pnpm
ios:release`: Xcode and command-line tools, the signing certificate and
provisioning profile, the App Store Connect API key `xcodebuild -exportArchive`
authenticates with, and the Google iOS OAuth client. Whoever sets up the next
build Mac writes this section as they go.
