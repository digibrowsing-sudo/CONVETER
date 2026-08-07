"""State Bank of India statement parser.

SBI's downloaded statement is the awkward one. It uses "Txn Date" and
"Value Date", puts the cheque number in its own column, and labels the money
columns simply "Debit" and "Credit" — captions generic enough that the header
matcher would find them on other banks' statements too. Detection therefore
leans on the SBI-specific header text rather than on the column captions.
"""

from __future__ import annotations

import re

from .parser import BankParser


class SbiParser(BankParser):
    CODE = "SBI"
    NAME = "State Bank of India"

    SIGNATURES = (
        "state bank of india",
        "account statement",
        "txn date",
        "ifs code",
        "cif no",
    )

    HEADER_ALIASES = {
        "date": ("txn date", "transaction date", "date"),
        "value_date": ("value date", "value dt"),
        "narration": ("description", "particulars", "narration"),
        "reference": ("ref no./cheque no.", "ref no", "cheque no.", "cheque no"),
        "debit": ("debit", "withdrawal"),
        "credit": ("credit", "deposit"),
        "balance": ("balance", "closing balance"),
    }

    # SBI writes the period as "Account Statement from 1 Apr 2026 to 30 Jun 2026".
    PERIOD_PATTERNS = (
        re.compile(
            r"from\s+(?P<start>\d{1,2}\s+\w{3,9}\s+\d{4})\s+to\s+(?P<end>\d{1,2}\s+\w{3,9}\s+\d{4})",
            re.IGNORECASE,
        ),
    ) + tuple(BankParser.PERIOD_PATTERNS)
