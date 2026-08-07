"""Kotak Mahindra Bank statement parser.

Kotak uses a single "Amount" column with a separate "Dr/Cr" marker instead of
the debit/credit pair the other three banks use. The shared engine already
handles that layout — see `rows_to_transactions` — so this parser only has to
name the columns correctly.
"""

from __future__ import annotations

from .parser import BankParser


class KotakParser(BankParser):
    CODE = "KOTAK"
    NAME = "Kotak Mahindra Bank"

    SIGNATURES = (
        "kotak mahindra bank",
        "kotak",
        "dr / cr",
        "chq / ref no",
        "withdrawal (dr)/deposit (cr)",
    )

    HEADER_ALIASES = {
        "date": ("date", "transaction date"),
        "value_date": ("value date",),
        "narration": ("description", "narration", "particulars"),
        "reference": ("chq / ref no", "chq/ref no", "ref no", "cheque no"),
        "amount": ("amount", "withdrawal (dr)/deposit (cr)", "transaction amount"),
        "dr_cr": ("dr / cr", "dr/cr", "cr/dr"),
        "balance": ("balance", "balance (inr)", "closing balance"),
        # Kotak occasionally issues the split-column layout as well, so both
        # sets of captions are accepted and whichever is present wins.
        "debit": ("withdrawal", "debit"),
        "credit": ("deposit", "credit"),
    }
