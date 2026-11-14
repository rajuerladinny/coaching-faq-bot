import { useEffect, useState } from "react";
import { api } from "./api.js";

const PLACEHOLDER = `Fees: JEE foundation batch costs Rs 45,000 per year.

Timings: Morning batch 7am to 9am. Evening batch 5pm to 8pm.

Demo class: Two free demo classes before admission.

Leave a blank line between topics.`;

export default function Admin() {
  const [centres, setCentres] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newName, setNewName] = useState("");
  const [content, setContent] = useState("");
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.listCentres().then(setCentres).catch((e) => setStatus(e.message));
  }, []);

  async function open(id) {
    setStatus("");
    const [centre, leadList] = await Promise.all([
      api.getCentre(id),
      api.listLeads(id),
    ]);
    setSelected(centre);
    setContent(centre.content);
    setLeads(leadList);
  }

  async function create(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const centre = await api.createCentre(newName.trim());
    setCentres((c) => [...c, centre]);
    setNewName("");
    open(centre.id);
  }

  async function save() {
    try {
      const res = await api.saveContent(selected.id, content);
      setStatus(`Saved. The bot now knows ${res.chunks} topic(s).`);
    } catch (e) {
      setStatus(e.message);
    }
  }

  const chatLink = selected
    ? `${window.location.origin}${window.location.pathname}#/chat/${selected.id}`
    : "";

  return (
    <div className="admin">
      <h1>Coaching FAQ Bot</h1>

      <section className="card">
        <h2>Centres</h2>
        <ul className="centre-list">
          {centres.map((c) => (
            <li key={c.id}>
              <button
                className={selected?.id === c.id ? "active" : ""}
                onClick={() => open(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={create}>
          <input
            placeholder="New centre name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>

      {selected && (
        <>
          <section className="card">
            <h2>What the bot knows about {selected.name}</h2>
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
            <h2>Leads ({leads.length})</h2>
            {leads.length === 0 && <p className="hint">No leads yet.</p>}
            {leads.map((l) => (
              <div key={l.id} className="lead">
                <strong>{l.name}</strong> · <a href={`tel:${l.phone}`}>{l.phone}</a>
                <div className="hint">
                  {new Date(l.created_at).toLocaleString()}
                </div>
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
        </>
      )}
    </div>
  );
}
