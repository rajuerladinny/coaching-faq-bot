"""Operator commands. Centres are created here, not through the web app.

    python -m app.manage create-centre "Bright Academy" owner@example.com
    python -m app.manage set-owner 1 owner@example.com
    python -m app.manage list

Each command that sets a password asks for it without showing it on screen.
"""
import argparse
import getpass
import os
import sqlite3
import sys

from .auth import hash_password
from .store import Store

MIN_PASSWORD_LENGTH = 8


def create_centre(store: Store, name: str, email: str, password: str) -> int:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password needs at least {MIN_PASSWORD_LENGTH} characters")
    if "@" not in email:
        raise ValueError("Enter a valid email address")
    try:
        return store.create_centre(name.strip(), email, hash_password(password))
    except sqlite3.IntegrityError:
        raise ValueError(f"{email} already owns a centre") from None


def set_owner(store: Store, centre_id: int, email: str, password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password needs at least {MIN_PASSWORD_LENGTH} characters")
    if store.get_centre(centre_id) is None:
        raise ValueError(f"No centre with id {centre_id}")
    try:
        store.set_owner(centre_id, email, hash_password(password))
    except sqlite3.IntegrityError:
        raise ValueError(f"{email} already owns another centre") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.manage")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-centre", help="add a centre and its owner login")
    create.add_argument("name")
    create.add_argument("email")
    owner = sub.add_parser("set-owner", help="set or reset a centre's login")
    owner.add_argument("centre_id", type=int)
    owner.add_argument("email")
    sub.add_parser("list", help="show all centres")
    args = parser.parse_args(argv)

    store = Store(os.environ.get("DB_PATH", "faqbot.db"))
    try:
        if args.command == "create-centre":
            centre_id = create_centre(
                store, args.name, args.email, getpass.getpass("Owner password: ")
            )
            print(f"Created centre {centre_id}. Chat link path: #/chat/{centre_id}")
        elif args.command == "set-owner":
            set_owner(
                store, args.centre_id, args.email, getpass.getpass("New password: ")
            )
            print("Login updated.")
        else:
            for c in store.list_centres():
                print(f"{c['id']}\t{c['name']}\t{c['owner_email'] or '(no login)'}")
    except ValueError as err:
        print(f"Error: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
