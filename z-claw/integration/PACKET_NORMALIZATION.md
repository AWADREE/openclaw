# Packet Normalization

Version: 0.1

Packet normalization is the deterministic bridge between cheap draft-producing
workers and strict protocol automation.

## Rule

Malformed planner or reporter output may be normalized, but it is not accepted
as truth.

Normalization only fixes packet shape. It does not verify claims, file writes,
tool execution, test results, or memory candidates.

## Flow

1. Save raw worker output.
2. Run `packet_lint.py`.
3. If lint passes, accept the packet shape.
4. If lint fails but the draft contains useful intent, run `packet_normalize.py`.
5. Run `packet_lint.py` again on the normalized output.
6. Accept only the normalized packet if the second lint passes.
7. Treat factual claims inside the normalized packet as unverified until CEO,
   QA, or tool evidence confirms them.

## Commands

Planner:

```bash
python3 /home/z/Claw/integration/tools/packet_normalize.py --kind planner /tmp/raw-planner.txt > /tmp/normalized-planner.txt
python3 /home/z/Claw/integration/tools/packet_lint.py --kind planner /tmp/normalized-planner.txt
```

Reporter:

```bash
python3 /home/z/Claw/integration/tools/packet_normalize.py --kind reporter /tmp/raw-reporter.txt > /tmp/normalized-reporter.txt
python3 /home/z/Claw/integration/tools/packet_lint.py --kind reporter /tmp/normalized-reporter.txt
```

## Acceptance

An output can be routed or reported as a protocol packet only when:

- raw lint passes, or
- raw lint fails, normalization succeeds, and normalized lint passes.

If both raw and normalized lint fail, reject the output and reroute or escalate.
