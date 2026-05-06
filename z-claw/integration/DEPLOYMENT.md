# Z Claw Deployment Runbook

Version: 0.1

This document records the live local deployment shape for the Z Claw
OpenClaw/Hermes hybrid system.

## Live Services

### OpenClaw Gateway

Systemd user unit:

`~/.config/systemd/user/openclaw-gateway.service`

Repo template:

`/home/z/openclaw-hybrid/z-claw/systemd/openclaw-gateway.service`

Current runtime:

```text
/usr/bin/node /home/z/openclaw-hybrid/dist/index.js gateway --port 18789
```

The global `openclaw` command is currently a symlink to:

```text
/home/z/openclaw-hybrid/openclaw.mjs
```

The older npm-installed OpenClaw package remains installed at:

```text
/home/z/.npm-global/lib/node_modules/openclaw/
```

### Hermes Worker Adapter

Systemd user unit:

`~/.config/systemd/user/hermes-worker-adapter.service`

Repo template:

`/home/z/openclaw-hybrid/z-claw/systemd/hermes-worker-adapter.service`

Current runtime:

```text
python3 /home/z/openclaw-hybrid/z-claw/integration/hermes_worker_adapter.py
```

Adapter endpoint:

```text
http://127.0.0.1:18981/v1
```

OpenClaw routes worker model IDs like `hermes-workers/builder` to this local
adapter. The adapter invokes the corresponding Hermes profile.

## Source Locations

- Live OpenClaw hybrid checkout: `/home/z/openclaw-hybrid`
- Repo-local Z-Claw integration layer: `/home/z/openclaw-hybrid/z-claw`
- Runtime Claw workspace: `/home/z/Claw`

OpenClaw Git remotes in `/home/z/openclaw-hybrid`:

- `origin`: `https://github.com/AWADREE/openclaw.git`
- `upstream`: `https://github.com/openclaw/openclaw.git`

Current OpenClaw hybrid branch:

```text
hybrid/z-claw-dashboard
```

The branch is pushed to:

```text
https://github.com/AWADREE/openclaw/tree/hybrid/z-claw-dashboard
```

The OpenClaw hybrid checkout is based on upstream OpenClaw and includes local
commits for:

- native Hybrid dashboard tab
- `hybrid.status` gateway RPC
- Hermes provider/profile/session telemetry
- Hermes profile names in hybrid status

The historical Z-Claw source export and patch archive are stored in:

`/home/z/z-claw-system`

## Verification

Check the OpenClaw CLI points to the hybrid checkout:

```bash
openclaw --version
```

Expected version currently starts with:

```text
OpenClaw 2026.5.6
```

Check the OpenClaw gateway service:

```bash
systemctl --user status openclaw-gateway --no-pager
openclaw gateway status --json
```

Check the Hermes worker adapter:

```bash
systemctl --user status hermes-worker-adapter --no-pager
curl http://127.0.0.1:18981/v1/health
```

Check the hybrid gateway RPC:

```bash
openclaw gateway call hybrid.status
```

Expected high-level result:

- provider `hermes-workers` is reachable
- all OpenClaw agents are `hermesBacked: true`
- agent names come from Hermes profile telemetry
- Z-Claw companies, teams, roles, and model budgets are reported from
  `/home/z/openclaw-hybrid/z-claw/integration/zclaw_organization.json`
- Z-Claw workflow run summaries are reported from
  `/home/z/Claw/workspace/runs`
- Hermes aggregate session metrics are present per profile
- memory owner is `hermes`
- Hermes exact subscription billing and durable-memory semantics remain
  external to OpenClaw

Or run the consolidated health helper:

```bash
python3 /home/z/openclaw-hybrid/z-claw/integration/tools/hybrid_health_check.py
```

The helper checks the OpenClaw CLI, gateway status, Hermes adapter health,
`hybrid.status`, Hermes provider reachability, and whether every OpenClaw agent
is Hermes-backed.

## Build

After changing `/home/z/openclaw-hybrid`:

```bash
cd /home/z/openclaw-hybrid
PATH=/home/z/.local/bin:$PATH pnpm tsgo:core
PATH=/home/z/.local/bin:$PATH pnpm --dir ui exec vitest run --config vitest.config.ts --project unit src/ui/navigation.test.ts src/ui/views/hybrid.test.ts
PATH=/home/z/.local/bin:$PATH pnpm exec vitest run src/gateway/server-methods/hybrid.test.ts
PATH=/home/z/.local/bin:$PATH pnpm --dir ui build
PATH=/home/z/.local/bin:$PATH pnpm build
systemctl --user restart openclaw-gateway
```

If `pnpm build` fails inside a restricted sandbox with a child-process `EPERM`,
rerun it in a normal shell. The build writes generated `dist/` output and runs
Node child processes during CLI startup metadata generation.

## Rollback

To restore the npm-installed OpenClaw CLI symlink:

```bash
ln -sfn /home/z/.npm-global/lib/node_modules/openclaw/openclaw.mjs /home/z/.npm-global/bin/openclaw
```

To reinstall the gateway service from the npm-installed OpenClaw:

```bash
/home/z/.npm-global/lib/node_modules/openclaw/openclaw.mjs gateway install --force --port 18789
systemctl --user restart openclaw-gateway
```

To return to the hybrid checkout after rollback:

```bash
ln -sfn /home/z/openclaw-hybrid/openclaw.mjs /home/z/.npm-global/bin/openclaw
node /home/z/openclaw-hybrid/openclaw.mjs gateway install --force --port 18789
systemctl --user restart openclaw-gateway
```

## Safety Rules

- Do not commit `~/.openclaw/openclaw.json`; it can contain live gateway
  credentials.
- Do not commit `~/.hermes/auth.json`, `.env`, sessions, or profile state DBs.
- Do not commit adapter logs or adapter session state.
- Prefer status endpoints and manifest files over ad hoc shell pipes into
  interpreters.
- Treat OpenClaw usage/cost numbers as OpenClaw-observed only. Hermes
  subscription usage is external until a Hermes metrics bridge is implemented.
