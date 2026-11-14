from app import chat
from app.retrieval import chunk_text, rank, tokenize
from app.store import Store

CONTENT = """Fees: JEE foundation batch costs Rs 45,000 per year. NEET batch costs Rs 50,000 per year.

Timings: Morning batch runs 7am to 9am. Evening batch runs 5pm to 8pm, Monday to Saturday.

Demo class: We offer two free demo classes before admission.

Address: 2nd floor, Sai Plaza, near Kukatpally metro station, Hyderabad."""


def make_store():
    store = Store(":memory:")
    cid = store.create_centre("Bright Academy")
    chat.save_content(store, cid, CONTENT)
    return store, cid


def test_tokenize_drops_stopwords_and_plurals():
    assert tokenize("What are the fees?") == ["fee"]


def test_chunk_text_respects_max_chars():
    chunks = chunk_text(CONTENT, max_chars=120)
    assert len(chunks) == 4
    long = chunk_text("word " * 400, max_chars=100)
    assert all(len(c) <= 100 for c in long)


def test_rank_finds_the_right_chunk():
    chunks = chunk_text(CONTENT, max_chars=120)
    best, score = rank("what are the batch timings", chunks)[0]
    assert best.startswith("Timings")
    assert 0 < score <= 1


def test_rank_returns_nothing_for_unrelated_question():
    assert rank("do you sell pizza", chunk_text(CONTENT, max_chars=120)) == []


def test_answer_uses_content_in_mock_mode():
    store, cid = make_store()
    chat.save_content(store, cid, CONTENT)
    result = chat.answer(store, cid, "s1", "Is there a demo class?")
    assert result["answered"] is True
    assert "demo" in result["answer"].lower()


def test_answer_falls_back_when_no_content_matches():
    store, cid = make_store()
    result = chat.answer(store, cid, "s1", "Do you sell pizza?")
    assert result == {"answer": chat.FALLBACK, "answered": False}


def test_answer_falls_back_when_llm_is_unsure_or_fails():
    store, cid = make_store()
    unsure = chat.answer(store, cid, "s1", "fees?", generate=lambda *a: "UNSURE")
    assert unsure["answered"] is False

    def broken(*args):
        raise RuntimeError("LLM down")

    failed = chat.answer(store, cid, "s1", "fees?", generate=broken)
    assert failed["answered"] is False


def test_monthly_cap_blocks_llm_calls(monkeypatch):
    store, cid = make_store()
    monkeypatch.setattr(chat, "MONTHLY_CAP", 1)
    assert chat.answer(store, cid, "s1", "fees?")["answered"] is True
    capped = chat.answer(store, cid, "s1", "timings?")
    assert capped == {"answer": chat.LIMIT_REACHED, "answered": False}


def test_leads_include_the_questions_asked():
    store, cid = make_store()
    chat.answer(store, cid, "s9", "What are the fees?")
    store.add_lead(cid, "s9", "Anita", "+919876543210")
    leads = store.list_leads(cid)
    assert leads[0]["name"] == "Anita"
    assert leads[0]["questions"] == ["What are the fees?"]


def test_replacing_content_replaces_chunks():
    store, cid = make_store()
    chat.save_content(store, cid, "Only one line now.")
    assert store.get_chunks(cid) == ["Only one line now."]


# --- owner login -----------------------------------------------------------
import pytest

from app import auth, manage
from app.ratelimit import RateLimiter


def test_password_hash_roundtrip():
    stored = auth.hash_password("correct horse")
    assert auth.verify_password("correct horse", stored)
    assert not auth.verify_password("wrong", stored)
    assert not auth.verify_password("anything", None)
    assert not auth.verify_password("anything", "garbage")


def test_token_roundtrip_expiry_and_tampering():
    token = auth.make_token(7, "secret", now=1000)
    assert auth.read_token(token, "secret", now=1001) == 7
    assert auth.read_token(token, "other-secret", now=1001) is None
    assert auth.read_token(token, "secret", now=1000 + auth.TOKEN_TTL_SECONDS + 1) is None
    payload, sig = token.split(".")
    forged = auth._b64(b'{"cid": 8, "exp": 99999999999}') + "." + sig
    assert auth.read_token(forged, "secret", now=1001) is None
    assert auth.read_token("", "secret") is None
    assert auth.read_token("not-a-token", "secret") is None


def test_create_centre_with_owner_and_login_lookup():
    store = Store(":memory:")
    cid = manage.create_centre(store, "Bright Academy", "Owner@Example.com", "password123")
    centre = store.get_centre_by_email("owner@example.com")
    assert centre["id"] == cid
    assert auth.verify_password("password123", centre["password_hash"])
    with pytest.raises(ValueError):
        manage.create_centre(store, "Copy", "owner@example.com", "password123")
    with pytest.raises(ValueError):
        manage.create_centre(store, "Weak", "weak@example.com", "short")


def test_set_owner_resets_login():
    store, cid = make_store()  # centre created without a login
    assert store.get_centre(cid)["password_hash"] is None
    manage.set_owner(store, cid, "new@example.com", "newpassword")
    assert auth.verify_password(
        "newpassword", store.get_centre_by_email("new@example.com")["password_hash"]
    )
    with pytest.raises(ValueError):
        manage.set_owner(store, 999, "x@example.com", "newpassword")


def test_migration_upgrades_an_old_database(tmp_path):
    import sqlite3

    path = str(tmp_path / "old.db")
    db = sqlite3.connect(path)
    db.execute(
        "CREATE TABLE centres (id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " name TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',"
        " created_at TEXT NOT NULL)"
    )
    db.execute("INSERT INTO centres (name, created_at) VALUES ('Old', 'x')")
    db.commit()
    db.close()
    store = Store(path)
    assert store.get_centre(1)["owner_email"] is None
    manage.set_owner(store, 1, "old@example.com", "password123")
    assert store.get_centre_by_email("old@example.com")["name"] == "Old"


# --- rate limiting ---------------------------------------------------------
def test_rate_limiter_blocks_then_recovers():
    limiter = RateLimiter(limit=2, window_seconds=10)
    assert limiter.allow("a", now=0)
    assert limiter.allow("a", now=1)
    assert not limiter.allow("a", now=2)
    assert limiter.allow("b", now=2)  # other visitors are unaffected
    assert limiter.allow("a", now=11)  # first hit has left the window
