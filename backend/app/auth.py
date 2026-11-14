"""Password hashing and signed login tokens. Standard library only."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

TOKEN_TTL_SECONDS = 7 * 24 * 3600


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        scheme, salt_hex, digest_hex = (stored or "").split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1
        )
        return hmac.compare_digest(digest, bytes.fromhex(digest_hex))
    except ValueError:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str, secret: str) -> str:
    return _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())


def make_token(centre_id: int, secret: str, now: float | None = None) -> str:
    now = time.time() if now is None else now
    payload = _b64(
        json.dumps({"cid": centre_id, "exp": int(now) + TOKEN_TTL_SECONDS}).encode()
    )
    return f"{payload}.{_sign(payload, secret)}"


def read_token(token: str, secret: str, now: float | None = None) -> int | None:
    """Return the centre id, or None if the token is invalid or expired."""
    now = time.time() if now is None else now
    try:
        payload, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(payload, secret)):
            return None
        data = json.loads(_unb64(payload))
        if data["exp"] < now:
            return None
        return int(data["cid"])
    except (ValueError, KeyError, TypeError):
        return None


def load_secret() -> str:
    """SECRET_KEY from the environment, or a random one for local runs.

    With a random key, owners are logged out whenever the server restarts,
    so always set SECRET_KEY when deploying.
    """
    return os.environ.get("SECRET_KEY") or secrets.token_hex(32)
