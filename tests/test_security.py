import os
import unittest
from unittest import mock


class SecuritySmokeTests(unittest.TestCase):
    def setUp(self):
        os.environ["APP_REQUIRE_CONFIG"] = "False"

    @mock.patch("app.initialize_firebase")
    def test_security_headers_are_set(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/login")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Content-Security-Policy", response.headers)
        self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")
        self.assertEqual(
            response.headers.get("Referrer-Policy"),
            "strict-origin-when-cross-origin",
        )

    @mock.patch("app.initialize_firebase")
    def test_accounts_requires_firebase_bearer_token(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/api/accounts")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"error": "Unauthorized."})

    @mock.patch("app.initialize_firebase")
    def test_transactions_requires_firebase_bearer_token(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/api/transactions")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"error": "Unauthorized."})

    @mock.patch("app.initialize_firebase")
    def test_coops_requires_firebase_bearer_token(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/api/coops")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(), {"error": "Unauthorized."})

    @mock.patch("app.initialize_firebase")
    def test_transactions_page_renders(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/transactions")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Transactions", response.data)

    @mock.patch("app.initialize_firebase")
    def test_history_page_renders(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/history")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Transaction history", response.data)

    @mock.patch("app.initialize_firebase")
    def test_coop_page_renders(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.get("/coop")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Create Coop", response.data)

    @mock.patch("app.initialize_firebase")
    def test_account_writes_require_csrf(self, initialize_firebase):
        from app import create_app

        app = create_app()
        client = app.test_client()

        response = client.post(
            "/api/accounts",
            json={
                "balance": "100",
                "name": "Cash",
                "type": "cash",
            },
        )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
