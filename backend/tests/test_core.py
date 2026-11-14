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
