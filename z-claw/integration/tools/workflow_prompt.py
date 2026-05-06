#!/usr/bin/env python3
"""Generate reusable Z Claw workflow prompts.

This optional helper does not execute OpenClaw. It prints an explicit workflow
instruction for testing or reproducibility. Normal Discord use should rely on
automatic workflow selection instead.
"""

from __future__ import annotations

import argparse
import sys


def bullet_list(items: list[str], fallback: str) -> str:
    if not items:
        items = [fallback]
    return "\n".join(f"- {item}" for item in items)


def software_change_small(args: argparse.Namespace) -> str:
    requirements = bullet_list(args.requirement, "No extra requirements supplied")
    targets = bullet_list(args.target, "Target files to be discovered by builder")
    qa_checks = bullet_list(args.qa_check, "QA defines focused checks from requirements")

    return f"""Run standard workflow: software_change_small.

Use OpenClaw and the Z Claw operating protocol.

Task ID:
{args.task_id}

Objective:
{args.objective}

Target files or directories:
{targets}

Requirements:
{requirements}

QA checks:
{qa_checks}

Protocol:
1. Ask planner for task packets.
2. Save raw planner output to a file named with task_id.
3. Run packet_lint.py on the raw planner output.
4. If raw planner lint fails but the draft is useful, run packet_normalize.py and lint the normalized output.
5. Route only an accepted raw or normalized builder task to builder.
6. Builder implements the scoped change.
7. Route QA task to qa-tester.
8. QA verifies the artifact against the QA checks and requirements.
9. Ask reporter for REPORT_PACKET.
10. Save raw reporter output.
11. Run packet_lint.py on raw reporter output.
12. If raw reporter lint fails but the draft is useful, run packet_normalize.py and lint the normalized output.
13. CEO independently verifies the artifact and final behavior.

Rules:
- Do not use durable memory unless explicitly instructed.
- Treat malformed raw packets as draft intent only.
- Accept only packets that pass packet_lint.py, raw or normalized.
- Do not treat worker self-report as proof of file writes or command execution.
- Do not use destructive commands.

Final reply should include:
- planner raw/normalized lint result
- builder changed files
- QA verdict and evidence
- reporter raw/normalized lint result
- CEO independent verification
- CEO final accept/reject decision
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Z Claw standard workflow prompts.")
    subparsers = parser.add_subparsers(dest="workflow", required=True)

    small = subparsers.add_parser("software_change_small")
    small.add_argument("--task-id", required=True)
    small.add_argument("--objective", required=True)
    small.add_argument("--target", action="append", default=[])
    small.add_argument("--requirement", action="append", default=[])
    small.add_argument("--qa-check", action="append", default=[])
    small.set_defaults(func=software_change_small)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    sys.stdout.write(args.func(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
