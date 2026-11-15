# Coaching FAQ Bot: product plan

An AI assistant for coaching and tuition centres. The centre adds its own
details (courses, fees, batch timings, admission process) and the bot answers
parent and student questions around the clock, then captures the enquirer's
name and phone number as a lead.

## Who it is for

- Coaching and tuition centres with roughly 20 to 200 students
- Owners who answer the same questions on phone and WhatsApp every day
- Centres that lose enquiries arriving after hours

## Problem

- Repeated questions (fees, timings, demo class) eat the owner's time
- Enquiries at night or during class go unanswered and the lead goes cold
- Enquiries are scattered across calls and chats, with no single list

## Version 1 scope

In:

1. Admin page where the owner pastes or edits the centre's content
2. Chat page (shareable link, embeddable later) for parents and students
3. Answers restricted to the centre's own content
4. Fallback when unsure: "I'll have the team call you" plus lead capture
5. Lead list showing name, phone and what was asked

Out, for later:

- WhatsApp integration (add once a centre is paying)
- Payments and self-serve signup
- PDF and website import
- Multiple staff logins, analytics

## How it works

1. Owner content is split into small chunks and stored in SQLite.
2. For each question, the most relevant chunks are found by keyword scoring.
3. If nothing relevant is found, the bot does not guess. It offers a callback.
4. Otherwise the chunks and the question go to an LLM with strict instructions
   to answer only from that content.
5. Every conversation and lead is saved for the owner.

Keyword retrieval is enough for a single centre's FAQ content. Move to
embeddings only if answers start missing obviously relevant content.

## Tech stack

- Frontend: React (Vite)
- Backend: Python, FastAPI, SQLite
- LLM: any OpenAI-compatible endpoint, set through environment variables.
  Use a local model (Ollama) or a free tier while developing. A built-in
  "mock" mode needs no LLM at all and returns the best matching content.

## Keeping LLM cost low

- Smallest model that answers well
- Send only the top 3 chunks, never the whole document
- Message cap per centre per month (enforced in the backend)
- Hard spending limit set in the provider dashboard
- Later: cache answers to the most common questions

## Validation before building further

Talk to 3 to 5 coaching owners first. Ask:

1. Which questions do you answer again and again?
2. How do enquiries reach you (call, WhatsApp, walk-in, website)?
3. What happens to enquiries that arrive after hours?
4. How do you track enquiries and follow-ups today?
5. Which hurts more: answering enquiries, or collecting fees on time?
6. Would you pay Rs 999 a month if this brought two extra admissions a year?

If most owners say fee collection hurts more, pivot to the fee and attendance
tracker. The customers are the same, so this work carries over.

## Pricing to test

- Free setup for the first 2 to 3 centres, in exchange for feedback
- Then Rs 999 a month, with a monthly message cap
- Higher plan with WhatsApp once that exists

## Roadmap

| Stage | Goal | Done when |
| --- | --- | --- |
| 0 | Owner interviews | 5 conversations logged |
| 1 | Working prototype (this repo) | Bot answers from pasted content |
| 2 | First pilot centre | One real centre shares the chat link |
| 3 | Admin login, hosted deployment | Centre edits content without help |
| 4 | First paying centre | Rs 999 received |
| 5 | WhatsApp channel | Bot replies on the centre's WhatsApp number |

## Risks

- Wrong answers: mitigated by content-only answers and the callback fallback
- Easy to copy: the edge is the coaching niche setup and WhatsApp, not the AI
- Sales effort: owners will not find this in an app store; expect to call and
  visit the first ten yourself
- Free alternatives: WhatsApp Business quick replies cover a little of this,
  so the lead list and after-hours answers have to be the selling point

## Current status

- [x] Plan written
- [x] Backend: content storage, retrieval, chat endpoint, leads
- [x] Frontend: chat page and admin page
- [x] Owner login; each owner limited to their own centre
- [x] Per-visitor rate limits on chat, callbacks and login
- [x] Dockerfile for single-container deployment
- [x] Lead follow-up (contacted status, WhatsApp link, CSV export)
- [x] Owner insights: unanswered questions, answer rate, monthly usage
- [x] Owner preview, one-tap topic questions, embeddable chat
- [x] In-browser demo mode; CI for tests, builds and the Docker image
- [ ] First end-to-end run on a laptop with a real LLM
- [ ] Owner interviews
- [ ] Pick a host and deploy with HTTPS, a persistent volume and SECRET_KEY
- [ ] Connect a real LLM and compare its answers with mock mode
- [ ] First pilot centre
