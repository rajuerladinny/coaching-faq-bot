"""Answering logic: retrieve, decide whether to answer, fall back safely."""
import os
from typing import Callable

from . import llm
from .retrieval import chunk_text, rank
from .store import Store

FALLBACK = (
    "I'm not sure about that. Share your name and phone number and "
    "our team will call you back."
)
LIMIT_REACHED = (
    "Our assistant is unavailable right now. Share your name and phone "
    "number and our team will call you back."
)
SLOW_DOWN = (
    "You're sending messages quickly. Please wait a few minutes, or share "
    "your name and phone number and our team will call you back."
)
MIN_SCORE = float(os.environ.get("MIN_SCORE", "0.3"))
MONTHLY_CAP = int(os.environ.get("MONTHLY_MESSAGE_CAP", "1000"))


def save_content(store: Store, centre_id: int, content: str) -> int:
    chunks = chunk_text(content)
    store.set_content(centre_id, content, chunks)
    return len(chunks)


def answer(
    store: Store,
    centre_id: int,
    session_id: str,
    question: str,
    generate: Callable[[str, list[str], str], str] = llm.generate,
) -> dict:
    """Return {"answer": str, "answered": bool}.

    answered=False tells the frontend to show the callback (lead) form.
    """
    centre = store.get_centre(centre_id)
    if centre is None:
        raise KeyError(centre_id)

    if store.messages_this_month(centre_id) >= MONTHLY_CAP:
        result = {"answer": LIMIT_REACHED, "answered": False}
    else:
        ranked = rank(question, store.get_chunks(centre_id))
        relevant = [chunk for chunk, score in ranked if score >= MIN_SCORE]
        if not relevant:
            result = {"answer": FALLBACK, "answered": False}
        else:
            try:
                text = generate(centre["name"], relevant, question)
            except Exception:
                text = "UNSURE"  # LLM down: never show an error to a parent
            if not text or text.strip().upper().startswith("UNSURE"):
                result = {"answer": FALLBACK, "answered": False}
            else:
                result = {"answer": text.strip(), "answered": True}

    store.add_message(
        centre_id, session_id, question, result["answer"], result["answered"]
    )
    return result
