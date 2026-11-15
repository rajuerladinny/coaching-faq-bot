"""HTTP route tests. They need FastAPI's test client (see requirements-dev.txt)."""
import itertools
import os

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

# The app reads these when it is imported, so set them first.
os.environ["DB_PATH"] = ":memory:"
os.environ["SECRET_KEY"] = "test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app import chat, main, manage  # noqa: E402

CONTENT = """Fees: JEE foundation batch costs Rs 45,000 per year.

Timings: Morning batch runs 7am to 9am. Evening batch runs 5pm to 8pm.

Demo class: We offer two free demo classes before admission."""
_emails = (f"owner{n}@example.com" for n in itertools.count(1))


@pytest.fixture()
def client():
    for limiter in (
        main.chat_limiter,
        main.lead_limiter,
        main.login_limiter,
        main.preview_limiter,
    ):
        limiter.hits.clear()
    return TestClient(main.app)


def new_owner(client, name="Bright Academy"):
    """Create a centre and return (centre id, auth headers)."""
    email = next(_emails)
    centre_id = manage.create_centre(main.store, name, email, "password123")
    res = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert res.status_code == 200
    return centre_id, {"Authorization": f"Bearer {res.json()['token']}"}


def test_login_and_owner_only_routes(client):
    centre_id, headers = new_owner(client)
    assert client.get("/api/admin/centre", headers=headers).json()["id"] == centre_id
    assert client.get("/api/admin/centre").status_code == 401
    bad = {"Authorization": "Bearer not-a-token"}
    assert client.get("/api/admin/leads", headers=bad).status_code == 401
    wrong = client.post(
        "/api/auth/login", json={"email": "owner1@example.com", "password": "nope"}
    )
    assert wrong.status_code == 401


def test_content_chat_lead_and_follow_up_flow(client):
    centre_id, headers = new_owner(client)
    saved = client.put("/api/admin/content", json={"content": CONTENT}, headers=headers)
    assert saved.json() == {"chunks": 1}

    public = client.get(f"/api/centres/{centre_id}").json()
    assert public == {
        "id": centre_id,
        "name": "Bright Academy",
        "topics": ["Fees", "Timings", "Demo class"],
    }

    chat_url = f"/api/centres/{centre_id}/chat"
    answered = client.post(chat_url, json={"session_id": "s1", "question": "Any demo class?"})
    assert answered.json()["answered"] is True
    missed = client.post(chat_url, json={"session_id": "s1", "question": "Is there a hostel?"})
    assert missed.json() == {"answer": chat.FALLBACK, "answered": False}

    lead = client.post(
        f"/api/centres/{centre_id}/leads",
        json={"session_id": "s1", "name": " Anita ", "phone": "+91 98765-43210"},
    )
    lead_id = lead.json()["id"]
    leads = client.get("/api/admin/leads", headers=headers).json()
    assert leads[0]["name"] == "Anita"
    assert leads[0]["phone"] == "+919876543210"
    assert leads[0]["status"] == "new"
    assert leads[0]["questions"] == ["Any demo class?", "Is there a hostel?"]

    done = client.patch(
        f"/api/admin/leads/{lead_id}", json={"status": "contacted"}, headers=headers
    )
    assert done.json() == {"id": lead_id, "status": "contacted"}
    invalid = client.patch(
        f"/api/admin/leads/{lead_id}", json={"status": "deleted"}, headers=headers
    )
    assert invalid.status_code == 422

    stats = client.get("/api/admin/stats", headers=headers).json()
    assert stats["messages_this_month"] == 2
    assert stats["answered_this_month"] == 1
    assert (stats["leads_total"], stats["leads_new"]) == (1, 0)
    assert stats["unanswered"][0]["question"] == "Is there a hostel?"


def test_owners_cannot_touch_another_centres_leads(client):
    centre_id, _ = new_owner(client)
    _, other_headers = new_owner(client, "Other Centre")
    lead_id = client.post(
        f"/api/centres/{centre_id}/leads",
        json={"session_id": "s1", "name": "Ravi", "phone": "9876543210"},
    ).json()["id"]
    assert client.get("/api/admin/leads", headers=other_headers).json() == []
    stolen = client.patch(
        f"/api/admin/leads/{lead_id}", json={"status": "contacted"}, headers=other_headers
    )
    assert stolen.status_code == 404


def test_preview_does_not_count_as_a_parent_message(client):
    _, headers = new_owner(client)
    client.put("/api/admin/content", json={"content": CONTENT}, headers=headers)
    res = client.post("/api/admin/preview", json={"question": "Fees?"}, headers=headers)
    assert res.json()["answered"] is True
    assert client.get("/api/admin/stats", headers=headers).json()["messages_this_month"] == 0
    assert client.post("/api/admin/preview", json={"question": "Fees?"}).status_code == 401


def test_validation_and_unknown_centres(client):
    centre_id, _ = new_owner(client)
    bad_phone = client.post(
        f"/api/centres/{centre_id}/leads",
        json={"session_id": "s1", "name": "Ravi", "phone": "call me maybe"},
    )
    assert bad_phone.status_code == 422
    assert client.get("/api/centres/999999").status_code == 404
    empty = client.post(
        f"/api/centres/{centre_id}/chat", json={"session_id": "s1", "question": ""}
    )
    assert empty.status_code == 422


def test_rate_limits(client, monkeypatch):
    centre_id, _ = new_owner(client)
    monkeypatch.setattr(main.chat_limiter, "limit", 1)
    chat_url = f"/api/centres/{centre_id}/chat"
    client.post(chat_url, json={"session_id": "s1", "question": "Fees?"})
    slowed = client.post(chat_url, json={"session_id": "s1", "question": "Fees?"})
    assert slowed.json() == {"answer": chat.SLOW_DOWN, "answered": False}

    monkeypatch.setattr(main.login_limiter, "limit", 0)
    blocked = client.post(
        "/api/auth/login", json={"email": "a@example.com", "password": "x"}
    )
    assert blocked.status_code == 429


def test_security_headers_and_health(client):
    res = client.get("/api/health")
    assert res.json() == {"ok": True}
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["referrer-policy"] == "strict-origin-when-cross-origin"
