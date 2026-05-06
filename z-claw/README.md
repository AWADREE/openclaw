# Z-Claw Integration Layer

Z-Claw is the repo-local OpenClaw + Hermes integration layer for this OpenClaw
fork. OpenClaw remains the runnable orchestration app; Z-Claw provides the
Hermes worker adapter, agent roster, company/team registry, operating protocol,
workflow tools, health checks, and templates used by this deployment.

The architecture separates responsibilities:

- **Hermes** owns cognition, agent memory, skills, self-improvement, review, and
  final judgment.
- **OpenClaw** owns organization: agents, teams, routing, sessions, schedules,
  operational logs, and reports.
- **Hermes worker profiles** power each OpenClaw worker through a local
  OpenAI-compatible adapter.

This directory intentionally excludes live runtime files such as gateway tokens,
OAuth auth files, Hermes sessions, OpenClaw run ledgers, logs, and generated
test transcripts.

## Current Agent Roster

- Eleanor Brooks, `planner`, Workflow Planner
- Owen Carter, `builder`, Software Coder
- Clara Whitfield, `researcher`, Research Analyst
- Nathan Reed, `reporter`, Operations Reporter
- Maya Bennett, `qa-tester`, QA Analyst

## Key Directories

- `agents/`: role workspaces and policy files for OpenClaw workers
- `integration/`: architecture, operating protocol, workflow rules, packet
  tools, and Hermes worker adapter
- `examples/tools/`: small CLI artifacts produced by workflow tests
- `config/`: sanitized example configuration

## Core Documents

- `integration/ARCHITECTURE.md`
- `integration/OPERATING_DOCTRINE.md`
- `integration/OPERATING_PROTOCOL.md`
- `integration/STANDARD_WORKFLOWS.md`
- `integration/RUN_LEDGER.md`
- `integration/COMMAND_SAFETY.md`
- `integration/HERMES_WORKER_ADAPTER.md`
- `integration/DEPLOYMENT.md`

## Runtime Boundary

Source-owned files live here. Mutable state should stay outside git unless it is
explicitly sanitized and intentionally promoted.

Current live runtime paths may still point at `/home/z/Claw` while the
deployment is migrated. The OpenClaw gateway prefers this repo-local layer for
static Z-Claw source files and keeps run ledgers/session state external.

## Security Notes

Do not commit live files from:

- `~/.openclaw/openclaw.json`
- `~/.hermes/auth.json`
- `~/.hermes/.env`
- `~/.hermes/sessions/`
- `~/Claw/integration/hermes_worker_adapter.log`
- `~/Claw/integration/hermes_worker_adapter_state/`
- `~/Claw/workspace/runs/`

Use this repository as the source-controlled definition of the system, not as a
dump of runtime state.
