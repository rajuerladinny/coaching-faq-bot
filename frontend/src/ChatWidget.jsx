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

  async function send(e) {
    e.preventDefault();
    const question = input.trim();
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

  async function submitLead(e) {
    e.preventDefault();
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
    }
  }

  if (error) return <p className="page-error">{error}</p>;
  if (!centre) return <p className="page-error">Loading…</p>;

  return (
    <div className="chat">
      <header className="chat-header">
        <strong>{centre.name}</strong>
        <span>Ask about courses, fees and timings</span>
      </header>

      <div className="chat-body">
        <div className="bubble bot">
          Hi! I can answer questions about {centre.name}. What would you like
          to know?
        </div>
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
              placeholder="Your name"
              value={lead.name}
              onChange={(e) => setLead({ ...lead, name: e.target.value })}
            />
            <input
              required
              type="tel"
              placeholder="Phone number"
              value={lead.phone}
              onChange={(e) => setLead({ ...lead, phone: e.target.value })}
            />
            <button type="submit">Request a call back</button>
          </form>
        )}
        <div ref={bottom} />
      </div>

      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          maxLength={500}
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
