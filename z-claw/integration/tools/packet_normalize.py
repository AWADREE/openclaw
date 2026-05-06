#!/usr/bin/env python3
"""Normalize draft worker output into Z Claw protocol packet shapes.

This tool is deterministic and intentionally conservative. It does not certify
worker claims as true; it only converts useful draft intent into a packet shape
that can then be checked by packet_lint.py. Verification still belongs to CEO,
QA, or explicit tool evidence.
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


def clean_text(text: str) -> str:
    text = re.sub(r"```(?:yaml|json|text)?", "", text, flags=re.IGNORECASE)
    text = text.replace("```", "")
    return text.strip()


def yaml_quote(value: str) -> str:
    value = value.strip()
    value = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{value}"'


def find_first(patterns: list[str], text: str, default: str) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            value = match.group(1).strip().strip("\"'` ")
            if value and not re.search(r"<[^>\n]+>", value):
                return value
    return default


def find_enum(key: str, text: str, allowed: set[str], default: str) -> str:
    value = find_first([rf"^\s*{re.escape(key)}\s*:\s*([^\n]+)"], text, default)
    value = value.strip().strip("\"'")
    return value if value in allowed else default


def find_owner(text: str, default: str = "builder") -> str:
    owner = find_enum("owner_agent", text, KNOWN_OWNERS, "")
    if owner:
        return owner
    for candidate in ("builder", "qa-tester", "reporter", "researcher", "planner"):
        if re.search(rf"\b{re.escape(candidate)}\b", text, flags=re.IGNORECASE):
            return candidate
    return default


def extract_task_id(text: str, default: str) -> str:
    value = find_first(
        [
            r"^\s*task_id\s*:\s*([^\n]+)",
            r"\btask[_ -]?id\s+([a-z0-9][a-z0-9_.-]{2,80})",
            r"\b(protocol-test-[a-z0-9_.-]+)\b",
            r"\b(packet[-_]gate[-_]test[-_]?[a-z0-9_.-]*)\b",
        ],
        text,
        default,
    )
    value = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-")
    return value[:80] or default


def extract_file_paths(text: str) -> list[str]:
    paths = re.findall(r"(?<![\w/])(?:/home/z|/tmp|\.?/[\w.-])[\w./-]*", text)
    seen: list[str] = []
    for path in paths:
        path = path.rstrip(".,;:)")
        if path not in seen:
            seen.append(path)
    return seen[:8]


def extract_quoted_line(text: str) -> str | None:
    for pattern in [
        r'line\s+["“]([^"”\n]+)["”]',
        r'exact(?:ly)?(?:\s+line)?\s*[:=]?\s*["“]([^"”\n]+)["”]',
        r'with\s+line\s+["“]([^"”\n]+)["”]',
    ]:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def list_items_from_keywords(text: str, keywords: tuple[str, ...], fallback: str) -> list[str]:
    items: list[str] = []
    for line in text.splitlines():
        stripped = line.strip().lstrip("-*0123456789. ").strip()
        if not stripped:
            continue
        if any(keyword in stripped.lower() for keyword in keywords):
            if stripped not in items:
                items.append(stripped)
    return items[:6] or [fallback]


def normalize_planner(text: str) -> str:
    text = clean_text(text)
    task_id = extract_task_id(text, "normalized-planner-task")
    company = find_enum("company", text, KNOWN_COMPANIES, "shared")
    owner = find_owner(text, "builder")
    team_by_owner = {
        "builder": "engineering",
        "qa-tester": "qa",
        "reporter": "reporting",
        "researcher": "research",
        "planner": "planning",
        "main": "other",
    }
    team = find_enum("team", text, KNOWN_TEAMS, team_by_owner.get(owner, "other"))
    objective = find_first(
        [
            r"^\s*objective\s*:\s*([^\n]+)",
            r"\bGoal\s*:\s*([^\n]+)",
            r"\bcreate\s+(.+?)(?:\.|\n|$)",
            r"\bverify\s+(.+?)(?:\.|\n|$)",
        ],
        text,
        "Normalize draft worker intent into an executable task packet",
    )
    paths = extract_file_paths(text)
    quoted_line = extract_quoted_line(text)

    inputs = ["Raw planner output was normalized by packet_normalize.py"]
    if paths:
        inputs.extend(paths)
    if quoted_line:
        inputs.append(f"required line: {quoted_line}")

    acceptance = ["Output is a valid TASK_PACKET that passes packet_lint.py"]
    if paths:
        acceptance.append(f"Artifact path mentioned: {paths[0]}")
    if quoted_line:
        acceptance.append(f"Exact required content mentioned: {quoted_line}")

    return "\n".join(
        [
            "type: RESULT_PACKET",
            f"task_id: {task_id}",
            "agent_id: planner",
            "status: completed",
            "summary: Normalized planner draft into a routable task packet.",
            "artifacts:",
            "  - normalized TASK_PACKET",
            "verification:",
            "  - packet_normalize.py converted draft shape only; task facts remain unverified",
            "assumptions:",
            f"  - downstream owner inferred as {owner}",
            "blockers:",
            "  - none",
            "risks:",
            "  - normalized packet may omit nuance from malformed draft",
            "memory_candidates:",
            "  - none",
            "next_recommended_action: run packet_lint.py on the normalized output",
            "",
            "tasks:",
            "  - type: TASK_PACKET",
            f"    task_id: {task_id}-1",
            "    requester_thread: normalized",
            f"    company: {company}",
            f"    team: {team}",
            f"    owner_agent: {owner}",
            f"    objective: {yaml_quote(objective)}",
            "    inputs:",
            *[f"      - {yaml_quote(item)}" for item in inputs],
            "    constraints:",
            "      - Treat the raw worker output as draft intent only",
            "      - Do not claim execution without independent evidence",
            "    acceptance_criteria:",
            *[f"      - {yaml_quote(item)}" for item in acceptance],
            "    allowed_tools:",
            "      - none",
            "    model_budget:",
            "      default_model: local-qwen3.5-9b",
            "      escalation_allowed: false",
            "    memory_scope: none",
            "    deliverable_format: report",
            "    escalation_triggers:",
            "      - ambiguity",
            "      - repeated failure",
        ]
    )


def normalize_reporter(text: str) -> str:
    text = clean_text(text)
    task_id = extract_task_id(text, "normalized-report")
    headline = find_first(
        [
            r"^\s*headline\s*:\s*([^\n]+)",
            r"\bFinal result\s*:\s*([^\n]+)",
            r"\bConclusion\s*:\s*([^\n]+)",
            r"\bResult\s*:\s*([^\n]+)",
        ],
        text,
        "Normalized report from malformed reporter draft",
    )
    paths = extract_file_paths(text)
    completed = list_items_from_keywords(
        text,
        ("complete", "done", "created", "wrote", "passed"),
        "Reporter draft was normalized into packet shape",
    )
    unresolved = list_items_from_keywords(
        text,
        ("not run", "not applicable", "blocked", "failed", "missing", "unresolved", "unknown"),
        "Original reporter packet shape was invalid before normalization",
    )
    verified = list_items_from_keywords(
        text,
        ("verified", "accepted", "confirmed", "pass"),
        "Only packet shape was normalized; facts require independent verification",
    )

    return "\n".join(
        [
            "type: REPORT_PACKET",
            f"task_id: {task_id}",
            f"headline: {yaml_quote(headline)}",
            "completed:",
            *[f"  - {yaml_quote(item)}" for item in completed],
            "artifacts:",
            *([f"  - {yaml_quote(path)}" for path in paths] or ["  - normalized REPORT_PACKET"]),
            "unresolved:",
            *[f"  - {yaml_quote(item)}" for item in unresolved],
            "verified:",
            *[f"  - {yaml_quote(item)}" for item in verified],
            "unverified_worker_claims:",
            "  - Raw reporter content was malformed and must not be treated as verified evidence",
            "memory_candidates:",
            "  - none",
            "next_actions:",
            "  - Run packet_lint.py on this normalized report",
            "  - CEO should verify any factual claims before final acceptance",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=["planner", "reporter"], required=True)
    parser.add_argument("path", help="Path to draft text output to normalize, or '-' for stdin")
    args = parser.parse_args()

    if args.path == "-":
        text = sys.stdin.read()
    else:
        text = Path(args.path).read_text(encoding="utf-8")

    if args.kind == "planner":
        normalized = normalize_planner(text)
    else:
        normalized = normalize_reporter(text)

    print(normalized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
