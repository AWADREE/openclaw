#!/usr/bin/env python3
"""Simple CLI notes tool.

Commands:
  add "note text"   Add a note and persist it.
  list               Show all saved notes.
  delete NOTE_ID     Remove a note by ID.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

SCRIPT_PATH = Path(__file__).resolve()
NOTES_PATH = SCRIPT_PATH.with_name("notes.json")


def load_notes() -> list[dict[str, str]]:
    if not NOTES_PATH.exists():
        return []
    try:
        with NOTES_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Error: {NOTES_PATH} is not valid JSON: {exc}") from exc

    if not isinstance(data, list):
        raise SystemExit(f"Error: {NOTES_PATH} must contain a JSON list")

    notes: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        note_id = item.get("id")
        text = item.get("text")
        created_at = item.get("created_at", "")
        if isinstance(note_id, str) and isinstance(text, str):
            notes.append({"id": note_id, "text": text, "created_at": str(created_at)})
    return notes


def save_notes(notes: list[dict[str, str]]) -> None:
    NOTES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with NOTES_PATH.open("w", encoding="utf-8") as f:
        json.dump(notes, f, indent=2, ensure_ascii=False)
        f.write("\n")


def add_note(text: str) -> int:
    notes = load_notes()
    note = {
        "id": uuid4().hex[:8],
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    notes.append(note)
    save_notes(notes)
    print(f"Added note {note['id']}: {note['text']}")
    return 0


def list_notes() -> int:
    notes = load_notes()
    if not notes:
        print("No notes.")
        return 0

    for note in notes:
        note_id = note["id"]
        text = note["text"]
        created_at = note.get("created_at", "")
        suffix = f" ({created_at})" if created_at else ""
        print(f"{note_id}: {text}{suffix}")
    return 0


def delete_note(note_id: str) -> int:
    notes = load_notes()
    filtered = [note for note in notes if note["id"] != note_id]
    if len(filtered) == len(notes):
        print(f"Note not found: {note_id}", file=sys.stderr)
        return 1

    save_notes(filtered)
    print(f"Deleted note {note_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Simple persistent notes CLI.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help='Add a note, e.g. add "buy milk"')
    add_parser.add_argument("text", help="Note text")

    subparsers.add_parser("list", help="List saved notes")

    delete_parser = subparsers.add_parser("delete", help="Delete a note by ID")
    delete_parser.add_argument("note_id", help="ID of the note to delete")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "add":
        return add_note(args.text)
    if args.command == "list":
        return list_notes()
    if args.command == "delete":
        return delete_note(args.note_id)

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
