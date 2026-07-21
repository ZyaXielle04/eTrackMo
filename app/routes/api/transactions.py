from uuid import uuid4

from flask import jsonify

from app.routes.api import api
from app.routes.api.common import TRANSACTION_KINDS
from app.routes.api.common import account_ref
from app.routes.api.common import adjust_account_balance
from app.routes.api.common import clean_finance_text
from app.routes.api.common import clean_transaction_category
from app.routes.api.common import clean_transaction_datetime
from app.routes.api.common import is_valid_account_id
from app.routes.api.common import normalize_transaction
from app.routes.api.common import parse_optional_fee_cents
from app.routes.api.common import parse_positive_amount_cents
from app.routes.api.common import transactions_ref
from app.routes.api.common import write_transaction
from app.security import clean_text
from app.security import firebase_auth_required
from app.security import get_json_payload
from app.security import json_error
from app.security import rate_limit
from app.security import write_audit_event


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
    description = clean_finance_text(
        payload.get("description"),
        min_length=2,
        max_length=120,
    )
    recipient = clean_finance_text(payload.get("recipient"), max_length=80) or ""
    amount_cents = parse_positive_amount_cents(payload.get("amount"))
    fee_cents = parse_optional_fee_cents(payload.get("fee"))
    occurred = clean_transaction_datetime(
        payload.get("occurredAt"),
        payload.get("occurredTime"),
    )

    if kind not in TRANSACTION_KINDS:
        return json_error("Please choose a valid transaction type.")

    category = clean_transaction_category(kind, payload.get("category"))

    if not category:
        return json_error("Please choose a valid category.")

    if not is_valid_account_id(account_id):
        return json_error("Please choose a valid account.")

    if amount_cents is None:
        return json_error("Please enter a valid amount.")

    if fee_cents is None:
        return json_error("Please enter a valid transaction fee.")

    if not description:
        return json_error(
            "Use normal letters, numbers, and punctuation for the description."
        )

    if kind == "external_transfer" and not recipient:
        return json_error("Please enter a valid recipient.")

    if not occurred:
        return json_error(
            "Please enter a valid date and time that are not in the future."
        )

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

        adjust_account_balance(uid, account_id, -(amount_cents + fee_cents))
        adjust_account_balance(uid, to_account_id, amount_cents)

        transaction_ids.append(
            write_transaction(
                uid,
                account_id,
                -amount_cents,
                f"Transfer to {destination_name}: {description}",
                "transfer",
                category,
                occurred["datetime"],
                occurred["date"],
                occurred["time"],
                transfer_id,
                fee_cents,
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
                occurred["datetime"],
                occurred["date"],
                occurred["time"],
                transfer_id,
            )
        )
    elif kind == "external_transfer":
        adjust_account_balance(uid, account_id, -(amount_cents + fee_cents))

        transaction_ids.append(
            write_transaction(
                uid,
                account_id,
                -amount_cents,
                f"Sent to {recipient}: {description}",
                "external_transfer",
                category,
                occurred["datetime"],
                occurred["date"],
                occurred["time"],
                None,
                fee_cents,
                recipient,
            )
        )
    else:
        if fee_cents:
            return json_error("Transaction fees are only available for transfers.")

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
                occurred["datetime"],
                occurred["date"],
                occurred["time"],
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
