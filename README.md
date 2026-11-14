# Coaching FAQ Bot

An AI enquiry assistant for coaching and tuition centres. The owner pastes in
the centre's details; the bot answers parent and student questions from that
content only, and captures a name and phone number when it cannot answer.

See [PLAN.md](PLAN.md) for the product plan, pricing and roadmap.

## Project layout

```
backend/   Python + FastAPI + SQLite
  app/retrieval.py   chunking and keyword search
  app/chat.py        answer-or-fallback logic, monthly message cap
  app/llm.py         OpenAI-compatible LLM client, plus a no-LLM mock mode
  app/store.py       SQLite storage
  app/main.py        HTTP routes
  tests/             pytest tests for the core logic
frontend/  React + Vite
  src/Admin.jsx      owner page: content editor, chat link, leads
  src/ChatWidget.jsx parent/student chat page
```

## Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload        # http://localhost:8000
```

It starts in mock mode, which needs no LLM: the bot replies with the best
matching piece of the centre's content. To use a real model, set the variables
shown in `backend/.env.example` (export them in your shell; the app does not
load `.env` files by itself).

## Run the frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Open `http://localhost:5173/#/admin`, add a centre, paste its content and save.
The page shows a chat link (`#/chat/<id>`) to share with parents.

## Tests

```bash
cd backend && python -m pytest -q
```

## Known gaps

- The `/api/admin` routes have no login yet. Run locally only; do not deploy
  publicly until authentication is added.
- The HTTP layer and the React app have not been run end to end yet; only the
  core Python logic is covered by tests.
- No rate limiting per visitor, only a monthly message cap per centre.
