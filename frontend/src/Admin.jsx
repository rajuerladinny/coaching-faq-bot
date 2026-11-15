import { useCallback, useEffect, useState } from "react";
import { api, AuthError } from "./api.js";
import { answerRate, leadsToCsv, whatsappLink } from "./lib/leads.js";

const PLACEHOLDER = `Fees: JEE foundation batch costs Rs 45,000 per year.

Timings: Morning batch 7am to 9am. Evening batch 5pm to 8pm.

Demo class: Two free demo classes before admission.

Leave a blank line between topics.`;
const MAX_CONTENT = 50000;
const TABS = ["Leads", "Content", "Insights", "Share"];

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
          aria-label="Email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. inside some webviews): the text stays selectable.
    }
  }
  return (
    <button type="button" className="secondary" onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Leads({ leads, onStatus, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const shown = leads.filter((l) => filter === "all" || l.status === filter);
  const count = (status) => leads.filter((l) => l.status === status).length;
  return (
    <section className="card">
      <div className="row spread wrap">
        <h2>Leads ({leads.length})</h2>
        <div className="row tight">
          <button
            className="secondary"
            disabled={leads.length === 0}
            onClick={() => download("leads.csv", leadsToCsv(leads), "text/csv")}
          >
            Export CSV
          </button>
          <button className="secondary" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>
      <div className="pills" role="group" aria-label="Filter leads">
        {[
          ["all", `All ${leads.length}`],
          ["new", `To call ${count("new")}`],
          ["contacted", `Contacted ${count("contacted")}`],
        ].map(([value, text]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={filter === value ? "pill active" : "pill"}
            onClick={() => setFilter(value)}
          >
            {text}
          </button>
        ))}
      </div>
      {leads.length === 0 && (
        <p className="hint">
          No leads yet. When the bot cannot answer, it asks for a name and phone number and the
          enquiry appears here.
        </p>
      )}
      {leads.length > 0 && shown.length === 0 && <p className="hint">Nothing in this list.</p>}
      {shown.map((l) => {
        const whatsapp = whatsappLink(l.phone);
        return (
          <div key={l.id} className={l.status === "contacted" ? "lead done" : "lead"}>
            <div className="row spread wrap">
              <div>
                <strong>{l.name}</strong> · <a href={`tel:${l.phone}`}>{l.phone}</a>
                {whatsapp && (
                  <>
                    {" · "}
                    <a href={whatsapp} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                  </>
                )}
                <div className="hint">{new Date(l.created_at).toLocaleString()}</div>
              </div>
              <button
                className="secondary"
                onClick={() => onStatus(l.id, l.status === "contacted" ? "new" : "contacted")}
              >
                {l.status === "contacted" ? "Mark as to call" : "Mark contacted"}
              </button>
            </div>
            {l.questions.length > 0 && (
              <ul>
                {l.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Content({ saved, onSave }) {
  const [content, setContent] = useState(saved);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [preview, setPreview] = useState(null);
  const dirty = content !== saved;

  useEffect(() => setContent(saved), [saved]);
  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const res = await onSave(content);
      if (res) setStatus(`Saved. The bot now knows ${res.chunks} topic(s).`);
    } finally {
      setBusy(false);
    }
  }
  async function tryIt(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setPreview({ loading: true });
    try {
      setPreview(await api.preview(question.trim()));
    } catch (err) {
      setPreview({ error: err.message });
    }
  }

  return (
    <>
      <section className="card">
        <h2>What the bot knows</h2>
        <textarea
          rows={14}
          aria-label="Centre information"
          maxLength={MAX_CONTENT}
          value={content}
          placeholder={PLACEHOLDER}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="row spread wrap">
          <div className="row">
            <button onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save"}
            </button>
            <span className="status" role="status">
              {dirty ? "Unsaved changes" : status}
            </span>
          </div>
          <span className="hint">
            {content.length.toLocaleString()} / {MAX_CONTENT.toLocaleString()} characters
          </span>
        </div>
        <p className="hint">
          Start each topic with a label and a colon, such as “Fees: …”. Labels become one-tap
          questions on the chat page.
        </p>
      </section>

      <section className="card">
        <h2>Try your bot</h2>
        <p className="hint">
          Ask a question the way a parent would. This uses the saved content and is not counted
          as a parent message.
        </p>
        <form className="row" onSubmit={tryIt}>
          <input
            aria-label="Test question"
            maxLength={500}
            placeholder="e.g. What are the fees?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" disabled={!question.trim() || preview?.loading}>
            Ask
          </button>
        </form>
        {preview?.loading && <p className="hint">Thinking…</p>}
        {preview?.error && <p className="error">{preview.error}</p>}
        {preview?.answer && (
          <div className="preview">
            <span className={preview.answered ? "tag ok" : "tag warn"}>
              {preview.answered ? "Answered from your content" : "Not found: offers a call back"}
            </span>
            <p>{preview.answer}</p>
          </div>
        )}
      </section>
    </>
  );
}

function Insights({ stats }) {
  if (!stats) return <p className="hint">Loading…</p>;
  return (
    <section className="card">
      <h2>Questions the bot could not answer</h2>
      <p className="hint">
        Add these topics to your content and the bot will answer them next time.
      </p>
      {stats.unanswered.length === 0 && <p className="hint">None so far.</p>}
      <ol className="gaps">
        {stats.unanswered.map((g) => (
          <li key={g.question}>
            <span>{g.question}</span>
            <small>
              asked {g.times} {g.times === 1 ? "time" : "times"}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Share({ centre }) {
  const chatLink = `${window.location.origin}${window.location.pathname}${window.location.search}#/chat/${centre.id}`;
  const embed = `<iframe src="${chatLink}" title="${centre.name.replaceAll('"', "&quot;")} enquiry chat" style="width:100%;max-width:420px;height:600px;border:1px solid #d8dee6;border-radius:12px"></iframe>`;
  const whatsappText = `https://wa.me/?text=${encodeURIComponent(`Ask ${centre.name} about fees, timings and admissions: ${chatLink}`)}`;
  return (
    <section className="card stack">
      <h2>Share the chat</h2>
      <div>
        <p className="hint">Chat link for parents and students</p>
        <div className="row">
          <input readOnly aria-label="Chat link" value={chatLink} onFocus={(e) => e.target.select()} />
          <CopyButton text={chatLink} />
        </div>
        <p className="hint">
          <a href={chatLink} target="_blank" rel="noreferrer">
            Open the chat
          </a>
          {" · "}
          <a href={whatsappText} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
        </p>
      </div>
      <div>
        <p className="hint">Embed on your website</p>
        <textarea readOnly rows={4} aria-label="Embed code" value={embed} onFocus={(e) => e.target.select()} />
        <div className="row">
          <CopyButton text={embed} label="Copy embed code" />
        </div>
      </div>
    </section>
  );
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(api.isLoggedIn());
  const [centre, setCentre] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState("Leads");
  const [error, setError] = useState("");

  const handleError = useCallback((err) => {
    if (err instanceof AuthError) {
      setLoggedIn(false);
      setCentre(null);
    } else {
      setError(err.message);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [mine, leadList, statData] = await Promise.all([
        api.myCentre(),
        api.listLeads(),
        api.stats(),
      ]);
      setCentre(mine);
      setLeads(leadList);
      setStats(statData);
      setError("");
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn, load]);

  async function saveContent(content) {
    try {
      const res = await api.saveContent(content);
      setCentre((c) => ({ ...c, content }));
      setError("");
      return res;
    } catch (err) {
      handleError(err);
      return null;
    }
  }

  async function setLeadStatus(leadId, status) {
    try {
      await api.setLeadStatus(leadId, status);
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  function logout() {
    api.logout();
    setLoggedIn(false);
    setCentre(null);
    setError("");
  }

  if (!loggedIn) return <Login onDone={() => setLoggedIn(true)} />;
  if (!centre) {
    return (
      <div className="page-error">
        <p>{error || "Loading…"}</p>
        {error && <button onClick={load}>Try again</button>}
      </div>
    );
  }

  const rate = answerRate(stats);

  return (
    <div className="admin">
      <div className="row spread">
        <h1>{centre.name}</h1>
        <button className="secondary" onClick={logout}>
          Log out
        </button>
      </div>

      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}

      {stats && (
        <div className="stats">
          <Stat
            label="Leads to call"
            value={stats.leads_new}
            note={`${stats.leads_total} in total`}
          />
          <Stat
            label="Questions this month"
            value={stats.messages_this_month}
            note={`of ${stats.monthly_cap.toLocaleString()} included`}
          />
          <Stat
            label="Answered by the bot"
            value={rate === null ? "–" : `${rate}%`}
            note={rate === null ? "No questions yet" : "the rest were offered a call back"}
          />
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "tab active" : "tab"}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Leads" && <Leads leads={leads} onStatus={setLeadStatus} onRefresh={load} />}
      {/* Stays mounted so unsaved edits survive a switch to another tab. */}
      <div hidden={tab !== "Content"}>
        <Content saved={centre.content} onSave={saveContent} />
      </div>
      {tab === "Insights" && <Insights stats={stats} />}
      {tab === "Share" && <Share centre={centre} />}
    </div>
  );
}
