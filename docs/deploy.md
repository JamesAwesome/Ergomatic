# Deploying Ergomatic

Push to main → CI (root-hooks, app, docker, deploy-script) → `deploy` job on the
self-hosted runner SSHes the commit SHA to the host → a forced command runs
`scripts/deploy.sh <sha>` → compose rebuilds and waits for health → on failure,
automatic rollback to the previous commit.

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
   `http://app:8080`; copy the token into `.env`. (Hostname may change later —
   it lives only here and in `SITE_URL`.)
5. **GitHub environment**: create environment `production` with secrets
   `DEPLOY_SSH_KEY` (the private key), `DEPLOY_KNOWN_HOSTS`
   (`ssh-keyscan -H <host>` output), `DEPLOY_HOST`, `DEPLOY_USER`.
6. **First deploy**: `cd ~/Ergomatic && POSTGRES_PASSWORD=... docker compose up -d --wait`
   once by hand to seed the stack, then let CI take over.

## Rollback

Automatic on failed health gate. Manual: `ssh` to the host,
`cd ~/Ergomatic && git checkout <good-sha> && docker compose up -d --build --wait`.
