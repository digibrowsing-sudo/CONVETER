"""Parsing primitives shared by every finance parser.

Indian financial PDFs are written for humans, not machines: amounts use the
lakh/crore grouping, dates appear in at least five formats across four banks,
and a debit is sometimes a negative number and sometimes a separate column.
Everything that has to cope with that lives here rather than being reinvented
in each bank parser.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

# 1,23,456.78 (Indian grouping), 123456.78, 123456, optionally in brackets or
# suffixed Dr/Cr, optionally prefixed with the rupee sign.
_AMOUNT_RE = re.compile(
    r"""^\(?                    # optional opening bracket (negative)
        (?:rs\.?|inr|₹)?\s*
        (?P<digits>\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)
        \)?\s*
        (?P<suffix>cr|dr)?\.?$
    """,
    re.IGNORECASE | re.VERBOSE,
)

_DATE_FORMATS = (
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d/%m/%y",
    "%d-%m-%y",
    "%d-%b-%Y",
    "%d-%b-%y",
    "%d %b %Y",
    "%d %B %Y",
    "%Y-%m-%d",
)

# A bare token that could plausibly start a transaction row.
DATE_TOKEN_RE = re.compile(
    r"^\d{1,2}[/\-. ](?:\d{1,2}|[A-Za-z]{3,9})[/\-. ]\d{2,4}$|^\d{4}-\d{2}-\d{2}$"
)

GSTIN_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b")
PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
TAN_RE = re.compile(r"\b[A-Z]{4}\d{5}[A-Z]\b")

_GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def parse_amount(text: Optional[str]) -> Optional[Decimal]:
    """Parse an amount cell. Returns None when the cell is not an amount.

    A trailing 'Dr' or a bracketed value yields a negative number, matching how
    statements present a withdrawal in a single-amount column.
    """
    if text is None:
        return None
    raw = str(text).strip()
    if not raw or raw in {"-", "--", "NIL", "nil"}:
        return None

    negative = raw.startswith("(") and raw.endswith(")")
    match = _AMOUNT_RE.match(raw)
    if not match:
        return None

    try:
        value = Decimal(match.group("digits").replace(",", ""))
    except InvalidOperation:
        return None

    suffix = (match.group("suffix") or "").lower()
    if negative or suffix == "dr":
        value = -value
    return value


def parse_date(text: Optional[str]) -> Optional[date]:
    """Parse a date cell against the formats Indian statements actually use."""
    if text is None:
        return None
    raw = str(text).strip().replace("  ", " ")
    if not raw:
        return None

    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
        # A two-digit year in a bank statement is always this century; strptime
        # would otherwise read '68' as 1968.
        if parsed.year < 1970:
            parsed = parsed.replace(year=parsed.year + 100)
        return parsed
    return None


def looks_like_date(text: Optional[str]) -> bool:
    return bool(text) and bool(DATE_TOKEN_RE.match(str(text).strip()))


def normalise_space(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def valid_gstin(gstin: str) -> bool:
    """Check a GSTIN's format and its final check character.

    The checksum is a weighted mod-36 over the first 14 characters, alternating
    weights of 1 and 2, with the tens and units of each product summed.
    """
    gstin = (gstin or "").strip().upper()
    if len(gstin) != 15 or not GSTIN_RE.match(gstin):
        return False

    total = 0
    for index, char in enumerate(gstin[:14]):
        if char not in _GSTIN_ALPHABET:
            return False
        value = _GSTIN_ALPHABET.index(char)
        weight = 2 if index % 2 else 1
        product = value * weight
        total += product // 36 + product % 36

    expected = _GSTIN_ALPHABET[(36 - total % 36) % 36]
    return expected == gstin[14]
