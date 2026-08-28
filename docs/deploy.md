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

> **CHECK THE FLOOR FIRST. `docs/RELEASING.md` § "Rollback constraints" names a
> version you must never roll back past — today v0.16.0.** Crossing it makes the
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
- **A rollback is only safe above the floor.** If the good SHA is below it,
  restoring the database comes first.

## Google sign-in (one-time)

1. Google Cloud Console → APIs & Services → Credentials → Create credentials
   → OAuth client ID → type **Web application**, name `ergomatic`.
2. Authorized redirect URIs — add BOTH:
   - `https://ergomatic.waffle.haus/api/auth/callback`
   - `http://localhost:5173/api/auth/callback` (local dev)
3. Configure the consent screen if prompted (External, app name Ergomatic;
   publish it or add your rowers as test users).
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the host `.env`, plus
   `ALLOWED_EMAILS=you@example.com,other@example.com`.
5. **iOS native sign-in (Phase 3+)**: Google Cloud Console → Credentials →
   Create credentials → OAuth client ID → type **iOS**, bundle ID
   `haus.waffle.ergomatic`. iOS clients have no secret. Put its client ID in
   `.env` as `GOOGLE_IOS_CLIENT_ID`.
6. `docker compose up -d` to recreate the app with the new env.

Notes:
- The allowlist is an **admission gate, not revocation**: removing an email
  does not sign out an existing account. To off-board someone, delete their
  row in `users` (sessions cascade):
  `docker exec -it ergomatic-postgres psql -U ergomatic -c "delete from users where email='x@y.com'"`.
  **The container name is not fixed:** `compose.yml` names it
  `${ERGO_STACK:-ergomatic}-postgres`, and `app/scripts/stack-env.sh` derives a
  per-worktree `ERGO_STACK` for local e2e stacks. The line above is correct on
  the production host, where `ERGO_STACK` is unset. Anywhere else, run
  `docker ps` first.
- `ALLOWED_EMAILS` changes take effect on container recreate, not live.
- If sign-in breaks after a deploy, check the app logs for the boot warning
  about missing Google env before debugging anything else.

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
