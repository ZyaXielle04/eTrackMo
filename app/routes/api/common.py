from datetime import date
from datetime import datetime
from decimal import Decimal
from decimal import InvalidOperation
import re
from uuid import uuid4

from firebase_admin import db

from app.security import clean_text


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
    "external_transfer",
}

TRANSACTION_CATEGORIES = {
    "expense": {
        "food",
        "transportation",
        "bills",
        "shopping",
        "health",
        "education",
        "entertainment",
        "family",
        "debt",
        "other_expense",
    },
    "income": {
        "salary",
        "business",
        "freelance",
        "allowance",
        "refund",
        "bonus",
        "other_income",
    },
    "transfer": {
        "savings",
        "cash_in",
        "cash_out",
        "account_transfer",
        "other_transfer",
    },
    "external_transfer": {
        "family",
        "remittance",
        "payment",
        "debt",
        "donation",
        "other_send",
    },
}

TEXT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .,'&()/_:+#-]*$")


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
        "fee": int(transaction.get("feeCents") or 0) / 100,
        "feeCents": int(transaction.get("feeCents") or 0),
        "kind": transaction.get("kind", "expense"),
        "occurredAt": transaction.get("occurredAt"),
        "occurredDate": transaction.get("occurredDate"),
        "occurredTime": transaction.get("occurredTime"),
        "recipient": transaction.get("recipient", ""),
        "transferId": transaction.get("transferId"),
        "createdAt": transaction.get("createdAt"),
    }


def parse_positive_amount_cents(value):
    amount_cents = parse_balance_cents(value)

    if amount_cents is None or amount_cents <= 0:
        return None

    return amount_cents


def parse_optional_fee_cents(value):
    if value in (None, ""):
        return 0

    fee_cents = parse_balance_cents(value)

    if fee_cents is None or fee_cents < 0 or fee_cents > 10000000:
        return None

    return fee_cents


def clean_finance_text(value, min_length=1, max_length=80):
    text = clean_text(value, min_length=min_length, max_length=max_length)

    if not text or not TEXT_PATTERN.fullmatch(text):
        return None

    return text


def clean_transaction_category(kind, value):
    category = clean_text(value, min_length=1, max_length=40)

    if not category:
        return None

    if category not in TRANSACTION_CATEGORIES.get(kind, set()):
        return None

    return category


def clean_transaction_date(value):
    text = clean_text(value, min_length=10, max_length=10)

    if not text:
        return None

    try:
        parsed_date = datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None

    if parsed_date > date.today():
        return None

    return text


def clean_transaction_time(value):
    text = clean_text(value, min_length=5, max_length=5)

    if not text:
        return None

    try:
        datetime.strptime(text, "%H:%M")
    except ValueError:
        return None

    return text


def clean_transaction_datetime(date_value, time_value):
    clean_date = clean_transaction_date(date_value)
    clean_time = clean_transaction_time(time_value)

    if not clean_date or not clean_time:
        return None

    occurred_datetime = datetime.strptime(
        f"{clean_date}T{clean_time}",
        "%Y-%m-%dT%H:%M",
    )

    if occurred_datetime > datetime.now():
        return None

    return {
        "date": clean_date,
        "datetime": f"{clean_date}T{clean_time}",
        "time": clean_time,
    }


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
    occurred_date=None,
    occurred_time=None,
    transfer_id=None,
    fee_cents=0,
    recipient="",
):
    transaction_id = uuid4().hex
    now = datetime.now()
    fallback_date = now.date().isoformat()
    fallback_time = now.strftime("%H:%M")
    fallback_datetime = f"{fallback_date}T{fallback_time}"

    transactions_ref(uid).child(transaction_id).set(
        {
            "accountId": account_id,
            "amountCents": amount_cents,
            "category": category,
            "currency": "PHP",
            "description": description,
            "feeCents": fee_cents,
            "kind": kind,
            "occurredAt": occurred_at or fallback_datetime,
            "occurredDate": occurred_date or fallback_date,
            "occurredTime": occurred_time or fallback_time,
            "recipient": recipient,
            "transferId": transfer_id,
            "createdAt": {".sv": "timestamp"},
        }
    )

    return transaction_id
