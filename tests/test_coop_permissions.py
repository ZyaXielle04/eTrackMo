import unittest

from app.routes.api.coops import clean_invite_code
from app.routes.api.coops import prepare_shared_account
from app.routes.api.coops import normalize_permissions


class CoopPermissionTests(unittest.TestCase):
    def test_normalize_permissions_allows_only_known_boolean_keys(self):
        self.assertEqual(
            normalize_permissions(
                {
                    "shareAccounts": True,
                    "shareBalances": 1,
                    "shareTransactions": "",
                    "admin": True,
                }
            ),
            {
                "shareAccounts": True,
                "shareBalances": True,
                "shareTransactions": False,
            },
        )

    def test_invite_code_is_uppercase_alphanumeric(self):
        self.assertEqual(clean_invite_code("ab12-cd34"), "AB12CD34")
        self.assertIsNone(clean_invite_code("bad!"))
        self.assertIsNone(clean_invite_code("123"))

    def test_shared_account_hides_balance_without_balance_permission(self):
        account = {
            "balanceCents": 12345,
            "currency": "PHP",
            "name": "GCash",
            "type": "gcash",
        }

        shared_account = prepare_shared_account(
            "a" * 32,
            account,
            {
                "shareAccounts": True,
                "shareBalances": False,
                "shareTransactions": False,
            },
        )

        self.assertEqual(shared_account["name"], "GCash")
        self.assertNotIn("balance", shared_account)
        self.assertNotIn("balanceCents", shared_account)


if __name__ == "__main__":
    unittest.main()
