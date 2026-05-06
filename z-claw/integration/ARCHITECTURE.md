# OpenClaw + Hermes Architecture

## Goal

OpenClaw is the organization and orchestration layer. It owns companies, teams,
task assignment, message routing, schedules, operational logs, and report
collection.

Hermes is the cognition and durable memory layer. It owns the CEO agent,
long-term memory, skill growth, self-improvement, worker-output review, and
final decisions.

The primary reason for using Hermes is to prevent long-running multi-agent
memory drift: lossy compaction, forgotten context, distorted summaries, and
compounding hallucinations over time.

See `OPERATING_DOCTRINE.md` for the system rules that protect this boundary.
See `OPERATING_PROTOCOL.md` for the concrete handoff, memory, model-routing,
and reporting contract used by agents.
See `AGENT_ROLE_SYSTEM.md` for how specialized agent roles are created and
`ROLE_TAXONOMY.md` for the future company/team role map.
See `LOCAL_MODEL_LIMITATIONS.md` for local Ollama worker caveats.
See `PACKET_GATE.md` for deterministic planner/reporter packet validation.
See `PACKET_NORMALIZATION.md` for deterministic repair of useful malformed
packets.
See `HERMES_WORKER_ADAPTER.md` for the OpenClaw-to-Hermes worker bridge.
See `DEPLOYMENT.md` for the live service wiring, verification commands, and
rollback path.
See `RUN_LEDGER.md` for workflow audit records.
See `COMMAND_SAFETY.md` for unattended-safe command policy.

## Current local state

- OpenClaw is initialized at `~/.openclaw`.
- OpenClaw gateway service currently runs from `/home/z/openclaw-hybrid`.
- The global `openclaw` command currently resolves to the hybrid checkout.
- Z-Claw source integration layer:
  `/home/z/openclaw-hybrid/z-claw`.
- Z-Claw organization registry:
  `/home/z/openclaw-hybrid/z-claw/integration/zclaw_organization.json`.
- Main OpenClaw workspace: `/home/z/Claw/workspace`.
- Worker workspaces:
  - `/home/z/Claw/agents/planner`
  - `/home/z/Claw/agents/builder`
  - `/home/z/Claw/agents/researcher`
  - `/home/z/Claw/agents/reporter`
  - `/home/z/Claw/agents/qa-tester`
- OpenClaw agent models now point to local `hermes-workers/*` adapter IDs.
- OpenClaw no longer stores direct Codex/Ollama provider config for workers.
  OpenClaw calls only the local Hermes adapter; Hermes profiles own model
  selection and authentication.
- Hermes default CEO profile model: `openai-codex/gpt-5.5`.
- Hermes local worker profiles:
  - `zplanner`: Eleanor Brooks, Workflow Planner, local Ollama
    `qwen3.5:9b`
  - `zresearcher`: Clara Whitfield, Research Analyst, local Ollama
    `qwen3.5:9b`
  - `zreporter`: Nathan Reed, Operations Reporter, local Ollama
    `qwen3.5:9b`
- Hermes tool-execution worker profiles:
  - `zbuilder`: Owen Carter, Software Coder, Codex `gpt-5.4-mini`
  - `zqa`: Maya Bennett, QA Analyst, Codex `gpt-5.4-mini`
- Hermes worker adapter service:
  - `http://127.0.0.1:18981/v1`
  - `~/.config/systemd/user/hermes-worker-adapter.service`
  - source: `/home/z/openclaw-hybrid/z-claw/integration/hermes_worker_adapter.py`
  - persistent per-profile session state:
    `/home/z/Claw/integration/hermes_worker_adapter_state/`
- LAN Ollama endpoint: `http://192.168.1.34:11434/v1`.
- Configured worker context metadata: 65,536 tokens.
- Hermes CEO model: `openai-codex/gpt-5.5`.
- Hermes Discord gateway is enabled as `Zayne Clawson`.
- Discord `#07-reports` is the Hermes home channel for cron results,
  scheduled reports, and cross-platform messages.
- Discord `#00-ceo` is the CEO control channel. It is configured as a
  mention-free response channel; new top-level messages auto-create isolated
  threads.
- Discord thread isolation has been verified: data remembered in one CEO
  thread was not visible in a separate CEO thread.
- Hermes can reach OpenClaw through MCP from Discord. The local MCP health
  check discovers 9 OpenClaw tools.
- Known caveat: local Ollama workers may produce malformed packets or
  tool-call-shaped text. CEO must reject malformed raw packets, normalize useful
  drafts, and accept only lint-passing raw or normalized packets.
- Current cheap local model selected for planner/researcher/reporter:
  `qwen3.5:9b`, because direct Ollama tool-call smoke tests returned structured
  `tool_calls` and it is practical on the 12GB VRAM Ollama host.
- `qwen2.5-coder:14b` remains installed but is not selected because it printed
  tool-call JSON as content instead of returning structured tool calls.
- `qwen3.5:35b-a3b` remains installed as a possible higher-quality local model,
  but early smoke tests were much slower on the current host.
- Local `qwen3.5:9b` and `qwen3.5:35b-a3b` are not currently selected for
  builder/QA because both failed Hermes/OpenClaw file-write smoke tests: they
  claimed commands were run but no file was created. Builder/QA remain on Codex
  mini for actual tool execution.
- Hermes worker adapter routing, session resume, and cross-agent memory
  isolation have been tested.
- Hermes aggregate session metrics are exposed through the worker adapter
  without reading transcript content. The dashboard can show session/message/tool
  counts, token totals, model labels, billing provider labels, and stored cost
  fields per profile.
- `hybrid.status` now reports the Z-Claw company/team registry and enriches
  live agents with role, team, company scope, model budget, tool-use class, and
  description.
- `hybrid.status` also reports sanitized workflow run summaries from
  `/home/z/Claw/workspace/runs`. It reads `manifest.json` metadata only; it does
  not read raw worker outputs or artifact contents.
- `hybrid.status` reports the Z-Claw workflow catalog from
  `zclaw_workflows.json`. The catalog distinguishes tested recipes such as
  `software_change_small` from planned/custom workflows so the dashboard does
  not imply one universal workflow for every task.
- The Hybrid dashboard renders expandable agent detail panels showing role,
  team, Hermes profile/session metrics, recent workflow participation, model
  labels, billing labels, and operating policy.
- The Hybrid dashboard renders expandable run detail panels from manifest
  metadata, showing run directory, participating agents, artifact paths,
  decisions, and workflow deviations without reading raw worker outputs.
- The Hybrid dashboard derives operational health issues from provider and
  Hermes profile telemetry, surfacing unreachable adapters, unhealthy providers,
  missing profiles, metrics errors, and recent adapter error counts.
- Exact subscription billing remains external because current Hermes Codex
  subscription sessions store zero cost in `state.db`; token totals are the
  practical monitoring signal for now.
- `software_change_small` has been tested from normal Discord requests with:
  - automatic workflow selection,
  - planner packet lint/normalization,
  - builder-owned implementation writes,
  - QA verification,
  - reporter packet lint/normalization,
  - CEO verification,
  - run ledger evidence, and
  - command-safety recovery.

The larger `qwen3.5:35b-a3b` model is available on the same Ollama host but is
not selected right now because it was much slower and still failed actual
Hermes/OpenClaw file-write execution.

## Integration shape

Preferred path:

1. Run OpenClaw gateway locally.
2. Install and configure Hermes.
3. Add OpenClaw to Hermes as an MCP server using:

```json
{
  "mcp_servers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"]
    }
  }
}
```

4. Use Hermes as the user-facing CEO agent.
5. Use the Hermes worker adapter as OpenClaw's local provider for workers.
6. Create one Hermes profile/personality per durable worker role.
7. Let OpenClaw route and schedule work; let Hermes perform role work with its
   own memory and skills.

## Target flow

You
-> Main Hermes CEO agent
-> OpenClaw orchestration layer
-> OpenClaw routes tasks to `hermes-workers/*`
-> Hermes worker adapter invokes the right Hermes profile
-> Hermes worker roles execute and report through OpenClaw
-> Main Hermes CEO reviews, decides what becomes durable memory, and summarizes
-> Discord delivery now; Telegram can be added later if needed

## Memory Boundary

OpenClaw can store raw operational records. It should not be treated as the
source of durable truth.

Hermes is the durable memory authority. Worker outputs, compacted summaries,
and raw logs must be reviewed before becoming durable Hermes memory.

Memory classes:

- Raw logs: OpenClaw/task records/transcripts; useful for audit.
- Working memory: active session/task context; disposable and lossy.
- Durable memory: curated Hermes memory; accepted facts, decisions, lessons,
  preferences, and stable structure.

## Future Company Model

The system should eventually support multiple AI companies and teams.

Example companies:

- Game Studio
- Publishing Studio
- Media Studio
- Software Studio

Shared teams should be reused across companies unless specialization improves
quality. Specialized teams should exist where domain-specific memory and tools
matter, such as game design, level design, news research, history research,
sports research, YouTube scripting, and thumbnail packaging.

Specialized agents should be created from
`integration/templates/AGENT_SOUL_TEMPLATE.md`. The shared protocol stays
central; each agent's role, tools, memory scope, and output contract live in
that agent's `SOUL.md`.

## Next required decisions

- Decide whether to add specialized sub-roles beyond the shared core roster.
- Decide which permissions should be enforced in OpenClaw config versus Hermes
  role files before enabling unattended cron/night-shift work.
- Decide which first company/team template should be created after the base
  workflow remains stable through another cleanup smoke test.
