"""Bank parser registry and format detection.

Adding a bank is adding one module and one line here. The parsers we are asked
for next are not a guess: every `BANK_UNSUPPORTED` failure is logged with the
detection outcome, so the queue of banks to add writes itself (spec 17).
"""

from __future__ import annotations

from typing import Optional

from .hdfc import HdfcParser
from .icici import IciciParser
from .kotak import KotakParser
from .parser import BankParser
from .sbi import SbiParser

#: Dedicated, format-specific parsers, in no particular order.
PARSERS: tuple[type[BankParser], ...] = (HdfcParser, IciciParser, SbiParser, KotakParser)

BY_CODE = {parser.CODE.lower(): parser for parser in PARSERS}

# A detection score below this is not a recognition, it is a coincidence: one
# stray match on a caption as common as "date" tells us nothing.
MIN_DETECTION_SCORE = 2


class GenericParser(BankParser):
    """Fallback for banks we have not written a parser for yet.

    It relies purely on the shared header captions, so it works on statements
    that use a conventional ruled table and fails honestly on those that do
    not. It is offered rather than refused because a bookkeeper with a working
    result from an unsupported bank is worth more than a tidy error message.
    """

    CODE = "GENERIC"
    NAME = "Generic statement"


def detect(text: str) -> tuple[Optional[type[BankParser]], dict[str, int]]:
    """Pick the best-scoring parser for this document.

    @returns (parser or None, per-bank scores) — the scores are logged so a
             detection that only just failed is visible, not silent.
    """
    scores = {parser.CODE: parser.detect_score(text) for parser in PARSERS}
    best_code = max(scores, key=scores.get)
    if scores[best_code] < MIN_DETECTION_SCORE:
        return None, scores
    return BY_CODE[best_code.lower()], scores


def by_code(code: str) -> Optional[type[BankParser]]:
    """Look up a parser the user chose explicitly, bypassing detection."""
    if code and code.lower() == "generic":
        return GenericParser
    return BY_CODE.get((code or "").lower())


__all__ = ["PARSERS", "BY_CODE", "GenericParser", "BankParser", "detect", "by_code"]
