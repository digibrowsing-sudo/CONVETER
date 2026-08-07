"""Unit tests for the finance parsing primitives.

These deliberately have no third-party imports, so they run in CI without the
pdfplumber toolchain installed:  python3 -m unittest discover -s python/tests
"""

import sys
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "finance"))

from textutil import parse_amount, parse_date, looks_like_date, valid_gstin  # noqa: E402


class ParseAmountTests(unittest.TestCase):
    def test_indian_grouping(self):
        self.assertEqual(parse_amount("1,23,456.78"), Decimal("123456.78"))
        self.assertEqual(parse_amount("12,34,56,789.00"), Decimal("123456789.00"))

    def test_plain_and_western_grouping(self):
        self.assertEqual(parse_amount("450"), Decimal("450"))
        self.assertEqual(parse_amount("1,234.50"), Decimal("1234.50"))

    def test_debit_markers_make_it_negative(self):
        self.assertEqual(parse_amount("500.00 Dr"), Decimal("-500.00"))
        self.assertEqual(parse_amount("(500.00)"), Decimal("-500.00"))
        self.assertEqual(parse_amount("500.00 Cr"), Decimal("500.00"))

    def test_currency_prefixes(self):
        self.assertEqual(parse_amount("Rs. 1,000.00"), Decimal("1000.00"))
        self.assertEqual(parse_amount("INR 1,000"), Decimal("1000"))

    def test_non_amounts_are_none(self):
        for value in (None, "", "-", "NIL", "NEFT TRANSFER", "12/03/2026", "abc"):
            self.assertIsNone(parse_amount(value), value)


class ParseDateTests(unittest.TestCase):
    def test_common_statement_formats(self):
        expected = date(2026, 3, 12)
        for value in ("12/03/2026", "12-03-2026", "12.03.2026", "12-Mar-2026", "12 Mar 2026"):
            self.assertEqual(parse_date(value), expected, value)

    def test_two_digit_years_are_this_century(self):
        self.assertEqual(parse_date("12/03/26"), date(2026, 3, 12))
        self.assertEqual(parse_date("01/01/68"), date(2068, 1, 1))

    def test_rejects_non_dates(self):
        self.assertIsNone(parse_date("NEFT-000123"))
        self.assertIsNone(parse_date(""))

    def test_looks_like_date_is_cheap_and_strict(self):
        self.assertTrue(looks_like_date("12/03/2026"))
        self.assertTrue(looks_like_date("12-Mar-26"))
        self.assertFalse(looks_like_date("1,234.00"))
        self.assertFalse(looks_like_date("SALARY CREDIT"))


class GstinTests(unittest.TestCase):
    def test_accepts_a_valid_gstin(self):
        # Checksum-correct example built from the published mod-36 algorithm.
        self.assertTrue(valid_gstin("27AAPFU0939F1ZV"))

    def test_rejects_a_wrong_check_digit(self):
        self.assertFalse(valid_gstin("27AAPFU0939F1ZA"))

    def test_rejects_malformed_input(self):
        for value in ("", "27AAPFU0939F1Z", "NOTAGSTINATALL1", None):
            self.assertFalse(valid_gstin(value))


if __name__ == "__main__":
    unittest.main()
