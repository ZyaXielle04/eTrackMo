from uuid import uuid4

from flask import jsonify

from app.routes.api import api
from app.routes.api.common import ACCOUNT_ID_PATTERN
from app.routes.api.common import ACCOUNT_TYPES
from app.routes.api.common import account_ref
from app.routes.api.common import normalize_account
from app.routes.api.common import parse_balance_cents
from app.routes.api.common import write_transaction
from app.security import clean_text
from app.security import firebase_auth_required
from app.security import get_json_payload
from app.security import json_error
from app.security import rate_limit
from app.security import write_audit_event


@api.get("/accounts")
@rate_limit(max_requests=120, window_seconds=60)
@firebase_auth_required()
def list_accounts(decoded_token):
    uid = decoded_token["uid"]
    accounts = account_ref(uid).get() or {}

    normalized_accounts = [
        normalize_account(account_id, account)
        for account_id, account in accounts.items()
        if isinstance(account, dict)
    ]

    normalized_accounts.sort(
        key=lambda account: (account.get("createdAt") or 0, account["name"])
    )

    return jsonify({"accounts": normalized_accounts})


@api.post("/accounts")
@rate_limit(max_requests=30, window_seconds=60)
@firebase_auth_required()
def create_account(decoded_token):
    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    name = clean_text(payload.get("name"), min_length=2, max_length=60)
    account_type = clean_text(payload.get("type"), max_length=20)
    institution = clean_text(payload.get("institution"), max_length=80) or ""
    notes = clean_text(payload.get("notes"), max_length=180) or ""
    balance_cents = parse_balance_cents(payload.get("balance", 0))

    if not name:
        return json_error("Please enter a valid account name.")

    if account_type not in ACCOUNT_TYPES:
        return json_error("Please choose a valid account type.")

    if balance_cents is None:
        return json_error("Please enter a valid balance.")

    uid = decoded_token["uid"]
    account_id = uuid4().hex

    account = {
        "name": name,
        "type": account_type,
        "institution": institution,
        "currency": "PHP",
        "balanceCents": balance_cents,
        "notes": notes,
        "createdAt": {".sv": "timestamp"},
        "updatedAt": {".sv": "timestamp"},
    }

    account_ref(uid, account_id).set(account)

    if balance_cents:
        write_transaction(
            uid,
            account_id,
            balance_cents,
            f"Starting balance for {name}",
            "opening_balance",
        )

    write_audit_event(
        uid,
        "account.created",
        "account",
        account_id,
        {"type": account_type},
    )

    saved_account = account_ref(uid, account_id).get() or account

    return jsonify(
        {
            "account": normalize_account(account_id, saved_account)
        }
    ), 201


@api.patch("/accounts/<account_id>")
@rate_limit(max_requests=30, window_seconds=60)
@firebase_auth_required()
def update_account(decoded_token, account_id):
    if not ACCOUNT_ID_PATTERN.fullmatch(account_id):
        return json_error("Account was not found.", 404)

    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    uid = decoded_token["uid"]
    ref = account_ref(uid, account_id)
    existing_account = ref.get()

    if not isinstance(existing_account, dict):
        return json_error("Account was not found.", 404)

    name = clean_text(payload.get("name"), min_length=2, max_length=60)
    account_type = clean_text(payload.get("type"), max_length=20)
    institution = clean_text(payload.get("institution"), max_length=80) or ""
    notes = clean_text(payload.get("notes"), max_length=180) or ""
    balance_cents = parse_balance_cents(payload.get("balance", 0))

    if not name:
        return json_error("Please enter a valid account name.")

    if account_type not in ACCOUNT_TYPES:
        return json_error("Please choose a valid account type.")

    if balance_cents is None:
        return json_error("Please enter a valid balance.")

    previous_balance_cents = int(existing_account.get("balanceCents") or 0)
    balance_difference = balance_cents - previous_balance_cents

    ref.update(
        {
            "name": name,
            "type": account_type,
            "institution": institution,
            "balanceCents": balance_cents,
            "notes": notes,
            "updatedAt": {".sv": "timestamp"},
        }
    )

    if balance_difference:
        write_transaction(
            uid,
            account_id,
            balance_difference,
            f"Balance adjustment for {name}",
            "balance_adjustment",
        )

    write_audit_event(
        uid,
        "account.updated",
        "account",
        account_id,
        {"balanceChanged": bool(balance_difference), "type": account_type},
    )

    saved_account = ref.get() or {}

    return jsonify(
        {
            "account": normalize_account(account_id, saved_account)
        }
    )


@api.delete("/accounts/<account_id>")
@rate_limit(max_requests=20, window_seconds=60)
@firebase_auth_required()
def delete_account(decoded_token, account_id):
    if not ACCOUNT_ID_PATTERN.fullmatch(account_id):
        return json_error("Account was not found.", 404)

    uid = decoded_token["uid"]
    ref = account_ref(uid, account_id)
    existing_account = ref.get()

    if not isinstance(existing_account, dict):
        return json_error("Account was not found.", 404)

    ref.delete()

    write_transaction(
        uid,
        account_id,
        0,
        f"Deleted account {existing_account.get('name', 'Account')}",
        "account_deleted",
    )

    write_audit_event(
        uid,
        "account.deleted",
        "account",
        account_id,
    )

    return jsonify({"ok": True})
