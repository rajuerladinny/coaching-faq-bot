"""SQLite storage for centres, content chunks, messages and leads."""
import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS centres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    answered INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str = "faqbot.db"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Add columns introduced after the first version."""
        cols = {r["name"] for r in self.db.execute("PRAGMA table_info(centres)")}
        if "owner_email" not in cols:
            self.db.execute("ALTER TABLE centres ADD COLUMN owner_email TEXT")
        if "password_hash" not in cols:
            self.db.execute("ALTER TABLE centres ADD COLUMN password_hash TEXT")
        self.db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_centres_owner_email"
            " ON centres(owner_email)"
        )
        self.db.commit()

    # centres -------------------------------------------------------------
    def create_centre(
        self, name: str, owner_email: str | None = None,
        password_hash: str | None = None,
    ) -> int:
        """Raises sqlite3.IntegrityError if the email is already in use."""
        email = owner_email.strip().lower() if owner_email else None
        cur = self.db.execute(
            "INSERT INTO centres (name, owner_email, password_hash, created_at)"
            " VALUES (?, ?, ?, ?)",
            (name, email, password_hash, _now()),
        )
        self.db.commit()
        return cur.lastrowid

    def get_centre_by_email(self, owner_email: str) -> dict | None:
        row = self.db.execute(
            "SELECT * FROM centres WHERE owner_email = ?",
            (owner_email.strip().lower(),),
        ).fetchone()
        return dict(row) if row else None

    def set_owner(self, centre_id: int, owner_email: str, password_hash: str) -> None:
        self.db.execute(
            "UPDATE centres SET owner_email = ?, password_hash = ? WHERE id = ?",
            (owner_email.strip().lower(), password_hash, centre_id),
        )
        self.db.commit()

    def get_centre(self, centre_id: int) -> dict | None:
        row = self.db.execute(
            "SELECT * FROM centres WHERE id = ?", (centre_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_centres(self) -> list[dict]:
        rows = self.db.execute("SELECT id, name, owner_email FROM centres ORDER BY id").fetchall()
        return [dict(r) for r in rows]

    def set_content(self, centre_id: int, content: str, chunks: list[str]) -> None:
        with self.db:
            self.db.execute(
                "UPDATE centres SET content = ? WHERE id = ?", (content, centre_id)
            )
            self.db.execute("DELETE FROM chunks WHERE centre_id = ?", (centre_id,))
            self.db.executemany(
                "INSERT INTO chunks (centre_id, text) VALUES (?, ?)",
                [(centre_id, c) for c in chunks],
            )

    def get_chunks(self, centre_id: int) -> list[str]:
        rows = self.db.execute(
            "SELECT text FROM chunks WHERE centre_id = ? ORDER BY id", (centre_id,)
        ).fetchall()
        return [r["text"] for r in rows]

    # messages ------------------------------------------------------------
    def add_message(self, centre_id, session_id, question, answer, answered) -> None:
        self.db.execute(
            "INSERT INTO messages (centre_id, session_id, question, answer,"
            " answered, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (centre_id, session_id, question, answer, int(answered), _now()),
        )
        self.db.commit()

    def messages_this_month(self, centre_id: int) -> int:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        row = self.db.execute(
            "SELECT COUNT(*) AS n FROM messages WHERE centre_id = ?"
            " AND created_at LIKE ?",
            (centre_id, month + "%"),
        ).fetchone()
        return row["n"]

    def session_questions(self, centre_id: int, session_id: str) -> list[str]:
        rows = self.db.execute(
            "SELECT question FROM messages WHERE centre_id = ? AND session_id = ?"
            " ORDER BY id",
            (centre_id, session_id),
        ).fetchall()
        return [r["question"] for r in rows]

    # leads ---------------------------------------------------------------
    def add_lead(self, centre_id, session_id, name, phone, note="") -> int:
        cur = self.db.execute(
            "INSERT INTO leads (centre_id, session_id, name, phone, note,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (centre_id, session_id, name, phone, note, _now()),
        )
        self.db.commit()
        return cur.lastrowid

    def list_leads(self, centre_id: int) -> list[dict]:
        rows = self.db.execute(
            "SELECT * FROM leads WHERE centre_id = ? ORDER BY id DESC", (centre_id,)
        ).fetchall()
        leads = []
        for r in rows:
            lead = dict(r)
            lead["questions"] = self.session_questions(centre_id, r["session_id"])
            leads.append(lead)
        return leads
