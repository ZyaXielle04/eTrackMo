import unittest
from datetime import date
from datetime import datetime
from datetime import timedelta

from app.routes.api import clean_finance_text
from app.routes.api import clean_transaction_category
from app.routes.api import clean_transaction_date
from app.routes.api import clean_transaction_datetime
from app.routes.api import clean_transaction_time
from app.routes.api import parse_optional_fee_cents
from app.routes.api import parse_positive_amount_cents


class TransactionValidationTests(unittest.TestCase):
    def test_positive_amount_requires_money_value_above_zero(self):
        self.assertEqual(parse_positive_amount_cents("125.50"), 12550)
        self.assertIsNone(parse_positive_amount_cents("0"))
        self.assertIsNone(parse_positive_amount_cents("-10"))
        self.assertIsNone(parse_positive_amount_cents("abc"))

    def test_optional_fee_allows_blank_or_non_negative_money(self):
        self.assertEqual(parse_optional_fee_cents(""), 0)
        self.assertEqual(parse_optional_fee_cents(None), 0)
        self.assertEqual(parse_optional_fee_cents("15.75"), 1575)
        self.assertIsNone(parse_optional_fee_cents("-1"))
        self.assertIsNone(parse_optional_fee_cents("100000.01"))

    def test_transaction_date_rejects_invalid_or_future_dates(self):
        today = date.today().isoformat()
        tomorrow = (date.today() + timedelta(days=1)).isoformat()

        self.assertEqual(clean_transaction_date(today), today)
        self.assertIsNone(clean_transaction_date("not-a-date"))
        self.assertIsNone(clean_transaction_date(tomorrow))

    def test_transaction_time_requires_24_hour_time(self):
        self.assertEqual(clean_transaction_time("09:30"), "09:30")
        self.assertEqual(clean_transaction_time("23:59"), "23:59")
        self.assertIsNone(clean_transaction_time("24:00"))
        self.assertIsNone(clean_transaction_time("9:30"))

    def test_transaction_datetime_rejects_future_values(self):
        now = datetime.now()
        today = now.date().isoformat()
        current_time = now.strftime("%H:%M")
        tomorrow = (date.today() + timedelta(days=1)).isoformat()

        self.assertEqual(
            clean_transaction_datetime(today, current_time),
            {
                "date": today,
                "datetime": f"{today}T{current_time}",
                "time": current_time,
            },
        )
        self.assertIsNone(clean_transaction_datetime(tomorrow, "00:00"))

    def test_finance_text_rejects_control_or_symbol_heavy_values(self):
        self.assertEqual(clean_finance_text("Dad account #1"), "Dad account #1")
        self.assertIsNone(clean_finance_text("<script>alert(1)</script>"))
        self.assertIsNone(clean_finance_text("\n\n"))

    def test_transaction_category_must_match_transaction_type(self):
        self.assertEqual(clean_transaction_category("expense", "food"), "food")
        self.assertEqual(clean_transaction_category("income", "salary"), "salary")
        self.assertIsNone(clean_transaction_category("income", "food"))
        self.assertIsNone(clean_transaction_category("expense", "salary"))
        self.assertIsNone(clean_transaction_category("expense", "<script>"))


if __name__ == "__main__":
    unittest.main()
