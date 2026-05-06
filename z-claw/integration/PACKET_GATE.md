# Packet Gate

Version: 0.2

The packet gate is a deterministic review step for planner and reporter output.
It exists because the local worker model can produce useful content while still
failing strict packet shape.

## Rule

Local planner and reporter outputs are drafts unless they pass the packet gate.

The CEO may read a failed draft for intent, but must not treat it as a valid
protocol packet.

## Packet Gate Outcomes

- `accepted`: packet shape is valid enough for routing or reporting.
- `rejected`: packet shape is invalid and must not be routed as-is.
- `normalize`: content is useful, but shape is invalid; rewrite it into the
  required packet shape before use.

## Planner Gate

Planner output is accepted only when:

- It starts with `type: RESULT_PACKET`.
- It is not wrapped in markdown fences.
- It contains at least one downstream `type: TASK_PACKET`.
- `company` is a known value.
- `team` is a known value.
- `owner_agent` is a known agent ID.
- Model names appear only under `model_budget.default_model`.
- No placeholder values like `<unique-task-id>` remain.

## Reporter Gate

Reporter output is accepted only when:

- It starts with `type: REPORT_PACKET`.
- It is not wrapped in markdown fences.
- It includes required fields:
  - `task_id`
  - `headline`
  - `completed`
  - `artifacts`
  - `unresolved`
  - `verified`
  - `unverified_worker_claims`
  - `memory_candidates`
  - `next_actions`
- List fields are lists, not booleans or prose-only scalars.
- Unrun work is not listed under `completed`.
- Missing verification is listed under `unresolved` or
  `unverified_worker_claims`.
- No placeholder values like `<unique-task-id>` remain.

## Cheapest Operating Policy

Keep planner and reporter on the local model for now.

Use them as cheap draft producers:

- Planner drafts the task breakdown.
- Reporter drafts the summary.
- CEO or a deterministic normalizer converts useful drafts into valid packets
  when strict packet shape matters.

Escalate planner/reporter to Hermes CEO/GPT-5.5 only when:

- Strict machine-readable packet shape is required for automation.
- The local model fails the same packet twice.
- The workflow is running unattended, such as night shift.

This keeps most routine planning/reporting local while preventing bad packets
from entering the orchestration layer.

## Packet Format Test 1 Result

Date: 2026-05-06

Result:

- Planner packet shape: rejected.
- Reporter packet shape: rejected.

Observed:

- Planner printed visible tool-call-shaped JSON on first run.
- Planner retry used markdown fences and malformed a field.
- Reporter printed visible tool-call-shaped JSON on first run.
- Reporter retry started correctly but used invalid placeholder/scalar fields.

Conclusion:

Prompting alone is insufficient. Packet validation must be deterministic.

## Packet Normalization

Packet normalization is implemented in:

`/home/z/Claw/integration/tools/packet_normalize.py`

Use it only after raw lint fails and only when the malformed output contains
useful draft intent.

Normalization fixes shape, not truth. A normalized packet must still pass
`packet_lint.py`, and factual claims inside it remain unverified until CEO, QA,
or tool evidence confirms them.

Detailed policy is documented in `PACKET_NORMALIZATION.md`.
