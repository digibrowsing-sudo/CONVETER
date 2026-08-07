"""Shared bank-statement parser.

Every supported bank subclasses this and supplies configuration only: how to
recognise its statements, what its column captions are called, and how it
prints the opening and closing balances. The extraction itself is identical,
because the *shape* of an Indian bank statement is identical — it is only the
vocabulary that differs.

When this file grows a fifth or sixth `if bank == ...`, that is the signal to
move to a config-driven parser DSL (spec 20).
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Optional, Sequence

from base import (
    StatementResult,
    column_boundaries,
    group_lines,
    line_text,
    match_header,
    rows_to_transactions,
    split_by_columns,
)
from textutil import normalise_space, parse_amount, parse_date

# Lines that appear inside the table area but are not transactions.
NOISE_PATTERNS = (
    re.compile(r"^page\s+\d+\s+of\s+\d+", re.IGNORECASE),
    re.compile(r"^statement\s+(of|for)\b", re.IGNORECASE),
    re.compile(r"^(opening|closing)\s+balance\b", re.IGNORECASE),
    re.compile(r"^(total|grand\s+total|sub\s*total)\b", re.IGNORECASE),
    re.compile(r"^(brought|carried)\s+forward\b", re.IGNORECASE),
    re.compile(r"^continued\b|\bcontd\.?$", re.IGNORECASE),
    re.compile(r"registered\s+office|this\s+is\s+a\s+computer\s+generated", re.IGNORECASE),
    re.compile(r"^\*+$|^-+$|^_+$"),
)


class BankParser:
    CODE = "GENERIC"
    NAME = "Unknown bank"

    #: Phrases that identify this bank's statements. Scored, not all-or-nothing.
    SIGNATURES: Sequence[str] = ()

    #: Column caption -> role. Order matters only for readability.
    HEADER_ALIASES: dict[str, Sequence[str]] = {
        "date": ("date", "txn date", "transaction date", "tran date"),
        "value_date": ("value date", "value dt"),
        "narration": ("narration", "particulars", "description", "transaction details"),
        "reference": ("chq / ref no", "chq no", "cheque no", "ref no", "reference no", "instrument id"),
        "debit": ("withdrawal amt", "withdrawal", "debit", "debit amount", "dr", "withdrawals"),
        "credit": ("deposit amt", "deposit", "credit", "credit amount", "cr", "deposits"),
        "balance": ("closing balance", "balance", "running balance", "balance amt"),
        "amount": ("amount", "transaction amount", "amount (inr)"),
        "dr_cr": ("dr / cr", "dr/cr", "type", "cr/dr"),
    }

    OPENING_PATTERNS: Sequence[re.Pattern] = (
        re.compile(r"opening\s+balance\s*:?\s*(?P<value>[\d,().]+\s*(?:cr|dr)?)", re.IGNORECASE),
        re.compile(r"balance\s+b/?f\s*:?\s*(?P<value>[\d,().]+)", re.IGNORECASE),
    )
    CLOSING_PATTERNS: Sequence[re.Pattern] = (
        re.compile(r"closing\s+balance\s*:?\s*(?P<value>[\d,().]+\s*(?:cr|dr)?)", re.IGNORECASE),
        re.compile(r"balance\s+c/?f\s*:?\s*(?P<value>[\d,().]+)", re.IGNORECASE),
    )
    PERIOD_PATTERNS: Sequence[re.Pattern] = (
        re.compile(
            r"(?:from|period)\s*:?\s*(?P<start>[\d]{1,2}[/\-.][\w]{1,9}[/\-.][\d]{2,4})"
            r"\s*(?:to|-|–)\s*(?P<end>[\d]{1,2}[/\-.][\w]{1,9}[/\-.][\d]{2,4})",
            re.IGNORECASE,
        ),
    )

    # ------------------------------------------------------------------ detect

    @classmethod
    def detect_score(cls, text: str) -> int:
        """How strongly this text looks like one of our statements."""
        lowered = text.lower()
        return sum(1 for signature in cls.SIGNATURES if signature.lower() in lowered)

    # ------------------------------------------------------------------- parse

    @classmethod
    def is_noise(cls, text: str) -> bool:
        if not text:
            return True
        return any(pattern.search(text) for pattern in NOISE_PATTERNS)

    @classmethod
    def parse(cls, pdf) -> StatementResult:
        result = StatementResult(bank_code=cls.CODE)
        bounds = None
        full_text_parts: list[str] = []

        for page_number, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            full_text_parts.append(page_text)

            words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
            if not words:
                continue

            rows = []
            for line in group_lines(words):
                # The header repeats on every page and can shift, so we look for
                # it on each page rather than trusting page one forever.
                header = match_header(line, cls.HEADER_ALIASES)
                if header:
                    bounds = column_boundaries(header)
                    continue
                if bounds is None:
                    continue
                if cls.is_noise(line_text(line)):
                    continue
                rows.append(split_by_columns(line, bounds))

            result.transactions.extend(rows_to_transactions(rows, page_number))

        full_text = "\n".join(full_text_parts)
        result.opening_balance = cls._first_amount(full_text, cls.OPENING_PATTERNS)
        result.closing_balance_printed = cls._first_amount(full_text, cls.CLOSING_PATTERNS)
        result.period_from, result.period_to = cls._period(full_text)

        if bounds is None:
            result.warnings.append(
                "No transaction table was found in this PDF. It may be a scan, or a statement "
                "layout we do not recognise yet."
            )
        return result

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _first_amount(text: str, patterns: Sequence[re.Pattern]) -> Optional[Decimal]:
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                value = parse_amount(normalise_space(match.group("value")))
                if value is not None:
                    return abs(value)
        return None

    @classmethod
    def _period(cls, text: str):
        for pattern in cls.PERIOD_PATTERNS:
            match = pattern.search(text)
            if match:
                return parse_date(match.group("start")), parse_date(match.group("end"))
        return None, None
