#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
TASKS_FILE = BASE_DIR / "tasks.json"


@dataclass
class Task:
    id: int
    text: str
    done: bool = False


def load_tasks() -> list[Task]:
    if not TASKS_FILE.exists():
        return []
    try:
        raw = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    tasks: list[Task] = []
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, dict) and "id" in item and "text" in item:
            tasks.append(Task(int(item["id"]), str(item["text"]), bool(item.get("done", False))))
    return tasks


def save_tasks(tasks: list[Task]) -> None:
    TASKS_FILE.write_text(
        json.dumps([asdict(task) for task in tasks], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def next_id(tasks: list[Task]) -> int:
    return max((task.id for task in tasks), default=0) + 1


def cmd_add(args: argparse.Namespace) -> int:
    tasks = load_tasks()
    task = Task(id=next_id(tasks), text=args.text)
    tasks.append(task)
    save_tasks(tasks)
    print(f"Added {task.id}: {task.text}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    tasks = load_tasks()
    for task in tasks:
        status = "done" if task.done else "open"
        print(f"{task.id} [{status}] {task.text}")
    return 0


def cmd_done(args: argparse.Namespace) -> int:
    tasks = load_tasks()
    try:
        target = int(args.task_id)
    except ValueError:
        print("TASK_ID must be numeric", flush=True)
        return 1
    for task in tasks:
        if task.id == target:
            task.done = True
            save_tasks(tasks)
            print(f"Done {task.id}")
            return 0
    print(f"Task {target} not found")
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="todo_cli.py", description="Tiny todo CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    add_p = sub.add_parser("add", help="add a task")
    add_p.add_argument("text")
    add_p.set_defaults(func=cmd_add)

    list_p = sub.add_parser("list", help="list tasks")
    list_p.set_defaults(func=cmd_list)

    done_p = sub.add_parser("done", help="mark a task done")
    done_p.add_argument("task_id")
    done_p.set_defaults(func=cmd_done)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
