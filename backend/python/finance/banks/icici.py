"""ICICI Bank statement parser.

ICICI prints a serial number column ahead of the dates, splits the date into
"Transaction Date" and "Value Date", and labels the money columns
"Withdrawal Amount (INR)" and "Deposit Amount (INR)". The serial number column
is captured under `reference` so that its digits are never mistaken for an
amount by the column splitter.
"""

from __future__ import annotations

from .parser import BankParser


class IciciParser(BankParser):
    CODE = "ICICI"
    NAME = "ICICI Bank"

    SIGNATURES = (
        "icici bank",
        "transaction remarks",
        "withdrawal amount (inr)",
        "deposit amount (inr)",
        "value date",
    )

    HEADER_ALIASES = {
        "reference": ("s no.", "sr no.", "no.", "cheque no.", "chq no."),
        "date": ("transaction date", "txn date", "date"),
        "value_date": ("value date",),
        "narration": ("transaction remarks", "particulars", "narration"),
        "debit": ("withdrawal amount (inr)", "withdrawal amount", "withdrawal (dr)", "withdrawal"),
        "credit": ("deposit amount (inr)", "deposit amount", "deposit (cr)", "deposit"),
        "balance": ("balance (inr)", "balance", "closing balance"),
    }
