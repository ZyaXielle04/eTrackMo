from uuid import uuid4
import random
import string

from firebase_admin import db
from flask import jsonify

from app.routes.api import api
from app.routes.api.common import clean_finance_text
from app.security import clean_text
from app.security import firebase_auth_required
from app.security import get_json_payload
from app.security import json_error
from app.security import rate_limit
from app.security import write_audit_event


PERMISSION_KEYS = {
    "shareAccounts",
    "shareBalances",
    "shareTransactions",
}


def coops_ref(coop_id=None):
    path = "coops"

    if coop_id:
        path = f"{path}/{coop_id}"

    return db.reference(path)


def user_coops_ref(uid, coop_id=None):
    path = f"userCoops/{uid}"

    if coop_id:
        path = f"{path}/{coop_id}"

    return db.reference(path)


def invite_codes_ref(code=None):
    path = "coopInviteCodes"

    if code:
        path = f"{path}/{code}"

    return db.reference(path)


def normalize_permissions(value):
    permissions = value if isinstance(value, dict) else {}

    return {
        key: bool(permissions.get(key))
        for key in PERMISSION_KEYS
    }


def owner_permissions():
    return {
        key: True
        for key in PERMISSION_KEYS
    }


def public_user(decoded_token):
    return {
        "displayName": decoded_token.get("name")
        or decoded_token.get("email")
        or "Member",
        "email": decoded_token.get("email", ""),
        "uid": decoded_token["uid"],
    }


def generate_invite_code():
    alphabet = string.ascii_uppercase + string.digits

    for _ in range(12):
        code = "".join(random.choice(alphabet) for _ in range(8))

        if invite_codes_ref(code).get() is None:
            return code

    return uuid4().hex[:10].upper()


def clean_invite_code(value):
    code = str(value or "").strip().upper().replace("-", "")

    if len(code) < 6 or len(code) > 12 or not code.isalnum():
        return None

    return code


def get_member(coop, uid):
    members = coop.get("members") if isinstance(coop, dict) else {}

    if not isinstance(members, dict):
        return None

    member = members.get(uid)

    if not isinstance(member, dict):
        return None

    return member


def require_coop_member(coop_id, uid):
    coop = coops_ref(coop_id).get()

    if not isinstance(coop, dict):
        return None, None

    member = get_member(coop, uid)

    if not member:
        return coop, None

    return coop, member


def normalize_member(uid, member):
    return {
        "uid": uid,
        "displayName": member.get("displayName", "Member"),
        "email": member.get("email", ""),
        "permissions": normalize_permissions(member.get("permissions")),
        "role": member.get("role", "member"),
        "joinedAt": member.get("joinedAt"),
    }


def normalize_join_request(request_id, request_data):
    return {
        "id": request_id,
        "displayName": request_data.get("displayName", "Member"),
        "email": request_data.get("email", ""),
        "permissions": normalize_permissions(request_data.get("permissions")),
        "requestedAt": request_data.get("requestedAt"),
        "status": request_data.get("status", "pending"),
        "uid": request_data.get("uid", ""),
    }


def normalize_coop(coop_id, coop, include_details=False):
    members = coop.get("members") if isinstance(coop.get("members"), dict) else {}
    requests = (
        coop.get("joinRequests")
        if isinstance(coop.get("joinRequests"), dict)
        else {}
    )
    normalized = {
        "id": coop_id,
        "description": coop.get("description", ""),
        "inviteCode": coop.get("inviteCode", ""),
        "memberCount": len(members),
        "name": coop.get("name", "Coop"),
        "ownerId": coop.get("ownerId", ""),
        "pendingCount": len(
            [
                request
                for request in requests.values()
                if isinstance(request, dict)
                and request.get("status") == "pending"
            ]
        ),
        "createdAt": coop.get("createdAt"),
        "updatedAt": coop.get("updatedAt"),
    }

    if include_details:
        normalized["members"] = [
            normalize_member(uid, member)
            for uid, member in members.items()
            if isinstance(member, dict)
        ]
        normalized["joinRequests"] = [
            normalize_join_request(request_id, request_data)
            for request_id, request_data in requests.items()
            if isinstance(request_data, dict)
            and request_data.get("status") == "pending"
        ]

    return normalized


@api.get("/coops")
@rate_limit(max_requests=120, window_seconds=60)
@firebase_auth_required()
def list_coops(decoded_token):
    uid = decoded_token["uid"]
    memberships = user_coops_ref(uid).get() or {}
    coops = []

    for coop_id, membership in memberships.items():
        if not isinstance(membership, dict):
            continue

        coop = coops_ref(coop_id).get()

        if isinstance(coop, dict):
            normalized = normalize_coop(coop_id, coop)
            normalized["role"] = membership.get("role", "member")
            normalized["permissions"] = normalize_permissions(
                membership.get("permissions")
            )
            coops.append(normalized)

    coops.sort(key=lambda coop: (coop.get("createdAt") or 0, coop["name"]))

    return jsonify({"coops": coops})


@api.post("/coops")
@rate_limit(max_requests=12, window_seconds=60)
@firebase_auth_required()
def create_coop(decoded_token):
    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    name = clean_finance_text(payload.get("name"), min_length=2, max_length=60)
    description = clean_text(payload.get("description"), max_length=160) or ""

    if not name:
        return json_error("Please enter a valid Coop name.")

    uid = decoded_token["uid"]
    user = public_user(decoded_token)
    coop_id = uuid4().hex
    invite_code = generate_invite_code()
    permissions = owner_permissions()

    coop = {
        "name": name,
        "description": description,
        "inviteCode": invite_code,
        "ownerId": uid,
        "members": {
            uid: {
                **user,
                "role": "owner",
                "permissions": permissions,
                "joinedAt": {".sv": "timestamp"},
            }
        },
        "createdAt": {".sv": "timestamp"},
        "updatedAt": {".sv": "timestamp"},
    }

    coops_ref(coop_id).set(coop)
    invite_codes_ref(invite_code).set({"coopId": coop_id})
    user_coops_ref(uid, coop_id).set(
        {
            "name": name,
            "role": "owner",
            "permissions": permissions,
            "joinedAt": {".sv": "timestamp"},
        }
    )

    write_audit_event(uid, "coop.created", "coop", coop_id)

    saved_coop = coops_ref(coop_id).get() or coop

    return jsonify({"coop": normalize_coop(coop_id, saved_coop, True)}), 201


@api.get("/coops/<coop_id>")
@rate_limit(max_requests=120, window_seconds=60)
@firebase_auth_required()
def get_coop(decoded_token, coop_id):
    coop, member = require_coop_member(coop_id, decoded_token["uid"])

    if not isinstance(coop, dict) or not member:
        return json_error("Coop was not found.", 404)

    normalized = normalize_coop(coop_id, coop, True)
    normalized["role"] = member.get("role", "member")
    normalized["permissions"] = normalize_permissions(member.get("permissions"))

    return jsonify({"coop": normalized})


@api.post("/coops/join-requests")
@rate_limit(max_requests=20, window_seconds=60)
@firebase_auth_required()
def request_join_coop(decoded_token):
    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    invite_code = clean_invite_code(payload.get("inviteCode"))

    if not invite_code:
        return json_error("Please enter a valid invite code.")

    invite = invite_codes_ref(invite_code).get()

    if not isinstance(invite, dict):
        return json_error("Invite code was not found.", 404)

    coop_id = invite.get("coopId")
    coop = coops_ref(coop_id).get()

    if not isinstance(coop, dict):
        return json_error("Coop was not found.", 404)

    uid = decoded_token["uid"]

    if get_member(coop, uid):
        return json_error("You are already a member of this Coop.")

    requests = (
        coop.get("joinRequests")
        if isinstance(coop.get("joinRequests"), dict)
        else {}
    )

    for request_data in requests.values():
        if (
            isinstance(request_data, dict)
            and request_data.get("uid") == uid
            and request_data.get("status") == "pending"
        ):
            return json_error("You already have a pending request.")

    request_id = uuid4().hex
    user = public_user(decoded_token)
    permissions = normalize_permissions(payload.get("permissions"))

    coops_ref(coop_id).child("joinRequests").child(request_id).set(
        {
            **user,
            "permissions": permissions,
            "status": "pending",
            "requestedAt": {".sv": "timestamp"},
        }
    )
    coops_ref(coop_id).child("updatedAt").set({".sv": "timestamp"})

    write_audit_event(uid, "coop.join_requested", "coop", coop_id)

    return jsonify({"ok": True}), 201


@api.post("/coops/<coop_id>/join-requests/<request_id>/approve")
@rate_limit(max_requests=30, window_seconds=60)
@firebase_auth_required()
def approve_join_request(decoded_token, coop_id, request_id):
    return handle_join_request(decoded_token, coop_id, request_id, "approved")


@api.post("/coops/<coop_id>/join-requests/<request_id>/deny")
@rate_limit(max_requests=30, window_seconds=60)
@firebase_auth_required()
def deny_join_request(decoded_token, coop_id, request_id):
    return handle_join_request(decoded_token, coop_id, request_id, "denied")


def handle_join_request(decoded_token, coop_id, request_id, decision):
    uid = decoded_token["uid"]
    coop, member = require_coop_member(coop_id, uid)

    if not isinstance(coop, dict) or not member:
        return json_error("Coop was not found.", 404)

    if member.get("role") != "owner":
        return json_error("Only the Coop owner can manage requests.", 403)

    request_ref = coops_ref(coop_id).child("joinRequests").child(request_id)
    request_data = request_ref.get()

    if not isinstance(request_data, dict) or request_data.get("status") != "pending":
        return json_error("Join request was not found.", 404)

    request_ref.child("status").set(decision)
    request_ref.child("decidedAt").set({".sv": "timestamp"})
    request_ref.child("decidedBy").set(uid)

    if decision == "approved":
        member_uid = request_data["uid"]
        permissions = normalize_permissions(request_data.get("permissions"))
        member_data = {
            "uid": member_uid,
            "displayName": request_data.get("displayName", "Member"),
            "email": request_data.get("email", ""),
            "role": "member",
            "permissions": permissions,
            "joinedAt": {".sv": "timestamp"},
        }

        coops_ref(coop_id).child("members").child(member_uid).set(member_data)
        user_coops_ref(member_uid, coop_id).set(
            {
                "name": coop.get("name", "Coop"),
                "role": "member",
                "permissions": permissions,
                "joinedAt": {".sv": "timestamp"},
            }
        )

    coops_ref(coop_id).child("updatedAt").set({".sv": "timestamp"})

    write_audit_event(
        uid,
        f"coop.join_{decision}",
        "coop",
        coop_id,
        {"requestId": request_id},
    )

    return jsonify({"ok": True})


@api.patch("/coops/<coop_id>/permissions")
@rate_limit(max_requests=30, window_seconds=60)
@firebase_auth_required()
def update_own_permissions(decoded_token, coop_id):
    payload = get_json_payload()

    if payload is None:
        return json_error("Request must be JSON.", 415)

    uid = decoded_token["uid"]
    coop, member = require_coop_member(coop_id, uid)

    if not isinstance(coop, dict) or not member:
        return json_error("Coop was not found.", 404)

    permissions = normalize_permissions(payload.get("permissions"))

    coops_ref(coop_id).child("members").child(uid).child("permissions").set(
        permissions
    )
    user_coops_ref(uid, coop_id).child("permissions").set(permissions)
    coops_ref(coop_id).child("updatedAt").set({".sv": "timestamp"})

    write_audit_event(uid, "coop.permissions_updated", "coop", coop_id)

    return jsonify({"permissions": permissions})
