import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

function newSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

export default function ChatWidget({ centreId }) {
  const [centre, setCentre] = useState(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const [leadSent, setLeadSent] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [lead, setLead] = useState({ name: "", phone: "" });
  const sessionId = useRef(newSessionId());
  const bottom = useRef(null);

  useEffect(() => {
    api
      .publicCentre(centreId)
      .then(setCentre)
      .catch(() => setError("This chat link is not valid."));
  }, [centreId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showLead]);

  async function ask(question) {
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text: question }]);
    setBusy(true);
    try {
      const res = await api.chat(centreId, sessionId.current, question);
      setMessages((m) => [...m, { from: "bot", text: res.answer }]);
      if (!res.answered && !leadSent) setShowLead(true);
    } catch {
      setMessages((m) => [
        ...m,
        { from: "bot", text: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function send(e) {
    e.preventDefault();
    ask(input.trim());
  }

  async function submitLead(e) {
    e.preventDefault();
    if (leadBusy) return;
    setLeadBusy(true);
    try {
      await api.addLead(centreId, { session_id: sessionId.current, ...lead });
      setLeadSent(true);
      setShowLead(false);
      setMessages((m) => [
        ...m,
        { from: "bot", text: "Thank you! Our team will call you soon." },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { from: "bot", text: err.message }]);
    } finally {
      setLeadBusy(false);
    }
  }

  if (error) return <p className="page-error">{error}</p>;
  if (!centre) return <p className="page-error">Loading…</p>;

  const topics = centre.topics || [];

  return (
    <div className="chat">
      <header className="chat-header">
        <strong>{centre.name}</strong>
        <span>Ask about courses, fees and timings</span>
      </header>

      <div className="chat-body" role="log" aria-live="polite" aria-label="Conversation">
        <div className="bubble bot">
          Hi! I can answer questions about {centre.name}. What would you like
          to know?
        </div>
        {messages.length === 0 && topics.length > 0 && (
          <div className="chips" aria-label="Common questions">
            {topics.map((topic) => (
              <button
                key={topic}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => ask(`Tell me about ${topic.toLowerCase()}`)}
              >
                {topic}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="bubble bot muted">Typing…</div>}

        {showLead && (
          <form className="lead-form" onSubmit={submitLead}>
            <input
              required
              aria-label="Your name"
              autoComplete="name"
              maxLength={80}
              placeholder="Your name"
              value={lead.name}
              onChange={(e) => setLead({ ...lead, name: e.target.value })}
            />
            <input
              required
              type="tel"
              aria-label="Phone number"
              autoComplete="tel"
              maxLength={20}
              placeholder="Phone number"
              value={lead.phone}
              onChange={(e) => setLead({ ...lead, phone: e.target.value })}
            />
            <button type="submit" disabled={leadBusy}>
              {leadBusy ? "Sending…" : "Request a call back"}
            </button>
          </form>
        )}
        <div ref={bottom} />
      </div>

      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          maxLength={500}
          aria-label="Your question"
          placeholder="Type your question"
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
      {!showLead && !leadSent && (
        <button className="link-button" onClick={() => setShowLead(true)}>
          Prefer a call? Leave your number
        </button>
      )}
    </div>
  );
}
