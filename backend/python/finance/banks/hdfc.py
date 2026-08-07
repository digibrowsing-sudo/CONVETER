"""HDFC Bank statement parser.

HDFC's retail statement is a ruled table with separate withdrawal and deposit
columns and a running closing balance. Its distinguishing feature is the
"Chq./Ref.No." caption and the "Withdrawal Amt." / "Deposit Amt." pair, which
no other major bank uses in that exact wording.
"""

from __future__ import annotations

from .parser import BankParser


class HdfcParser(BankParser):
    CODE = "HDFC"
    NAME = "HDFC Bank"

    SIGNATURES = (
        "hdfc bank",
        "withdrawal amt",
        "deposit amt",
        "chq./ref.no",
        "closing balance",
    )

    HEADER_ALIASES = {
        "date": ("date", "txn date"),
        "value_date": ("value dt", "value date"),
        "narration": ("narration",),
        "reference": ("chq./ref.no.", "chq / ref no", "chq./ref.no", "ref no"),
        "debit": ("withdrawal amt.", "withdrawal amt", "withdrawal"),
        "credit": ("deposit amt.", "deposit amt", "deposit"),
        "balance": ("closing balance", "balance"),
    }
