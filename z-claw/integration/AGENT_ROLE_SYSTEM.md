# Agent Role System

Version: 0.1

This document defines how to create specialized agents for the Z Claw
Hermes/OpenClaw system.

## Research Takeaways

Mature multi-agent frameworks converge on the same pattern:

- Keep shared orchestration rules separate from agent identity.
- Give each agent a narrow role, goal, tool set, and expected output.
- Use a manager/supervisor to delegate and validate work.
- Keep tasks explicit and scoped.
- Prefer handoff payloads over shared giant context.
- Treat memory as a controlled capability, not a chat transcript dump.

For this installation:

- `OPERATING_DOCTRINE.md` defines why the system exists.
- `OPERATING_PROTOCOL.md` defines how agents hand work to each other.
- Each agent's `SOUL.md` defines who that agent is and what it is allowed to do.

## Role File Anatomy

Every specialized agent should have a `SOUL.md` with these sections:

1. `Identity`
2. `Mission`
3. `Default Model`
4. `Best Used For`
5. `Do Not Use For`
6. `Inputs Expected`
7. `Outputs Required`
8. `Tools and Workspace`
9. `Memory Rules`
10. `Escalation Triggers`
11. `Style`

This keeps agents specialized without losing the common protocol.

## Specialization Rules

Create a new specialized agent when at least one condition is true:

- The role needs domain-specific memory.
- The role needs domain-specific tools.
- The role has a distinct quality bar or evaluation method.
- The role would use a different model budget.
- The role appears repeatedly in workflows.
- The role's prompt would otherwise make a general agent too broad.

Do not create a specialized agent for a one-off task. Use planner, researcher,
builder, or reporter first.

## Role Granularity

Use this progression:

1. Generic worker: `researcher`, `builder`, `reporter`, `planner`.
2. Team specialist: `news-researcher`, `qa-tester`, `gameplay-programmer`.
3. Company specialist: `game-studio-level-designer`,
   `publishing-line-editor`, `media-thumbnail-analyst`.
4. Project specialist: only when a long-running project needs persistent
   project-specific memory.

Start broad, then split roles when repetition proves the specialization is
useful.

## Agent Naming

Separate routing IDs from human display names.

Use lowercase kebab-case for stable routing IDs:

- `news-researcher`
- `history-researcher`
- `qa-regression-tester`
- `gameplay-programmer`
- `novel-outline-editor`

Avoid names that encode a temporary task, such as `fix-login-bug-agent`.

Use normal human names for visible/persona identity:

- Good: `Owen Carter` with routing ID `builder` and role `Software Coder`.
- Good: `Maya Bennett` with routing ID `qa-tester` and role `QA Analyst`.
- Bad: `Builder` as the agent's name.
- Bad: `QA Tester` as the agent's name.

The role explains the job. The name identifies the durable persona. The routing
ID is the machine contract used by OpenClaw packets and tools.

## Role Contract

Each agent must know:

- What work it owns.
- What work it must refuse or escalate.
- What packet format it returns.
- Whether it may use tools.
- Whether it may propose memory.
- Whether it may delegate.

Default rule: workers do not delegate. The Hermes CEO delegates through
OpenClaw.

## Model Budget Policy

Default local worker model:

- Hermes profile using local Ollama `qwen3.5:9b`

Default CEO/review model:

- `openai-codex/gpt-5.5`

Specialized workers should remain on the local model unless their role
repeatedly fails or requires higher-level judgment. Escalation should be a
task-level decision, not a permanent upgrade by default.

## Memory Policy

Each specialized Hermes-backed agent may eventually have its own durable memory,
but memory writes must still follow this hierarchy:

1. Worker records task-local notes.
2. Worker proposes `memory_candidates`.
3. Reporter can collect candidates.
4. CEO reviews candidates.
5. Hermes durable memory is updated only after acceptance.

Specialized agents may keep role-specific memory once the CEO authorizes it.
Examples:

- `history-researcher`: preferred source lists and chronology rules.
- `qa-regression-tester`: recurring project failure modes.
- `gameplay-programmer`: engine conventions.
- `publishing-line-editor`: style sheet and author preferences.

## Creation Checklist

Preferred path: create agents from the OpenClaw dashboard Agents page using
`Create Z-Claw Agent`. That flow is the authoritative hybrid creation path. It
provisions:

- an OpenClaw agent route using `hermes-workers/<agent-id>`;
- a Z-Claw source role directory under `z-claw/agents/<agent-id>`;
- a runtime workspace under `/home/z/Claw/agents/<agent-id>`;
- a dedicated Hermes profile under the configured Hermes home;
- a registry entry in `zclaw_organization.json`; and
- baseline `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`, and
  `HEARTBEAT.md` files.

Do not use native OpenClaw-only agent creation for durable Z-Claw workers unless
the agent is intentionally not Hermes-backed.

Before adding a new agent:

1. Identify the company or shared team.
2. Define the role's recurring job.
3. Choose default model and escalation conditions.
4. Decide whether the role needs tools.
5. Decide whether the role needs durable memory.
6. Write `SOUL.md` from the template.
7. Add the agent to OpenClaw config only after the role file is clear.
8. Run one tiny test task.
9. Keep or revise the agent based on output quality.

## Quality Rules

Specialized agents should be narrower, not wordier.

A good role file creates predictable behavior:

- The agent knows what to ignore.
- The agent returns the same shape of output every time.
- The agent asks for escalation when appropriate.
- The CEO can compare outputs across agents.

A bad role file makes the agent sound impressive but does not define what it
must produce.
