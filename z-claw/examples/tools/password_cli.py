#!/usr/bin/env python3
"""Password generator CLI.

Usage:
  python3 password_cli.py generate [LENGTH]
"""

from __future__ import annotations

import argparse
import secrets
import string
import sys

ASCII_LETTERS = string.ascii_letters
DIGITS = string.digits
ALLOWED = ASCII_LETTERS + DIGITS
DEFAULT_LENGTH = 16


def positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("length must be an integer") from exc
    if parsed <= 0:
        raise argparse.ArgumentTypeError("length must be a positive integer")
    return parsed


def generate_password(length: int) -> str:
    if length < 2:
        raise ValueError("length must be at least 2")

    chars = [
        secrets.choice(ASCII_LETTERS),
        secrets.choice(DIGITS),
    ]
    chars.extend(secrets.choice(ALLOWED) for _ in range(length - 2))
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a random password.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate a password")
    generate_parser.add_argument(
        "length",
        nargs="?",
        default=DEFAULT_LENGTH,
        type=positive_int,
        help=f"Password length (default: {DEFAULT_LENGTH})",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "generate":
        try:
            password = generate_password(args.length)
        except ValueError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        print(password)
        return 0

    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
