# Operating Doctrine

## Prime Directive

This system exists to run a long-lived multi-agent AI organization without
memory drift. The main failure mode to prevent is degradation over time:

context grows -> summaries compact details -> details are lost or distorted ->
future agents act on bad memory -> errors compound -> the organization drifts.

Hermes is used primarily to prevent that failure mode.

## Layer Ownership

Hermes owns cognition.

- Main CEO agent identity and judgment
- Durable memory
- Self-improvement and skill evolution
- Review of worker outputs
- Final decisions and reports to the user

OpenClaw owns organization.

- Companies
- Teams
- Role routing
- Task assignment
- Message routing
- Schedules and night shifts
- Operational logs and report collection

Ollama/local models own routine execution.

- Narrow worker tasks
- Drafts, code edits, first-pass research summaries, test runs
- Domain-specific work where a specialized prompt is enough

Codex/GPT-5.5 owns high-stakes cognition.

- CEO planning and review
- Complex architecture decisions
- Difficult debugging
- Final quality checks
- Escalations from local workers

## Memory Classes

Raw logs are operational records.

- Stored by OpenClaw, task files, transcripts, or daily logs.
- Useful for audit and retrieval.
- Not trusted as durable truth by default.

Working memory is temporary context.

- Session history, active task context, intermediate summaries.
- Can be compacted or discarded.
- Must not become long-term truth automatically.

Durable memory is curated Hermes memory.

- Accepted user preferences
- Stable company/team structure
- Long-term goals
- Final decisions
- Lessons learned after review
- Corrected mistakes and verified facts

Only Hermes should decide what becomes durable memory.

## Anti-Drift Rules

1. Do not let worker outputs directly rewrite durable memory.
2. Treat compacted summaries as lossy working context, not final truth.
3. When a worker proposes a lesson, route it through review before storing it.
4. Keep raw logs available for audit, but curate before remembering.
5. Prefer explicit files for stable architecture decisions over chat-only memory.
6. When facts conflict, prefer the latest reviewed doctrine or ask the user.

## Target Organization Model

The future system should support companies and teams.

Example companies:

- Game Studio
- Publishing Studio
- Media Studio
- Software Studio

Shared teams:

- General Research
- Engineering
- QA / Testing
- Writing
- Editing
- Planning
- Reporting

Specialized teams:

- News Research
- History Research
- Sports Research
- Game Design
- Level Design
- Narrative Design
- YouTube Scriptwriting
- Thumbnail / Packaging

Use shared teams by default. Create specialized teams when domain-specific
memory, tools, evaluation criteria, or vocabulary will materially improve
quality.

## Communication Model

The user talks to the Main Hermes CEO agent.

The Main Hermes CEO agent uses OpenClaw as an orchestration tool through MCP.

OpenClaw routes work to teams, records operations, schedules recurring work,
and collects outputs.

Hermes reviews outputs, updates durable memory when justified, and sends final
reports to the user.

Discord is the current user-facing channel.

- `#00-ceo` is the CEO control channel.
- New CEO tasks should start as top-level messages in `#00-ceo`; Hermes
  auto-creates a thread for each task.
- Each Discord thread is treated as a separate Hermes working context.
- `#07-reports` is the home/report channel for cron jobs, night-shift output,
  and cross-platform messages.

Telegram can be added later if a simpler notification-only channel is useful.

## Operating Protocol

Use `OPERATING_PROTOCOL.md` for the concrete execution contract.

The protocol defines:

- Agent responsibilities.
- Task and result packet formats.
- Memory candidate review rules.
- Model escalation rules.
- Discord context boundaries.
- The task state machine.

Doctrine explains why the system works this way. The protocol explains how work
must move between agents.

Use `AGENT_ROLE_SYSTEM.md` and `ROLE_TAXONOMY.md` when creating new specialized
agents. Shared protocol belongs in integration docs; role-specific behavior
belongs in each agent's `SOUL.md`.

## Near-Term Scope

Do not build the full company/team graph yet.

First establish the base architecture:

1. Hermes CEO reachable by Discord.
2. Hermes CEO can use OpenClaw MCP.
3. OpenClaw gateway stays healthy.
4. Local Ollama worker model works.
5. Codex/GPT-5.5 auth works for CEO-level escalation.
6. A small end-to-end task proves the loop.

Current verified loop:

- Hermes CEO can use OpenClaw MCP from Discord.
- OpenClaw can route a task to the planner worker.
- Planner returned the expected result through OpenClaw.
