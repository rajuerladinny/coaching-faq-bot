import { useCallback, useEffect, useState } from "react";
import { api, AuthError } from "./api.js";

const PLACEHOLDER = `Fees: JEE foundation batch costs Rs 45,000 per year.

Timings: Morning batch 7am to 9am. Evening batch 5pm to 8pm.

Demo class: Two free demo classes before admission.

Leave a blank line between topics.`;

function Login({ onDone }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(email.trim(), password);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin narrow">
      <h1>Coaching FAQ Bot</h1>
      <form className="card stack" onSubmit={submit}>
        <h2>Owner login</h2>
        <input
          required
          type="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(api.isLoggedIn());
  const [centre, setCentre] = useState(null);
  const [content, setContent] = useState("");
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("");

  const handleError = useCallback((err) => {
    if (err instanceof AuthError) {
      setLoggedIn(false);
      setCentre(null);
    } else {
      setStatus(err.message);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [mine, leadList] = await Promise.all([api.myCentre(), api.listLeads()]);
      setCentre(mine);
      setContent(mine.content);
      setLeads(leadList);
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn, load]);

  async function save() {
    try {
      const res = await api.saveContent(content);
      setStatus(`Saved. The bot now knows ${res.chunks} topic(s).`);
    } catch (err) {
      handleError(err);
    }
  }

  function logout() {
    api.logout();
    setLoggedIn(false);
    setCentre(null);
    setStatus("");
  }

  if (!loggedIn) return <Login onDone={() => setLoggedIn(true)} />;
  if (!centre) return <p className="page-error">{status || "Loading…"}</p>;

  const chatLink = `${window.location.origin}${window.location.pathname}#/chat/${centre.id}`;

  return (
    <div className="admin">
      <div className="row spread">
        <h1>{centre.name}</h1>
        <button className="secondary" onClick={logout}>
          Log out
        </button>
      </div>

      <section className="card">
        <h2>What the bot knows</h2>
        <textarea
          rows={14}
          value={content}
          placeholder={PLACEHOLDER}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="row">
          <button onClick={save}>Save</button>
          <span className="status">{status}</span>
        </div>
        <p className="hint">
          Chat link to share: <a href={chatLink}>{chatLink}</a>
        </p>
      </section>

      <section className="card">
        <div className="row spread">
          <h2>Leads ({leads.length})</h2>
          <button className="secondary" onClick={load}>
            Refresh
          </button>
        </div>
        {leads.length === 0 && <p className="hint">No leads yet.</p>}
        {leads.map((l) => (
          <div key={l.id} className="lead">
            <strong>{l.name}</strong> · <a href={`tel:${l.phone}`}>{l.phone}</a>
            <div className="hint">{new Date(l.created_at).toLocaleString()}</div>
            {l.questions.length > 0 && (
              <ul>
                {l.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
