"""FastAPI routes. Run with: uvicorn app.main:app --reload

NOTE: the /api/admin routes have no authentication yet. Run locally only.
"""
import os
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import chat
from .store import Store

app = FastAPI(title="Coaching FAQ Bot")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
store = Store(os.environ.get("DB_PATH", "faqbot.db"))


class CentreIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


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


def _centre_or_404(centre_id: int) -> dict:
    centre = store.get_centre(centre_id)
    if centre is None:
        raise HTTPException(404, "Centre not found")
    return centre


# admin (owner) ------------------------------------------------------------
@app.get("/api/admin/centres")
def list_centres():
    return store.list_centres()


@app.post("/api/admin/centres")
def create_centre(body: CentreIn):
    return {"id": store.create_centre(body.name.strip()), "name": body.name.strip()}


@app.get("/api/admin/centres/{centre_id}")
def get_centre(centre_id: int):
    return _centre_or_404(centre_id)


@app.put("/api/admin/centres/{centre_id}/content")
def put_content(centre_id: int, body: ContentIn):
    _centre_or_404(centre_id)
    return {"chunks": chat.save_content(store, centre_id, body.content)}


@app.get("/api/admin/centres/{centre_id}/leads")
def get_leads(centre_id: int):
    _centre_or_404(centre_id)
    return store.list_leads(centre_id)


# public (parents and students) --------------------------------------------
@app.get("/api/centres/{centre_id}")
def public_centre(centre_id: int):
    centre = _centre_or_404(centre_id)
    return {"id": centre["id"], "name": centre["name"]}


@app.post("/api/centres/{centre_id}/chat")
def post_chat(centre_id: int, body: ChatIn):
    _centre_or_404(centre_id)
    return chat.answer(store, centre_id, body.session_id, body.question.strip())


@app.post("/api/centres/{centre_id}/leads")
def post_lead(centre_id: int, body: LeadIn):
    _centre_or_404(centre_id)
    phone = re.sub(r"[\s\-()]", "", body.phone)
    if not re.fullmatch(r"\+?\d{7,15}", phone):
        raise HTTPException(422, "Enter a valid phone number")
    lead_id = store.add_lead(
        centre_id, body.session_id, body.name.strip(), phone, body.note.strip()
    )
    return {"id": lead_id}
