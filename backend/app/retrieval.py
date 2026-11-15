"""Chunking and keyword retrieval. Standard library only."""
import math
import re
from collections import Counter

STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "do", "does", "did",
    "i", "you", "we", "they", "it", "my", "your", "our", "of", "to", "in",
    "on", "for", "at", "by", "with", "and", "or", "what", "when", "where",
    "how", "which", "who", "can", "will", "there", "any", "me", "please",
    "have", "has", "this", "that", "as", "from", "about", "tell", "much",
    "many",
}


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    out = []
    for w in words:
        if w in STOPWORDS:
            continue
        # crude plural stemming so "fees" matches "fee"
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.append(w)
    return out


def chunk_text(text: str, max_chars: int = 500) -> list[str]:
    """Split content on blank lines, packing short paragraphs together."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for p in paragraphs:
        while len(p) > max_chars:  # very long paragraph: hard split
            cut = p.rfind(" ", 0, max_chars)
            cut = cut if cut > 0 else max_chars
            if current:
                chunks.append(current)
                current = ""
            chunks.append(p[:cut].strip())
            p = p[cut:].strip()
        if not p:
            continue
        if current and len(current) + len(p) + 2 > max_chars:
            chunks.append(current)
            current = p
        else:
            current = f"{current}\n\n{p}" if current else p
    if current:
        chunks.append(current)
    return chunks


def topics(text: str, limit: int = 6) -> list[str]:
    """Topic labels the owner wrote, e.g. "Fees" from a "Fees: ..." paragraph.

    The chat page offers these as one-tap questions.
    """
    found: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        match = re.match(r"\s*([A-Za-z][A-Za-z0-9 &/'-]{1,28}):\s+\S", paragraph)
        if not match:
            continue
        label = match.group(1).strip()
        if label.lower() not in (f.lower() for f in found):
            found.append(label)
        if len(found) == limit:
            break
    return found


def rank(question: str, chunks: list[str], top_k: int = 3) -> list[tuple[str, float]]:
    """Return up to top_k (chunk, score) pairs with score > 0, best first.

    Score is the IDF-weighted share of question terms found in the chunk,
    so it always falls between 0 and 1.
    """
    q_terms = set(tokenize(question))
    if not q_terms or not chunks:
        return []
    chunk_terms = [Counter(tokenize(c)) for c in chunks]
    n = len(chunks)

    def idf(term: str) -> float:
        df = sum(1 for ct in chunk_terms if term in ct)
        return math.log((n + 1) / (df + 1)) + 1

    total = sum(idf(t) for t in q_terms)
    scored = []
    for chunk, terms in zip(chunks, chunk_terms):
        hit = sum(idf(t) for t in q_terms if t in terms)
        if hit > 0:
            scored.append((chunk, hit / total))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:top_k]
