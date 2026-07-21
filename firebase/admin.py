import json

import firebase_admin

from pathlib import Path

from firebase_admin import credentials
from firebase_admin import db


def get_firebase_credential(credentials_path=None, service_account_json=None):
    if service_account_json:
        try:
            service_account = json.loads(service_account_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "Firebase service account JSON is invalid."
            ) from exc

        return credentials.Certificate(service_account)

    if not credentials_path:
        raise RuntimeError(
            "Firebase Admin credentials were not configured."
        )

    credential_file = Path(credentials_path).expanduser()

    if not credential_file.is_file():
        raise RuntimeError("Firebase Admin credential file was not found.")

    return credentials.Certificate(str(credential_file))


def initialize_firebase(
    credentials_path,
    database_url,
    service_account_json=None,
):

    if not firebase_admin._apps:
        cred = get_firebase_credential(
            credentials_path,
            service_account_json,
        )

        firebase_admin.initialize_app(
            cred,
            {
                "databaseURL": database_url
            }
        )

    return firebase_admin.get_app()
