from decimal import Decimal
from decimal import InvalidOperation
import re
from datetime import date
from datetime import datetime
from uuid import uuid4

from firebase_admin import db
from flask import Blueprint
from flask import jsonify

from app.security import clean_text
from app.security import firebase_auth_required
from app.security import get_json_payload
from app.security import json_error
from app.security import rate_limit
from app.security import write_audit_event


api = Blueprint("api", __name__, url_prefix="/api")

ACCOUNT_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")

ACCOUNT_TYPES = {
    "cash",
    "gcash",
    "maya",
    "bank",
    "custom",
}

TRANSACTION_KINDS = {
    "income",
    "expense",
    "transfer",
}


def parse_balance_cents(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return None

    if amount < Decimal("-999999999.99") or amount > Decimal("999999999.99"):
        return None

    return int(amount * 100)


def account_ref(uid, account_id=None):
    path = f"accounts/{uid}"

    if account_id:
        path = f"{path}/{account_id}"

    return db.reference(path)


def transactions_ref(uid):
    return db.reference(f"transactions/{uid}")


def is_valid_account_id(account_id):
    return bool(ACCOUNT_ID_PATTERN.fullmatch(str(account_id or "")))


def normalize_account(account_id, account):
    balance_cents = int(account.get("balanceCents") or 0)

    return {
        "id": account_id,
        "name": account.get("name", ""),
        "type": account.get("type", "custom"),
        "institution": account.get("institution", ""),
        "currency": account.get("currency", "PHP"),
        "balanceCents": balance_cents,
        "balance": balance_cents / 100,
        "notes": account.get("notes", ""),
        "createdAt": account.get("createdAt"),
        "updatedAt": account.get("updatedAt"),
    }


def normalize_transaction(transaction_id, transaction, account_names=None):
    account_names = account_names or {}
    amount_cents = int(transaction.get("amountCents") or 0)
    account_id = transaction.get("accountId", "")

    return {
        "id": transaction_id,
        "accountId": account_id,
        "accountName": account_names.get(account_id, "Account"),
        "amount": amount_cents / 100,
        "amountCents": amount_cents,
        "category": transaction.get("category", ""),
        "currency": transaction.get("currency", "PHP"),
        "description": transaction.get("description", ""),
        "kind": transaction.get("kind", "expense"),
        "occurredAt": transaction.get("occurredAt"),
        "transferId": transaction.get("transferId"),
        "createdAt": transaction.get("createdAt"),
    }


def parse_positive_amount_cents(value):
    amount_cents = parse_balance_cents(value)

    if amount_cents is None or amount_cents <= 0:
        return None

    return amount_cents


def clean_transaction_date(value):
    if not value:
        return date.today().isoformat()

    text = clean_text(value, min_length=10, max_length=10)

    if not text:
        return None

    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None

    return text


def adjust_account_balance(uid, account_id, amount_cents):
    balance_ref = account_ref(uid, account_id).child("balanceCents")

    def update_balance(current_balance):
        return int(current_balance or 0) + amount_cents

    balance_ref.transaction(update_balance)
    account_ref(uid, account_id).child("updatedAt").set({".sv": "timestamp"})


def write_transaction(
    uid,
    account_id,
    amount_cents,
    description,
    kind,
    category="",
    occurred_at=None,
    transfer_id=None,
):
    transaction_id = uuid4().hex

    transactions_ref(uid).child(transaction_id).set(
        {
            "accountId": account_id,
            "amountCents": amount_cents,
            "category": category,
            "currency": "PHP",
            "description": description,
            "kind": kind,
            "occurredAt": occurred_at or date.today().isoformat(),
            "transferId": transfer_id,
            "createdAt": {".sv": "timestamp"},
        }
    )

    return transaction_id


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


@api.get("/transactions")
@rate_limit(max_requests=120, window_seconds=60)
@firebase_auth_required()
def list_transactions(decoded_token):
    uid = decoded_token["uid"]
    accounts = account_ref(uid).get() or {}
    transactions = transactions_ref(uid).get() or {}

    account_names = {
        account_id: account.get("name", "Account")
        for account_id, account in accounts.items()
        if isinstance(account, dict)
    }

    normalized_transactions = [
        normalize_transaction(transaction_id, transaction, account_names)
        for transaction_id, transaction in transactions.items()
        if isinstance(transaction, dict)
    ]

    normalized_transactions.sort(
        key=lambda transaction: (
            transaction.get("occurredAt") or "",
            transaction.get("createdAt") or 0,
        ),
        reverse=True,
    )

    return jsonify(
        {
            "transactions": normalized_transactions[:200],
        }
    )


@api.post("/transactions")
@rate_limit(max_requests=40, window_seconds=60)
@firebase_auth_required()
def create_transaction(decoded_token):
    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    uid = decoded_token["uid"]
    kind = clean_text(payload.get("kind"), max_length=20)
    account_id = clean_text(payload.get("accountId"), min_length=32, max_length=32)
    to_account_id = clean_text(
        payload.get("toAccountId"),
        min_length=32,
        max_length=32,
    )
    description = clean_text(payload.get("description"), min_length=2, max_length=120)
    category = clean_text(payload.get("category"), max_length=40) or ""
    amount_cents = parse_positive_amount_cents(payload.get("amount"))
    occurred_at = clean_transaction_date(payload.get("occurredAt"))

    if kind not in TRANSACTION_KINDS:
        return json_error("Please choose a valid transaction type.")

    if not is_valid_account_id(account_id):
        return json_error("Please choose a valid account.")

    if amount_cents is None:
        return json_error("Please enter a valid amount.")

    if not description:
        return json_error("Please enter a valid description.")

    if not occurred_at:
        return json_error("Please enter a valid date.")

    source_account = account_ref(uid, account_id).get()

    if not isinstance(source_account, dict):
        return json_error("Account was not found.", 404)

    transaction_ids = []

    if kind == "transfer":
        if not is_valid_account_id(to_account_id) or to_account_id == account_id:
            return json_error("Please choose a different destination account.")

        destination_account = account_ref(uid, to_account_id).get()

        if not isinstance(destination_account, dict):
            return json_error("Destination account was not found.", 404)

        transfer_id = uuid4().hex
        source_name = source_account.get("name", "Account")
        destination_name = destination_account.get("name", "Account")

        adjust_account_balance(uid, account_id, -amount_cents)
        adjust_account_balance(uid, to_account_id, amount_cents)

        transaction_ids.append(
            write_transaction(
                uid,
                account_id,
                -amount_cents,
                f"Transfer to {destination_name}: {description}",
                "transfer",
                category,
                occurred_at,
                transfer_id,
            )
        )
        transaction_ids.append(
            write_transaction(
                uid,
                to_account_id,
                amount_cents,
                f"Transfer from {source_name}: {description}",
                "transfer",
                category,
                occurred_at,
                transfer_id,
            )
        )
    else:
        signed_amount_cents = amount_cents if kind == "income" else -amount_cents

        adjust_account_balance(uid, account_id, signed_amount_cents)

        transaction_ids.append(
            write_transaction(
                uid,
                account_id,
                signed_amount_cents,
                description,
                kind,
                category,
                occurred_at,
            )
        )

    write_audit_event(
        uid,
        "transaction.created",
        "transaction",
        transaction_ids[0],
        {
            "kind": kind,
            "transactionCount": len(transaction_ids),
        },
    )

    return jsonify(
        {
            "ok": True,
            "transactionIds": transaction_ids,
        }
    ), 201
