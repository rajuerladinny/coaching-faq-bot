// An in-browser stand-in for the API, used by the public demo.
// Everything lives in memory: nothing is sent anywhere and a reload resets it.
import { chunkText, rank, topics } from "./retrieval.js";

export const FALLBACK =
  "I'm not sure about that. Share your name and phone number and our team will call you back.";
const MIN_SCORE = 0.3;
const MONTHLY_CAP = 1000;

export const DEMO_CONTENT = `Fees: JEE foundation batch costs Rs 45,000 per year. NEET batch costs Rs 50,000 per year. Fees can be paid in three instalments.

Timings: Morning batch runs 7am to 9am. Evening batch runs 5pm to 8pm, Monday to Saturday.

Demo class: We offer two free demo classes before admission.

Batch size: Each batch has at most 25 students.

Address: 2nd floor, Sai Plaza, near Kukatpally metro station, Hyderabad.

Admission: Bring the last school report card and two passport photos. Admissions are open all year.`;

const HOUR = 3600000;

export function createDemoApi(now = () => Date.now()) {
  const iso = (offset = 0) => new Date(now() + offset).toISOString();
  const centre = { id: 1, name: "Bright Academy (demo)", content: DEMO_CONTENT };
  let chunks = chunkText(centre.content);
  let nextId = 1;
  const messages = [];
  const leads = [];

  function decide(question) {
    const relevant = rank(question, chunks).filter(([, score]) => score >= MIN_SCORE);
    // Like the backend's mock mode: reply with the best matching piece of content.
    if (!relevant.length) return { answer: FALLBACK, answered: false };
    return { answer: relevant[0][0], answered: true };
  }
  function record(sessionId, question, offset = 0) {
    const result = decide(question);
    messages.push({ session_id: sessionId, question, ...result, created_at: iso(offset) });
    return result;
  }
  function addLead(sessionId, name, phone, status = "new", offset = 0) {
    const lead = {
      id: nextId++,
      session_id: sessionId,
      name,
      phone,
      note: "",
      status,
      created_at: iso(offset),
    };
    leads.push(lead);
    return lead;
  }
  const myCentreOr404 = (id) => {
    if (Number(id) !== centre.id) throw new Error("Centre not found");
  };

  // Seed some history so the owner page is not empty.
  record("seed-1", "What are the fees for JEE?", -52 * HOUR);
  record("seed-1", "Do you have a hostel?", -52 * HOUR);
  addLead("seed-1", "Anita Rao", "+919876543210", "contacted", -51 * HOUR);
  record("seed-2", "What are the batch timings?", -30 * HOUR);
  record("seed-2", "Is there a hostel facility?", -30 * HOUR);
  record("seed-3", "Do you have a hostel?", -20 * HOUR);
  record("seed-3", "Is transport available?", -20 * HOUR);
  addLead("seed-3", "Ravi Kumar", "9123456780", "new", -19 * HOUR);
  record("seed-4", "Is there a demo class?", -5 * HOUR);
  record("seed-5", "Any scholarships?", -3 * HOUR);
  addLead("seed-5", "Meena S", "+919000012345", "new", -2 * HOUR);

  return {
    isLoggedIn: () => true,
    logout: () => {},
    login: async () => ({ name: centre.name }),

    myCentre: async () => ({ ...centre }),
    saveContent: async (content) => {
      centre.content = content;
      chunks = chunkText(content);
      return { chunks: chunks.length };
    },
    listLeads: async () =>
      [...leads].reverse().map((l) => ({
        ...l,
        questions: messages.filter((m) => m.session_id === l.session_id).map((m) => m.question),
      })),
    setLeadStatus: async (leadId, status) => {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) throw new Error("Lead not found");
      lead.status = status;
      return { id: leadId, status };
    },
    stats: async () => {
      const gaps = new Map();
      for (const m of messages.filter((x) => !x.answered)) {
        const key = m.question.trim().toLowerCase();
        const gap = gaps.get(key) || { question: m.question, times: 0, last_asked: m.created_at };
        gap.times += 1;
        if (m.created_at > gap.last_asked) gap.last_asked = m.created_at;
        gaps.set(key, gap);
      }
      return {
        messages_this_month: messages.length,
        answered_this_month: messages.filter((m) => m.answered).length,
        leads_total: leads.length,
        leads_new: leads.filter((l) => l.status === "new").length,
        monthly_cap: MONTHLY_CAP,
        unanswered: [...gaps.values()]
          .sort((a, b) => b.times - a.times || b.last_asked.localeCompare(a.last_asked))
          .slice(0, 10),
      };
    },
    preview: async (question) => decide(question.trim()),

    publicCentre: async (id) => {
      myCentreOr404(id);
      return { id: centre.id, name: centre.name, topics: topics(centre.content) };
    },
    chat: async (id, sessionId, question) => {
      myCentreOr404(id);
      return record(sessionId, question.trim());
    },
    addLead: async (id, lead) => {
      myCentreOr404(id);
      const phone = String(lead.phone).replace(/[\s\-()]/g, "");
      if (!/^\+?\d{7,15}$/.test(phone)) throw new Error("Enter a valid phone number");
      return { id: addLead(lead.session_id, String(lead.name).trim(), phone).id };
    },
  };
}
