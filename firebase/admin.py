import firebase_admin

from pathlib import Path

from firebase_admin import credentials
from firebase_admin import db


def initialize_firebase(credentials_path, database_url):
    credential_file = Path(credentials_path).expanduser()

    if not credential_file.is_file():
        raise RuntimeError("Firebase Admin credential file was not found.")

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(credential_file))

        firebase_admin.initialize_app(
            cred,
            {
                "databaseURL": database_url
            }
        )

    return firebase_admin.get_app()
