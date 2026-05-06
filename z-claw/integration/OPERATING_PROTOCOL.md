# Z Claw Operating Protocol

Version: 0.1

This protocol defines how Hermes, OpenClaw, and worker agents cooperate. It is
the practical execution layer for `OPERATING_DOCTRINE.md`.

Known local model tool-use caveats are documented in
`LOCAL_MODEL_LIMITATIONS.md`.
Packet validation policy is documented in `PACKET_GATE.md`.
Packet normalization policy is documented in `PACKET_NORMALIZATION.md`.
Reusable workflow recipes are documented in `STANDARD_WORKFLOWS.md`.
Workflow audit records are documented in `RUN_LEDGER.md`.
Command safety policy is documented in `COMMAND_SAFETY.md`.

## Design Principles

1. Hermes is the cognition and durable-memory authority.
2. OpenClaw is the routing, scheduling, logging, and company/team authority.
3. Workers receive explicit task packets and return explicit result packets.
4. No worker may directly rewrite durable memory.
5. Every handoff must state context, acceptance criteria, model budget, and
   escalation triggers.
6. Discord threads are working-context boundaries. Do not mix unrelated goals in
   one thread.
7. Use local models for narrow execution. Escalate to GPT-5.5 for ambiguous,
   high-risk, architectural, or review-heavy work.
8. Do not accept visible tool-call-shaped JSON as proof that a tool executed.
9. Treat local planner and reporter packets as drafts until they pass the packet
   gate.
10. If a useful planner or reporter draft fails packet lint, normalize it with
    the deterministic packet normalizer and lint the normalized output before
    use.
11. In routed workflows, CEO owns routing/review/acceptance and must not
    silently perform builder implementation work.
12. Standard workflow evidence must be saved in the run ledger.
13. Agents must avoid approval-triggering command shapes proactively during
    unattended workflows.

These rules follow the same broad pattern used by established multi-agent
systems: a manager/supervisor delegates, workers specialize, handoffs carry only
the needed context, and final validation is centralized.

## Runtime Roles

### Hermes CEO

The CEO is a Hermes agent using `openai-codex/gpt-5.5`.

Responsibilities:

- Interpret user intent.
- Decide whether the work needs OpenClaw routing.
- Create task packets for OpenClaw workers.
- Review worker results.
- Decide what, if anything, becomes durable Hermes memory.
- Send final reports to the user through Discord.
- Escalate or ask the user when risk is too high.

The CEO may perform small tasks directly when orchestration would add more cost
than value. Once the CEO selects a routed standard workflow, however, the CEO
must not create or edit implementation artifacts assigned to builder unless the
user explicitly approves a workflow deviation.

### OpenClaw

OpenClaw is the operational control layer.

Responsibilities:

- Maintain agent roster, workspaces, sessions, and model assignments.
- Route packets to the correct worker.
- Keep raw operational logs and session records.
- Schedule future cron/night-shift work.
- Collect outputs and make them visible to the CEO.

OpenClaw records what happened. It does not decide durable truth.

### Planner

The planner converts goals into executable work.

Use for:

- Decomposing complex requests.
- Finding dependencies and order of operations.
- Defining acceptance criteria.
- Identifying risks and escalation points.

Do not use planner for implementation.

### Researcher

The researcher gathers and verifies facts.

Use for:

- Current web or documentation research.
- Comparing technical options.
- Source-backed summaries.
- Identifying uncertainty and missing evidence.

Research output is evidence, not memory.

### Builder

The builder executes implementation tasks.

Use for:

- Scoped code changes.
- Local verification.
- File-level implementation reports.

The builder must not expand scope unless the task is blocked without doing so.

### Reporter

The reporter normalizes outputs into user-facing or CEO-facing summaries.

Use for:

- Collecting multi-worker results.
- Preparing final reports.
- Separating verified conclusions from worker claims.
- Listing unresolved decisions and next actions.

Reporter output is not final until accepted by the CEO.

### QA Tester

The QA tester verifies worker outputs against acceptance criteria.

Use for:

- Checking builder artifacts.
- Running focused non-destructive verification.
- Finding missing tests and unverified claims.
- Returning pass/fail/inconclusive QA verdicts.

Do not use QA tester for implementation or final acceptance.

## Handoff Packets

All routed work should use structured packets. Plain language is allowed, but
the packet fields must be present.

## Packet Formatting Rules

Local models are prone to wrapping packets in prose or markdown. Packet-producing
agents must follow these rules:

1. Start the response with the packet object.
2. Do not wrap packets in markdown fences.
3. Do not use markdown tables.
4. Do not invent enum values.
5. Use `company: shared` unless the CEO provided a specific company.
6. Use only known `team` values: `planning`, `research`, `engineering`, `qa`,
   `reporting`, or `other`.
7. Use only known `owner_agent` values: `planner`, `researcher`, `builder`,
   `qa-tester`, `reporter`, or `main`.
8. Put model names only under `model_budget.default_model`, not in
   `owner_agent`.
9. If a field is unknown, use `unknown` or an empty list. Do not make up
   details.
10. A reporter packet must include `type: REPORT_PACKET`.

### TASK_PACKET

```yaml
type: TASK_PACKET
task_id: short-stable-id
requester_thread: discord-thread-or-session-id
company: shared | game-studio | publishing-studio | media-studio | software-studio
team: planning | research | engineering | qa | reporting | other
owner_agent: planner | researcher | builder | qa-tester | reporter | main
objective: one clear outcome
inputs:
  - relevant context only
constraints:
  - time, tools, files, style, safety, or scope limits
acceptance_criteria:
  - concrete checks that define done
allowed_tools:
  - tool or capability names, or "none"
model_budget:
  default_model: local-qwen3.5-9b | local-qwen3.5-35b-a3b | gpt-5.5
  escalation_allowed: true | false
memory_scope: none | working | propose-durable
deliverable_format: plan | evidence | patch | report | answer
escalation_triggers:
  - ambiguity
  - low confidence
  - security/privacy risk
  - destructive action
  - repeated failure
  - architecture decision
```

### RESULT_PACKET

```yaml
type: RESULT_PACKET
task_id: short-stable-id
agent_id: planner | researcher | builder | qa-tester | reporter | main
status: completed | blocked | partial | failed
summary: concise result
artifacts:
  - files, links, run IDs, or messages produced
verification:
  - commands run, checks performed, sources reviewed, or "not run"
assumptions:
  - assumptions made during work
blockers:
  - unresolved blockers, or "none"
risks:
  - remaining risks, or "none"
memory_candidates:
  - facts or lessons proposed for Hermes review, or "none"
next_recommended_action: one next step
```

### EVIDENCE_PACKET

```yaml
type: EVIDENCE_PACKET
task_id: short-stable-id
query: researched question
sources:
  - title: source title
    url: source URL
    date_checked: YYYY-MM-DD
claims:
  - verified claim with source reference
inferences:
  - clearly marked reasoning based on sources
confidence: high | medium | low
gaps:
  - missing or uncertain information
recommendation: concrete recommendation
```

### BUILD_PACKET

```yaml
type: BUILD_PACKET
task_id: short-stable-id
changed_files:
  - absolute or workspace-relative path
commands_run:
  - command and result
tests:
  - test/check name and result
result: what changed
rollback_notes: how to undo or "normal git revert"
risks:
  - remaining risks
```

### REPORT_PACKET

```yaml
type: REPORT_PACKET
task_id: short-stable-id
headline: one-line outcome
completed:
  - completed work
artifacts:
  - files, run IDs, links, screenshots, or logs
unresolved:
  - open blockers or decisions
verified:
  - facts confirmed by review
unverified_worker_claims:
  - claims not independently checked
memory_candidates:
  - proposed durable-memory updates
next_actions:
  - recommended next steps
```

## Task State Machine

Every task should move through these states:

1. `proposed`
2. `assigned`
3. `in_progress`
4. `blocked` or `submitted`
5. `reviewed`
6. `accepted` or `rejected`
7. `archived`

Only the CEO may mark user-facing work as accepted.

## Memory Protocol

Memory has three classes:

- Raw logs: OpenClaw sessions, Discord messages, reports, and file logs.
- Working memory: current thread context and active task state.
- Durable memory: curated Hermes memory accepted after review.

Rules:

1. Workers may propose `memory_candidates`.
2. Reporter may collect and normalize memory candidates.
3. CEO reviews candidates against doctrine, raw logs, and user intent.
4. Only accepted candidates become durable Hermes memory.
5. If a compacted summary conflicts with a reviewed file, trust the reviewed
   file or ask the user.

## Model Routing

Default routing:

- CEO planning/review: `openai-codex/gpt-5.5`
- Planner: OpenClaw `hermes-workers/planner` -> Hermes profile `zplanner` ->
  local Ollama `qwen3.5:9b`
- Researcher: OpenClaw `hermes-workers/researcher` -> Hermes profile
  `zresearcher` -> local Ollama `qwen3.5:9b`
- Builder: OpenClaw `hermes-workers/builder` -> Hermes profile `zbuilder` ->
  `openai-codex/gpt-5.4-mini`
- QA Tester: OpenClaw `hermes-workers/qa-tester` -> Hermes profile `zqa` ->
  `openai-codex/gpt-5.4-mini`
- Reporter: OpenClaw `hermes-workers/reporter` -> Hermes profile `zreporter`
  -> local Ollama `qwen3.5:9b`

Escalate to GPT-5.5 when:

- The task requires architecture-level judgment.
- Requirements are ambiguous and mistakes would be expensive.
- Security, privacy, destructive commands, public posting, or payments are
  involved.
- Local worker confidence is low.
- A worker fails the same task twice.
- The final answer must synthesize several worker outputs.
- The task needs long-context reasoning beyond local model capacity.

Do not escalate just because the task is large. First narrow the task.

## Tool and Workspace Rules

- Workers stay inside their assigned OpenClaw workspace unless the task packet
  grants access elsewhere.
- Builder owns only the files listed in the task packet or files discovered as
  necessary for that change.
- For routed software workflows, builder owns implementation writes. CEO may
  inspect, route, lint, normalize, and verify, but must not create or edit the
  requested implementation artifacts.
- CEO may write protocol artifacts, prompts, lint outputs, raw worker outputs,
  normalized packets, reports, and verification notes.
- If CEO edits requested implementation artifacts during a routed workflow, it
  must be reported as a workflow deviation and cannot be attributed to builder.
- Researcher must cite sources for current facts.
- Planner should not run implementation commands.
- QA tester should verify artifacts but not fix them.
- Reporter should not invent missing results.
- External side effects require CEO or user approval.
- If a local worker prints raw tool-call JSON instead of executing the tool,
  treat the task as not completed and follow `LOCAL_MODEL_LIMITATIONS.md`.
- Never pipe command output into an interpreter (`python`, `python3`, `node`,
  `bash`, `sh`, `ruby`, `perl`, etc.). Use file separation instead.
- If a command would require approval and a safe equivalent exists, use the safe
  equivalent automatically.
- If no safe equivalent exists, record a blocker instead of waiting indefinitely
  for user approval.

## Verification Rules

Worker self-report is not enough for file, code, or tool-use tasks.

CEO acceptance requires at least one verification signal:

- CEO independently read or checked the artifact.
- QA tester returned evidence-backed verification.
- A test/check command produced relevant output.
- OpenClaw session evidence shows the tool actually executed.

Visible JSON such as `{"name":"read_file","arguments":{...}}` is not evidence
of execution. It is suspect local-model output unless paired with real tool
results.

## Packet Gate Rules

Planner and reporter outputs must pass `PACKET_GATE.md` before they are treated
as protocol packets.

If a packet fails the gate:

1. Reject it as a protocol packet.
2. Use it only as draft intent if the content is useful.
3. Normalize it into a valid packet with `packet_normalize.py`.
4. Run `packet_lint.py` on the normalized packet.
5. Accept the normalized packet only if lint passes.
6. Treat factual claims inside normalized packets as unverified until CEO, QA,
   or tool evidence confirms them.
7. Escalate to Hermes CEO/GPT-5.5 only when strict packet shape is required and
   the local model fails twice.

## Discord Context Rules

- `#00-ceo` is for starting or continuing CEO-level goals.
- A new top-level message in `#00-ceo` should create one thread for that goal.
- Keep unrelated goals in separate threads.
- `#07-reports` is for scheduled reports, night-shift summaries, and
  cross-platform delivery.
- If a thread needs worker execution, CEO routes through OpenClaw and includes
  the thread ID in the task packet.

## Minimum End-to-End Workflow

For a normal non-trivial task:

1. User starts a thread in `#00-ceo`.
2. CEO decides whether to answer directly or route through OpenClaw.
3. For a standard workflow, CEO creates a run ledger directory.
4. CEO sends `TASK_PACKET` to planner when decomposition is needed.
5. CEO sends scoped `TASK_PACKET`s to researcher and/or builder.
6. CEO sends builder outputs to QA tester when verification is needed.
7. Workers return packets through OpenClaw.
8. Reporter creates a `REPORT_PACKET` if multiple outputs exist.
9. CEO records raw outputs, lint results, normalized packets, verification
   notes, final report, and manifest decisions in the run ledger.
10. CEO reviews, accepts or rejects, updates durable memory if needed, and sends
    final response.

For small scoped software changes, the CEO should automatically select the
reusable `software_change_small` workflow from `STANDARD_WORKFLOWS.md`. The user
should not need to paste protocol steps or run a local prompt generator.

## Current Verified Capability

The current installation has verified:

- Discord CEO thread isolation.
- Hermes CEO can use OpenClaw MCP tools.
- OpenClaw routes all configured agents to Hermes worker profiles through the
  local adapter.
- Hermes worker session resume and cross-agent isolation have been tested.
- `software_change_small` auto-selection works from normal Discord requests.
- Builder ownership rule works: CEO routes and verifies; builder owns
  implementation writes.
- Planner/reporter packet lint and normalization gates work.
- Run ledger records workflow evidence under `/home/z/Claw/workspace/runs`.
- Command safety policy avoids approval-triggering command shapes where a safe
  substitute exists.
