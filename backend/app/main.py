"""FastAPI routes. Run with: uvicorn app.main:app --reload

Owners log in with the email and password set through `python -m app.manage`.
Every /api/admin route works only on the logged-in owner's own centre.
"""
import os
import re
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, chat
from .ratelimit import RateLimiter
from .store import Store

app = FastAPI(title="Coaching FAQ Bot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
store = Store(os.environ.get("DB_PATH", "faqbot.db"))
SECRET = auth.load_secret()

# Per visitor (IP address): chat messages, lead forms, and login attempts.
chat_limiter = RateLimiter(int(os.environ.get("CHAT_LIMIT", "20")), 600)
lead_limiter = RateLimiter(5, 3600)
login_limiter = RateLimiter(10, 900)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class ContentIn(BaseModel):
    content: str = Field(max_length=50_000)


class ChatIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=1, max_length=500)


class LeadIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=7, max_length=20)
    note: str = Field(default="", max_length=300)


def client_ip(request: Request) -> str:
    """Visitor address. Behind a reverse proxy, set TRUST_PROXY=1 so the
    address the proxy forwards is used instead of the proxy's own."""
    if os.environ.get("TRUST_PROXY") == "1":
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def current_centre(authorization: str = Header(default="")) -> dict:
    scheme, _, token = authorization.partition(" ")
    centre_id = auth.read_token(token, SECRET) if scheme.lower() == "bearer" else None
    centre = store.get_centre(centre_id) if centre_id is not None else None
    if centre is None:
        raise HTTPException(401, "Please log in again")
    return centre


def _centre_or_404(centre_id: int) -> dict:
    centre = store.get_centre(centre_id)
    if centre is None:
        raise HTTPException(404, "Centre not found")
    return centre


# owner --------------------------------------------------------------------
@app.post("/api/auth/login")
def login(body: LoginIn, request: Request):
    if not login_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    centre = store.get_centre_by_email(body.email)
    stored = centre["password_hash"] if centre else None
    if not auth.verify_password(body.password, stored):
        raise HTTPException(401, "Wrong email or password")
    return {"token": auth.make_token(centre["id"], SECRET), "name": centre["name"]}


@app.get("/api/admin/centre")
def my_centre(centre: dict = Depends(current_centre)):
    return {"id": centre["id"], "name": centre["name"], "content": centre["content"]}


@app.put("/api/admin/content")
def put_content(body: ContentIn, centre: dict = Depends(current_centre)):
    return {"chunks": chat.save_content(store, centre["id"], body.content)}


@app.get("/api/admin/leads")
def get_leads(centre: dict = Depends(current_centre)):
    return store.list_leads(centre["id"])


# public (parents and students) --------------------------------------------
@app.get("/api/centres/{centre_id}")
def public_centre(centre_id: int):
    centre = _centre_or_404(centre_id)
    return {"id": centre["id"], "name": centre["name"]}


@app.post("/api/centres/{centre_id}/chat")
def post_chat(centre_id: int, body: ChatIn, request: Request):
    _centre_or_404(centre_id)
    if not chat_limiter.allow(client_ip(request)):
        return {"answer": chat.SLOW_DOWN, "answered": False}
    return chat.answer(store, centre_id, body.session_id, body.question.strip())


@app.post("/api/centres/{centre_id}/leads")
def post_lead(centre_id: int, body: LeadIn, request: Request):
    _centre_or_404(centre_id)
    if not lead_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many requests. Please try again later.")
    phone = re.sub(r"[\s\-()]", "", body.phone)
    if not re.fullmatch(r"\+?\d{7,15}", phone):
        raise HTTPException(422, "Enter a valid phone number")
    lead_id = store.add_lead(
        centre_id, body.session_id, body.name.strip(), phone, body.note.strip()
    )
    return {"id": lead_id}


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the built React app when it exists (single-container deployment).
# Registered last so it never shadows the /api routes above.
_static = Path(os.environ.get("STATIC_DIR", Path(__file__).parents[2] / "frontend" / "dist"))
if _static.is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="frontend")
