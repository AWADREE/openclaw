#!/usr/bin/env python3
"""Simple persistent bookmarks CLI.

Commands:
  add "title" "url"
  list
  delete BOOKMARK_ID
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

SCRIPT_PATH = Path(__file__).resolve()
BOOKMARKS_PATH = SCRIPT_PATH.with_name("bookmarks.json")


def load_bookmarks() -> list[dict[str, str]]:
    if not BOOKMARKS_PATH.exists():
        return []

    try:
        with BOOKMARKS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Error: {BOOKMARKS_PATH} is not valid JSON: {exc}") from exc

    if not isinstance(data, list):
        raise SystemExit(f"Error: {BOOKMARKS_PATH} must contain a JSON list")

    bookmarks: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        bookmark_id = item.get("id")
        title = item.get("title")
        url = item.get("url")
        created_at = item.get("created_at", "")
        if isinstance(bookmark_id, str) and isinstance(title, str) and isinstance(url, str):
            bookmarks.append(
                {
                    "id": bookmark_id,
                    "title": title,
                    "url": url,
                    "created_at": str(created_at),
                }
            )
    return bookmarks


def save_bookmarks(bookmarks: list[dict[str, str]]) -> None:
    BOOKMARKS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with BOOKMARKS_PATH.open("w", encoding="utf-8") as f:
        json.dump(bookmarks, f, indent=2, ensure_ascii=False)
        f.write("\n")


def add_bookmark(title: str, url: str) -> int:
    bookmarks = load_bookmarks()
    bookmark = {
        "id": uuid4().hex[:8],
        "title": title,
        "url": url,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    bookmarks.append(bookmark)
    save_bookmarks(bookmarks)
    print(f"Added bookmark {bookmark['id']}: {bookmark['title']} -> {bookmark['url']}")
    return 0


def list_bookmarks() -> int:
    bookmarks = load_bookmarks()
    if not bookmarks:
        print("No bookmarks.")
        return 0

    for bookmark in bookmarks:
        print(f"{bookmark['id']}: {bookmark['title']} -> {bookmark['url']}")
    return 0


def delete_bookmark(bookmark_id: str) -> int:
    bookmarks = load_bookmarks()
    filtered = [bookmark for bookmark in bookmarks if bookmark["id"] != bookmark_id]
    if len(filtered) == len(bookmarks):
        print(f"Bookmark not found: {bookmark_id}", file=sys.stderr)
        return 1

    save_bookmarks(filtered)
    print(f"Deleted bookmark {bookmark_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Simple persistent bookmarks CLI.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help='Add a bookmark, e.g. add "title" "https://example.com"')
    add_parser.add_argument("title", help="Bookmark title")
    add_parser.add_argument("url", help="Bookmark URL")

    subparsers.add_parser("list", help="List saved bookmarks")

    delete_parser = subparsers.add_parser("delete", help="Delete a bookmark by ID")
    delete_parser.add_argument("bookmark_id", help="ID of the bookmark to delete")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "add":
        return add_bookmark(args.title, args.url)
    if args.command == "list":
        return list_bookmarks()
    if args.command == "delete":
        return delete_bookmark(args.bookmark_id)

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
