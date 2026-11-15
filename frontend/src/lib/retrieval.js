// Chunking and keyword retrieval for the in-browser demo.
// A JavaScript port of backend/app/retrieval.py; keep the two in step.

const STOPWORDS = new Set(
  (
    "a an the is are was were be do does did i you we they it my your our of to in " +
    "on for at by with and or what when where how which who can will there any me please " +
    "have has this that as from about tell much many"
  ).split(" ")
);

export function tokenize(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const out = [];
  for (let w of words) {
    if (STOPWORDS.has(w)) continue;
    // crude plural stemming so "fees" matches "fee"
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    out.push(w);
  }
  return out;
}

/** Split content on blank lines, packing short paragraphs together. */
export function chunkText(text, maxChars = 500) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (let p of paragraphs) {
    while (p.length > maxChars) {
      let cut = p.lastIndexOf(" ", maxChars - 1);
      if (cut <= 0) cut = maxChars;
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(p.slice(0, cut).trim());
      p = p.slice(cut).trim();
    }
    if (!p) continue;
    if (current && current.length + p.length + 2 > maxChars) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Up to topK [chunk, score] pairs with score > 0, best first. Scores fall in 0..1. */
export function rank(question, chunks, topK = 3) {
  const qTerms = [...new Set(tokenize(question))];
  if (!qTerms.length || !chunks.length) return [];
  const chunkTerms = chunks.map((c) => new Set(tokenize(c)));
  const n = chunks.length;
  const idf = (term) => {
    const df = chunkTerms.filter((terms) => terms.has(term)).length;
    return Math.log((n + 1) / (df + 1)) + 1;
  };
  const total = qTerms.reduce((sum, t) => sum + idf(t), 0);
  const scored = [];
  chunks.forEach((chunk, i) => {
    const hit = qTerms.reduce((sum, t) => sum + (chunkTerms[i].has(t) ? idf(t) : 0), 0);
    if (hit > 0) scored.push([chunk, hit / total]);
  });
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, topK);
}

/** Topic labels the owner wrote, e.g. "Fees" from a "Fees: ..." paragraph. */
export function topics(text, limit = 6) {
  const found = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const match = paragraph.match(/^\s*([A-Za-z][A-Za-z0-9 &/'-]{1,28}):\s+\S/);
    if (!match) continue;
    const label = match[1].trim();
    if (!found.some((f) => f.toLowerCase() === label.toLowerCase())) found.push(label);
    if (found.length === limit) break;
  }
  return found;
}
