"""LLM access through any OpenAI-compatible chat completions endpoint.

Environment variables:
    LLM_PROVIDER  "mock" (default, no LLM needed) or "openai"
    LLM_BASE_URL  e.g. http://localhost:11434/v1 for a local Ollama server
    LLM_API_KEY   provider key (any value works for local servers)
    LLM_MODEL     model name as the provider lists it
"""
import json
import os
import urllib.request

SYSTEM_PROMPT = (
    "You are the enquiry assistant for {centre}, a coaching centre. "
    "Answer the question using ONLY the centre information provided. "
    "Keep answers short, friendly and factual. Never invent fees, dates, "
    "timings or promises. If the information does not contain the answer, "
    "reply with exactly: UNSURE"
)


def build_messages(centre: str, context: list[str], question: str) -> list[dict]:
    info = "\n\n---\n\n".join(context)
    return [
        {"role": "system", "content": SYSTEM_PROMPT.format(centre=centre)},
        {
            "role": "user",
            "content": f"Centre information:\n{info}\n\nQuestion: {question}",
        },
    ]


def mock_answer(context: list[str]) -> str:
    """No-LLM mode: return the best matching piece of content as it is."""
    return context[0] if context else "UNSURE"


def openai_answer(messages: list[dict]) -> str:
    base = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
    body = json.dumps(
        {
            "model": os.environ["LLM_MODEL"],
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 300,
        }
    ).encode()
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('LLM_API_KEY', 'none')}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    return data["choices"][0]["message"]["content"].strip()


def generate(centre: str, context: list[str], question: str) -> str:
    if os.environ.get("LLM_PROVIDER", "mock") == "mock":
        return mock_answer(context)
    return openai_answer(build_messages(centre, context, question))
