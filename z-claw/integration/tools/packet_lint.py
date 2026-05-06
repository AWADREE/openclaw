#!/usr/bin/env python3
"""Lightweight packet-shape linter for Z Claw protocol packets.

This is intentionally conservative and dependency-free. It does not fully parse
YAML; it catches the failure modes we have already observed from local workers.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


KNOWN_COMPANIES = {
    "shared",
    "game-studio",
    "publishing-studio",
    "media-studio",
    "software-studio",
}

KNOWN_TEAMS = {
    "planning",
    "research",
    "engineering",
    "qa",
    "reporting",
    "other",
}

KNOWN_OWNERS = {
    "planner",
    "researcher",
    "builder",
    "qa-tester",
    "reporter",
    "main",
}

REPORT_REQUIRED = [
    "task_id",
    "headline",
    "completed",
    "artifacts",
    "unresolved",
    "verified",
    "unverified_worker_claims",
    "memory_candidates",
    "next_actions",
]


def first_content_line(text: str) -> str:
    for line in text.splitlines():
        if line.strip():
            return line.strip()
    return ""


def values_for_key(text: str, key: str) -> list[str]:
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*:\s*(.+?)\s*$", re.MULTILINE)
    return [m.group(1).strip().strip("\"'") for m in pattern.finditer(text)]


def has_markdown_fence(text: str) -> bool:
    return "```" in text


def has_tool_call_json(text: str) -> bool:
    return bool(re.search(r'"\s*name\s*"\s*:\s*"', text)) and bool(
        re.search(r'"\s*arguments\s*"\s*:', text)
    )


def has_placeholder(text: str) -> bool:
    return bool(re.search(r"<[^>\n]+>", text))


def lint_planner(text: str) -> list[str]:
    errors: list[str] = []

    if first_content_line(text) != "type: RESULT_PACKET":
        errors.append("planner output must start with 'type: RESULT_PACKET'")
    if has_markdown_fence(text):
        errors.append("packet must not use markdown fences")
    if has_tool_call_json(text):
        errors.append("visible tool-call JSON is not a packet")
    if has_placeholder(text):
        errors.append("packet contains placeholder values")
    if "type: TASK_PACKET" not in text:
        errors.append("planner output must include at least one TASK_PACKET")

    for value in values_for_key(text, "company"):
        if value not in KNOWN_COMPANIES:
            errors.append(f"unknown company value: {value}")
    for value in values_for_key(text, "team"):
        if value not in KNOWN_TEAMS:
            errors.append(f"unknown team value: {value}")
    for value in values_for_key(text, "owner_agent"):
        if value not in KNOWN_OWNERS:
            errors.append(f"unknown owner_agent value: {value}")
        if "/" in value or value.startswith("gpt-") or value.startswith("ollama"):
            errors.append(f"owner_agent must not be a model name: {value}")

    return errors


def lint_reporter(text: str) -> list[str]:
    errors: list[str] = []

    if first_content_line(text) != "type: REPORT_PACKET":
        errors.append("reporter output must start with 'type: REPORT_PACKET'")
    if has_markdown_fence(text):
        errors.append("packet must not use markdown fences")
    if has_tool_call_json(text):
        errors.append("visible tool-call JSON is not a packet")
    if has_placeholder(text):
        errors.append("packet contains placeholder values")

    for field in REPORT_REQUIRED:
        if not re.search(rf"^\s*{re.escape(field)}\s*:", text, re.MULTILINE):
            errors.append(f"missing required field: {field}")

    boolean_list_fields = ("completed", "artifacts", "unresolved", "verified")
    for field in boolean_list_fields:
        for value in values_for_key(text, field):
            if value.lower() in {"true", "false"}:
                errors.append(f"{field} must be a list, not boolean")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=["planner", "reporter"], required=True)
    parser.add_argument("path", help="Path to text output to lint, or '-' for stdin")
    args = parser.parse_args()

    if args.path == "-":
        text = sys.stdin.read()
    else:
        text = Path(args.path).read_text(encoding="utf-8")

    errors = lint_planner(text) if args.kind == "planner" else lint_reporter(text)
    result = {
        "kind": args.kind,
        "accepted": not errors,
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
