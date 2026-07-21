from collections import defaultdict
from collections import deque
from functools import wraps
from time import monotonic
from uuid import uuid4

from firebase_admin import auth as firebase_auth
from firebase_admin import db
from flask import jsonify
from flask import request


_rate_limit_events = defaultdict(deque)


def json_error(message, status_code=400):
    return jsonify({"error": message}), status_code


def get_json_payload():
    if not request.is_json:
        return None

    return request.get_json(silent=True) or {}


def verify_firebase_request_user(require_verified_email=True):
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return None

    id_token = auth_header.removeprefix("Bearer ").strip()

    if not id_token:
        return None

    try:
        decoded_token = firebase_auth.verify_id_token(
            id_token,
            check_revoked=True,
        )
    except Exception:
        return None

    if require_verified_email and not decoded_token.get("email_verified"):
        return None

    return decoded_token


def firebase_auth_required(require_verified_email=True):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            decoded_token = verify_firebase_request_user(
                require_verified_email=require_verified_email,
            )

            if not decoded_token:
                return json_error("Unauthorized.", 401)

            return view(decoded_token, *args, **kwargs)

        return wrapped

    return decorator


def rate_limit(max_requests, window_seconds):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            key = request.remote_addr or "unknown"
            bucket = f"{key}:{request.endpoint}"
            now = monotonic()
            events = _rate_limit_events[bucket]

            while events and events[0] <= now - window_seconds:
                events.popleft()

            if len(events) >= max_requests:
                return json_error("Too many requests. Please try again soon.", 429)

            events.append(now)

            return view(*args, **kwargs)

        return wrapped

    return decorator


def clean_text(value, min_length=1, max_length=80):
    text = str(value or "").strip()
    text = " ".join(text.split())

    if len(text) < min_length or len(text) > max_length:
        return None

    return text


def write_audit_event(uid, action, resource_type, resource_id=None, metadata=None):
    event_id = uuid4().hex

    db.reference(f"auditLogs/{uid}/{event_id}").set(
        {
            "action": action,
            "resourceId": resource_id,
            "resourceType": resource_type,
            "metadata": metadata or {},
            "createdAt": {".sv": "timestamp"},
        }
    )
