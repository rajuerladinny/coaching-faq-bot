import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText, rank, tokenize, topics } from "../src/lib/retrieval.js";
import { answerRate, csvCell, leadsToCsv, whatsappLink } from "../src/lib/leads.js";
import { createDemoApi, DEMO_CONTENT, FALLBACK } from "../src/lib/demo.js";

test("tokenize drops stopwords and plurals, like the backend", () => {
  assert.deepEqual(tokenize("What are the fees?"), ["fee"]);
  assert.deepEqual(tokenize("Evening class timings"), ["evening", "class", "timing"]);
});

test("chunkText packs paragraphs and hard-splits long ones", () => {
  assert.equal(chunkText(DEMO_CONTENT, 160).length, 4);
  assert.ok(chunkText(DEMO_CONTENT, 160).every((c) => c.length <= 160));
  assert.ok(chunkText("word ".repeat(400), 100).every((c) => c.length <= 100));
  assert.deepEqual(chunkText("  \n\n  "), []);
});

test("rank finds the right chunk and ignores unrelated questions", () => {
  const chunks = chunkText(DEMO_CONTENT, 160);
  const [best, score] = rank("what are the batch timings", chunks)[0];
  assert.ok(best.startsWith("Timings"));
  assert.ok(score > 0 && score <= 1);
  assert.deepEqual(rank("do you sell pizza", chunks), []);
});

test("topics come from the owner's labels", () => {
  assert.deepEqual(topics(DEMO_CONTENT), [
    "Fees",
    "Timings",
    "Demo class",
    "Batch size",
    "Address",
    "Admission",
  ]);
  assert.deepEqual(topics("No labels.\n\nhttp://example.com: not a label"), []);
});

test("whatsappLink handles local and international numbers", () => {
  assert.equal(whatsappLink("9876543210"), "https://wa.me/919876543210");
  assert.equal(whatsappLink("+44 7700 900123"), "https://wa.me/447700900123");
  assert.equal(whatsappLink("919876543210"), "https://wa.me/919876543210");
  assert.equal(whatsappLink("12345"), null);
});

test("lead CSV quotes cells and neutralises formulas", () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  const csv = leadsToCsv([
    {
      name: "Anita",
      phone: "+919876543210",
      status: "new",
      created_at: "2026-01-01T00:00:00Z",
      note: "",
      questions: ["Fees?", "Hostel?"],
    },
  ]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], "name,phone,status,received_at,note,questions");
  assert.equal(lines[1], `"Anita","'+919876543210","new","2026-01-01T00:00:00Z","","Fees? | Hostel?"`);
});

test("answerRate is a whole percentage, or null with no messages", () => {
  assert.equal(answerRate({ messages_this_month: 3, answered_this_month: 2 }), 67);
  assert.equal(answerRate({ messages_this_month: 0, answered_this_month: 0 }), null);
  assert.equal(answerRate(null), null);
});

test("demo: seeded leads, stats and content gaps", async () => {
  const api = createDemoApi(() => Date.parse("2026-06-01T10:00:00Z"));
  const leads = await api.listLeads();
  assert.deepEqual(
    leads.map((l) => [l.name, l.status]),
    [
      ["Meena S", "new"],
      ["Ravi Kumar", "new"],
      ["Anita Rao", "contacted"],
    ]
  );
  assert.deepEqual(leads[1].questions, ["Do you have a hostel?", "Is transport available?"]);
  const stats = await api.stats();
  assert.equal(stats.messages_this_month, 8);
  assert.equal(stats.answered_this_month, 3);
  assert.equal(stats.leads_new, 2);
  assert.deepEqual(stats.unanswered[0], {
    question: "Do you have a hostel?",
    times: 2,
    last_asked: "2026-05-31T14:00:00.000Z",
  });
});

test("demo: chat answers from content, falls back, and takes a lead", async () => {
  const api = createDemoApi();
  const centre = await api.publicCentre(1);
  assert.equal(centre.topics[0], "Fees");
  const yes = await api.chat(1, "s1", "Is there a demo class?");
  assert.equal(yes.answered, true);
  assert.match(yes.answer, /demo/i);
  assert.deepEqual(await api.chat(1, "s1", "Do you sell pizza?"), {
    answer: FALLBACK,
    answered: false,
  });
  await assert.rejects(api.addLead(1, { session_id: "s1", name: "X", phone: "nope" }), /valid phone/);
  const { id } = await api.addLead(1, { session_id: "s1", name: " Kiran ", phone: "98765 43210" });
  const [newest] = await api.listLeads();
  assert.deepEqual([newest.id, newest.name, newest.phone], [id, "Kiran", "9876543210"]);
  await api.setLeadStatus(id, "contacted");
  assert.equal((await api.listLeads())[0].status, "contacted");
  await assert.rejects(api.publicCentre(2), /Centre not found/);
});

test("demo: saving content changes what the bot knows; previews are not recorded", async () => {
  const api = createDemoApi();
  const before = (await api.stats()).messages_this_month;
  assert.equal((await api.preview("Do you have a hostel?")).answered, false);
  assert.deepEqual(await api.saveContent("Hostel: A girls hostel is 200 metres away."), {
    chunks: 1,
  });
  assert.equal((await api.preview("Do you have a hostel?")).answered, true);
  assert.equal((await api.stats()).messages_this_month, before);
});
