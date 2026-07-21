from firebase_admin import db
from flask import jsonify

from app.routes.api import api
from app.security import clean_text
from app.security import firebase_auth_required
from app.security import get_json_payload
from app.security import json_error
from app.security import rate_limit
from app.security import write_audit_event


@api.post("/auth/register-profile")
@rate_limit(max_requests=10, window_seconds=60)
@firebase_auth_required(require_verified_email=False)
def create_register_profile(decoded_token):
    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    display_name = clean_text(
        payload.get("displayName") or decoded_token.get("name"),
        min_length=2,
        max_length=80,
    )
    email = clean_text(
        decoded_token.get("email"),
        min_length=3,
        max_length=254,
    )

    if not display_name or not email:
        return json_error("Unable to create profile.", 400)

    uid = decoded_token["uid"]
    user_ref = db.reference(f"users/{uid}")
    existing_user = user_ref.get()

    if isinstance(existing_user, dict):
        user_ref.update(
            {
                "profile/displayName": display_name,
                "profile/email": email,
                "profile/photoURL": decoded_token.get("picture"),
                "profile/updatedAt": {".sv": "timestamp"},
            }
        )
    else:
        user_ref.set(
            {
                "profile": {
                    "displayName": display_name,
                    "email": email,
                    "photoURL": decoded_token.get("picture"),
                    "createdAt": {".sv": "timestamp"},
                    "updatedAt": {".sv": "timestamp"},
                },
                "preferences": {
                    "currency": "PHP",
                    "timezone": "Asia/Manila",
                    "notifications": {
                        "email": True,
                        "product": True,
                        "security": True,
                    },
                },
                "stats": {
                    "totalAccounts": 0,
                    "totalGroups": 0,
                    "totalTransactions": 0,
                },
            }
        )

    write_audit_event(
        uid,
        "profile.registered",
        "user",
        uid,
        {"emailVerified": bool(decoded_token.get("email_verified"))},
    )

    return jsonify({"ok": True})
