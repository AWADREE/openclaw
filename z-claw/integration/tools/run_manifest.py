#!/usr/bin/env python3
"""Create and update Z Claw workflow run manifests."""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RUNS_ROOT = Path(os.environ.get("Z_CLAW_RUNS_ROOT", "/home/z/Claw/workspace/runs"))
ALLOWED_STATUSES = {
    "created",
    "planning",
    "building",
    "qa",
    "reporting",
    "verified",
    "accepted",
    "rejected",
    "blocked",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_.-]+", "-", value)
    value = value.strip("-")
    return value[:80] or "task"


def read_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    manifest["updated_at"] = now_iso()
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def create(args: argparse.Namespace) -> int:
    task_id = slugify(args.task_id)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = f"{stamp}-{task_id}"
    run_dir = RUNS_ROOT / args.workflow / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    created_at = now_iso()
    manifest = {
        "run_id": run_id,
        "workflow": args.workflow,
        "task_id": task_id,
        "objective": args.objective,
        "status": "created",
        "created_at": created_at,
        "updated_at": created_at,
        "agents": [],
        "artifacts": [],
        "decisions": [],
        "workflow_deviations": [],
        "durable_memory_used": False,
    }
    write_manifest(run_dir / "manifest.json", manifest)
    print(str(run_dir))
    return 0


def set_status(args: argparse.Namespace) -> int:
    if args.status not in ALLOWED_STATUSES:
        raise SystemExit(f"invalid status: {args.status}")
    manifest_path = Path(args.run_dir) / "manifest.json"
    manifest = read_manifest(manifest_path)
    manifest["status"] = args.status
    write_manifest(manifest_path, manifest)
    print(json.dumps({"run_dir": args.run_dir, "status": args.status}, indent=2))
    return 0


def add_item(args: argparse.Namespace, key: str, value: dict[str, Any]) -> int:
    manifest_path = Path(args.run_dir) / "manifest.json"
    manifest = read_manifest(manifest_path)
    manifest.setdefault(key, []).append(value)
    write_manifest(manifest_path, manifest)
    print(json.dumps({"run_dir": args.run_dir, "added": key, "value": value}, indent=2))
    return 0


def add_artifact(args: argparse.Namespace) -> int:
    value = {"path": args.path, "kind": args.kind}
    if args.agent:
        value["agent"] = args.agent
    if args.note:
        value["note"] = args.note
    return add_item(args, "artifacts", value)


def add_agent(args: argparse.Namespace) -> int:
    value = {"agent": args.agent, "role": args.role}
    if args.model:
        value["model"] = args.model
    if args.note:
        value["note"] = args.note
    return add_item(args, "agents", value)


def add_decision(args: argparse.Namespace) -> int:
    value = {"decision": args.decision}
    if args.reason:
        value["reason"] = args.reason
    return add_item(args, "decisions", value)


def add_deviation(args: argparse.Namespace) -> int:
    value = {"deviation": args.deviation}
    if args.reason:
        value["reason"] = args.reason
    return add_item(args, "workflow_deviations", value)


def show(args: argparse.Namespace) -> int:
    manifest_path = Path(args.run_dir) / "manifest.json"
    print(json.dumps(read_manifest(manifest_path), indent=2, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage Z Claw workflow run manifests.")
    sub = parser.add_subparsers(dest="command", required=True)

    create_p = sub.add_parser("create")
    create_p.add_argument("--workflow", default="software_change_small")
    create_p.add_argument("--task-id", required=True)
    create_p.add_argument("--objective", required=True)
    create_p.set_defaults(func=create)

    status_p = sub.add_parser("status")
    status_p.add_argument("run_dir")
    status_p.add_argument("status", choices=sorted(ALLOWED_STATUSES))
    status_p.set_defaults(func=set_status)

    artifact_p = sub.add_parser("artifact")
    artifact_p.add_argument("run_dir")
    artifact_p.add_argument("--path", required=True)
    artifact_p.add_argument("--kind", required=True)
    artifact_p.add_argument("--agent")
    artifact_p.add_argument("--note")
    artifact_p.set_defaults(func=add_artifact)

    agent_p = sub.add_parser("agent")
    agent_p.add_argument("run_dir")
    agent_p.add_argument("--agent", required=True)
    agent_p.add_argument("--role", required=True)
    agent_p.add_argument("--model")
    agent_p.add_argument("--note")
    agent_p.set_defaults(func=add_agent)

    decision_p = sub.add_parser("decision")
    decision_p.add_argument("run_dir")
    decision_p.add_argument("--decision", required=True)
    decision_p.add_argument("--reason")
    decision_p.set_defaults(func=add_decision)

    deviation_p = sub.add_parser("deviation")
    deviation_p.add_argument("run_dir")
    deviation_p.add_argument("--deviation", required=True)
    deviation_p.add_argument("--reason")
    deviation_p.set_defaults(func=add_deviation)

    show_p = sub.add_parser("show")
    show_p.add_argument("run_dir")
    show_p.set_defaults(func=show)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
