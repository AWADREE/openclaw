# Packet Format Test

Version: 0.1

Use this test after changing planner, reporter, or protocol packet rules.

## Purpose

Verify that local planner and reporter agents produce protocol-shaped packets
without markdown fences, invented enum values, or missing `type` fields.

## Pass Criteria

Planner passes when:

- Output starts with `type: RESULT_PACKET`.
- Output contains downstream `TASK_PACKET` entries.
- No markdown fences are used.
- `company` is `shared` unless otherwise provided.
- `team` values are known.
- `owner_agent` values are known agent IDs, not model names.
- Model names appear only under `model_budget.default_model`.

Reporter passes when:

- Output starts with `type: REPORT_PACKET`.
- Required fields are present.
- No markdown fences are used.
- Verified facts and unverified worker claims are separated.
- Missing data is marked as `none`, not invented.

## Deterministic Lint

Save planner output to a file and run:

```bash
python3 /home/z/Claw/integration/tools/packet_lint.py --kind planner /path/to/planner-output.txt
```

Save reporter output to a file and run:

```bash
python3 /home/z/Claw/integration/tools/packet_lint.py --kind reporter /path/to/reporter-output.txt
```

Exit code `0` means accepted. Exit code `1` means rejected with reasons.

## CEO Prompt

Send this as a new top-level message in `#00-ceo`:

```text
Run packet format test 1.

Use OpenClaw and the Z Claw operating protocol.

Goal:
Verify planner and reporter packet-shape discipline after the role updates.

Steps:
1. Ask planner to create task packets for this fake workflow:
   builder creates /tmp/zclaw-packet-format-test.txt with line "packet format ok";
   qa-tester verifies that exact line;
   reporter summarizes the result.
2. Do not ask builder or qa-tester to execute. This is packet-format only.
3. CEO should inspect planner output for:
   - starts with type: RESULT_PACKET
   - contains TASK_PACKET entries
   - no markdown fences
   - company: shared
   - valid team values only
   - valid owner_agent values only
   - model names only under model_budget.default_model
4. Then ask reporter to create a REPORT_PACKET from this fake verified context:
   planner packet shape accepted;
   builder not run;
   qa-tester not run;
   CEO verification not applicable.
5. CEO should inspect reporter output for:
   - starts with type: REPORT_PACKET
   - includes all required fields
   - no markdown fences
   - unrun builder/QA are not reported as completed
   - missing verification is listed as unresolved or unverified

Do not use durable memory for this test.
Final reply should say accepted or rejected for planner packet shape and reporter packet shape, with caveats.
```
