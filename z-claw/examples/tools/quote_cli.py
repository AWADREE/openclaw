#!/usr/bin/env python3
"""Simple persistent quotes CLI.

Commands:
  add "quote text" --author "author name"
  list
  random
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

SCRIPT_PATH = Path(__file__).resolve()
QUOTES_PATH = SCRIPT_PATH.with_name("quotes.json")


def load_quotes() -> list[dict[str, Any]]:
    if not QUOTES_PATH.exists():
        return []
    try:
        with QUOTES_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Error: {QUOTES_PATH} is not valid JSON: {exc}") from exc

    if not isinstance(data, list):
        raise SystemExit(f"Error: {QUOTES_PATH} must contain a JSON list")

    quotes: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        quote_id = item.get("id")
        text = item.get("text")
        author = item.get("author")
        created_at = item.get("created_at", "")
        if isinstance(quote_id, str) and isinstance(text, str) and isinstance(author, str):
            quotes.append(
                {
                    "id": quote_id,
                    "text": text,
                    "author": author,
                    "created_at": str(created_at),
                }
            )
    return quotes


def save_quotes(quotes: list[dict[str, Any]]) -> None:
    QUOTES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with QUOTES_PATH.open("w", encoding="utf-8") as f:
        json.dump(quotes, f, indent=2, ensure_ascii=False)
        f.write("\n")


def add_quote(text: str, author: str) -> int:
    quotes = load_quotes()
    quote = {
        "id": uuid4().hex[:8],
        "text": text,
        "author": author,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    quotes.append(quote)
    save_quotes(quotes)
    print(f"Added quote {quote['id']}: {quote['text']} — {quote['author']}")
    return 0


def list_quotes() -> int:
    quotes = load_quotes()
    if not quotes:
        print("No quotes.")
        return 0

    for quote in quotes:
        created_at = quote.get("created_at", "")
        suffix = f" ({created_at})" if created_at else ""
        print(f"{quote['id']}: \"{quote['text']}\" — {quote['author']}{suffix}")
    return 0


def random_quote() -> int:
    quotes = load_quotes()
    if not quotes:
        print("No quotes.")
        return 0

    quote = random.choice(quotes)
    created_at = quote.get("created_at", "")
    suffix = f" ({created_at})" if created_at else ""
    print(f"{quote['id']}: \"{quote['text']}\" — {quote['author']}{suffix}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Simple persistent quotes CLI.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help='Add a quote, e.g. add "to be" --author "Shakespeare"')
    add_parser.add_argument("text", help="Quote text")
    add_parser.add_argument("--author", required=True, help="Quote author")

    subparsers.add_parser("list", help="List saved quotes")
    subparsers.add_parser("random", help="Show a random quote")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "add":
        return add_quote(args.text, args.author)
    if args.command == "list":
        return list_quotes()
    if args.command == "random":
        return random_quote()

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
