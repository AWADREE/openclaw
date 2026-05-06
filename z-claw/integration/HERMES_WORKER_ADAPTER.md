# Hermes Worker Adapter

Version: 0.1

This adapter makes OpenClaw route worker turns to Hermes profiles.

## Goal

OpenClaw should manage routing, scheduling, operational logs, and reports.
Hermes should power each agent's cognition, memory, skills, and tool loop.

## Shape

OpenClaw calls a local OpenAI-compatible provider:

`http://127.0.0.1:18981/v1`

The adapter maps model IDs to Hermes profiles:

- `hermes-workers/main` -> Hermes default profile
- `hermes-workers/planner` -> Hermes profile `zplanner` / Eleanor Brooks
- `hermes-workers/builder` -> Hermes profile `zbuilder` / Owen Carter
- `hermes-workers/researcher` -> Hermes profile `zresearcher` / Clara Whitfield
- `hermes-workers/reporter` -> Hermes profile `zreporter` / Nathan Reed
- `hermes-workers/qa-tester` -> Hermes profile `zqa` / Maya Bennett

Each profile has its own Hermes home directory, `SOUL.md`, memory, sessions,
skills, and state database.

The adapter also stores one persistent Hermes session id per profile under:

`/home/z/Claw/integration/hermes_worker_adapter_state/`

This lets repeated OpenClaw calls to the same worker resume that worker's Hermes
session instead of starting from scratch. If Hermes does not print a session id
on stdout, the adapter discovers the newest session file in that profile and
stores that id for the next call.

The adapter passes only the latest OpenClaw user task into Hermes, plus a short
adapter instruction. It intentionally does not replay OpenClaw's full chat
history into the worker prompt, because that can contaminate a worker with
unrelated prior task text. Persistent context should come from the worker's
Hermes profile, session, memory, SOUL, and skills.

## Cost Routing

The model budget now lives in Hermes profile config:

- `zplanner`: local Ollama `qwen3.5:9b`
- `zresearcher`: local Ollama `qwen3.5:9b`
- `zreporter`: local Ollama `qwen3.5:9b`
- `zbuilder`: `openai-codex/gpt-5.4-mini`
- `zqa`: `openai-codex/gpt-5.4-mini`
- default CEO: `openai-codex/gpt-5.5`

OpenClaw does not directly invoke Codex or Ollama for worker agents. It calls
only the local Hermes worker adapter; Hermes profiles own provider/model choice
and authentication.

## Files

- Adapter server: `/home/z/Claw/integration/hermes_worker_adapter.py`
- Logs: `/home/z/Claw/integration/hermes_worker_adapter.log`
- Session state: `/home/z/Claw/integration/hermes_worker_adapter_state/`
- User service: `~/.config/systemd/user/hermes-worker-adapter.service`

## Status API

`GET /v1/health` returns a sanitized status payload for the hybrid dashboard.
It includes:

- adapter name and version
- model IDs exposed to OpenClaw
- Hermes profile mapped to each model
- human agent name for each profile
- whether the profile home exists
- whether the adapter has a resume session file for that profile
- current adapter session id, latest Hermes session id, session count, and
  session modification time
- aggregate session metrics from each profile `state.db`: session/message/tool
  counts, token totals, model names, billing provider labels, and stored
  estimated/actual cost fields
- last invoke, complete, and error timestamps from the adapter log

It does not include API keys, raw prompts, raw outputs, file contents, or Hermes
auth material.

## Test

Health:

```bash
curl http://127.0.0.1:18981/v1/health
```

Direct OpenClaw route:

```bash
openclaw agent --agent builder --message 'Reply exactly: hermes builder route ok'
```

Expected:

- OpenClaw agent roster shows model `hermes-workers/builder`.
- Adapter log shows profile `zbuilder`.
- Hermes profile session history grows under `~/.hermes/profiles/zbuilder`.

## Verified

Verified on 2026-05-06:

- Adapter service active under user systemd.
- `/v1/models` returns `main`, `planner`, `builder`, `researcher`, `reporter`,
  and `qa-tester`.
- OpenClaw agent roster points all agents to `hermes-workers/*`.
- Direct OpenClaw route to `builder` reached Hermes profile `zbuilder`.
- Direct OpenClaw route to `planner` reached Hermes profile `zplanner`.
- Direct OpenClaw route to `researcher` reached Hermes profile `zresearcher`.
- Direct OpenClaw route to `reporter` reached Hermes profile `zreporter`.
- Direct OpenClaw route to `qa-tester` reached Hermes profile `zqa`.
- Adapter session resume verified for `zbuilder`: first call stored temporary
  phrase `STEEL ORCHID`, second call resumed the same Hermes session id and
  returned `STEEL ORCHID`.
