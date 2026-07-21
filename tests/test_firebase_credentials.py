import json
import unittest
from unittest import mock

from firebase.admin import get_firebase_credential


class FirebaseCredentialTests(unittest.TestCase):
    @mock.patch("firebase.admin.credentials.Certificate")
    def test_service_account_json_takes_precedence(self, certificate):
        service_account = {
            "client_email": "firebase-admin@example.test",
            "private_key": "private-key",
            "project_id": "etrackmo-test",
        }

        get_firebase_credential(
            "missing-file.json",
            json.dumps(service_account),
        )

        certificate.assert_called_once_with(service_account)

    def test_invalid_service_account_json_raises_runtime_error(self):
        with self.assertRaisesRegex(RuntimeError, "JSON is invalid"):
            get_firebase_credential(None, "{bad-json")

    def test_missing_credentials_raise_runtime_error(self):
        with self.assertRaisesRegex(RuntimeError, "not configured"):
            get_firebase_credential(None, None)


if __name__ == "__main__":
    unittest.main()
