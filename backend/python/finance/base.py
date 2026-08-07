"""Column-layout extraction engine shared by the bank statement parsers.

Bank statements are laid out as a table but very few of them are tagged as one,
so `extract_tables()` alone fails on roughly half the formats we care about.
What every statement does have is a header row whose cells sit at stable x
positions, with the data below aligned to those same columns.

So the strategy is:

  1. find the header row by looking for the bank's column captions
  2. derive column x-boundaries from where those captions sit
  3. assign every word below the header to a column by its centre point
  4. treat a line whose date column holds a date as a new transaction, and any
     line that does not as a continuation of the previous narration

That last step matters: narrations wrap across two or three lines in almost
every statement, and a parser that treats each line as a row silently produces
hundreds of phantom transactions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Iterable, Optional, Sequence

from textutil import looks_like_date, normalise_space, parse_amount, parse_date

# Words whose vertical midpoints are within this many points belong to one line.
LINE_TOLERANCE = 2.5

# Balance arithmetic is checked to the paisa; anything looser hides real errors.
BALANCE_EPSILON = Decimal("0.01")


@dataclass
class Transaction:
    txn_date: Optional[date] = None
    value_date: Optional[date] = None
    narration: str = ""
    reference: str = ""
    debit: Optional[Decimal] = None
    credit: Optional[Decimal] = None
    balance: Optional[Decimal] = None
    page: int = 0
    flags: list[str] = field(default_factory=list)

    @property
    def amount(self) -> Optional[Decimal]:
        if self.debit is not None:
            return -self.debit
        return self.credit

    def is_complete(self) -> bool:
        return self.txn_date is not None and (self.debit is not None or self.credit is not None)


@dataclass
class StatementResult:
    bank_code: str
    transactions: list[Transaction] = field(default_factory=list)
    opening_balance: Optional[Decimal] = None
    closing_balance_printed: Optional[Decimal] = None
    period_from: Optional[date] = None
    period_to: Optional[date] = None
    warnings: list[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class Column:
    role: str
    x0: float
    x1: float


class ParseError(Exception):
    """Raised with one of the API's stable error codes (spec 7.6)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def group_lines(words: Sequence[dict], tolerance: float = LINE_TOLERANCE) -> list[list[dict]]:
    """Group pdfplumber words into visual lines, each sorted left to right."""
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        centre = (word["top"] + word["bottom"]) / 2
        for line in lines:
            ref = line[0]
            ref_centre = (ref["top"] + ref["bottom"]) / 2
            if abs(centre - ref_centre) <= tolerance:
                line.append(word)
                break
        else:
            lines.append([word])
    for line in lines:
        line.sort(key=lambda w: w["x0"])
    return lines


def line_text(line: Sequence[dict]) -> str:
    return normalise_space(" ".join(word["text"] for word in line))


def match_header(line: Sequence[dict], aliases: dict[str, Sequence[str]]) -> Optional[list[Column]]:
    """Try to read `line` as the table header.

    Captions are frequently multi-word ("Withdrawal Amt.", "Closing Balance"),
    so each alias is matched against runs of consecutive words rather than
    single tokens.
    """
    lowered = [normalise_space(word["text"]).lower().strip(".:") for word in line]
    columns: list[Column] = []
    used: set[int] = set()

    for role, phrases in aliases.items():
        best: Optional[Column] = None
        for phrase in phrases:
            target = phrase.lower()
            span = len(phrase.split())
            for start in range(len(lowered) - span + 1):
                if any(index in used for index in range(start, start + span)):
                    continue
                candidate = " ".join(lowered[start : start + span]).strip(".:")
                if candidate != target:
                    continue
                best = Column(role=role, x0=line[start]["x0"], x1=line[start + span - 1]["x1"])
                used.update(range(start, start + span))
                break
            if best:
                break
        if best:
            columns.append(best)

    # A date column and at least one money column is the minimum that can be
    # read as a transaction table; anything less is a stray line of prose.
    roles = {column.role for column in columns}
    if "date" not in roles or not roles & {"debit", "credit", "amount", "balance"}:
        return None
    return sorted(columns, key=lambda column: column.x0)


def column_boundaries(columns: Sequence[Column]) -> list[tuple[str, float, float]]:
    """Turn header cell positions into full-width capture ranges."""
    bounds: list[tuple[str, float, float]] = []
    for index, column in enumerate(columns):
        left = float("-inf") if index == 0 else (columns[index - 1].x1 + column.x0) / 2
        right = float("inf") if index == len(columns) - 1 else (column.x1 + columns[index + 1].x0) / 2
        bounds.append((column.role, left, right))
    return bounds


def split_by_columns(line: Sequence[dict], bounds: Sequence[tuple[str, float, float]]) -> dict[str, str]:
    """Assign each word in a line to a column by its horizontal midpoint."""
    cells: dict[str, list[str]] = {role: [] for role, _, _ in bounds}
    for word in line:
        centre = (word["x0"] + word["x1"]) / 2
        for role, left, right in bounds:
            if left <= centre < right:
                cells[role].append(word["text"])
                break
    return {role: normalise_space(" ".join(parts)) for role, parts in cells.items()}


def rows_to_transactions(rows: Iterable[dict[str, str]], page: int) -> list[Transaction]:
    """Fold column cells into transactions, joining wrapped narration lines."""
    transactions: list[Transaction] = []

    for cells in rows:
        date_cell = cells.get("date", "")

        if looks_like_date(date_cell):
            txn = Transaction(page=page)
            txn.txn_date = parse_date(date_cell)
            txn.value_date = parse_date(cells.get("value_date", "")) or txn.txn_date
            txn.narration = cells.get("narration", "")
            txn.reference = cells.get("reference", "")
            txn.balance = parse_amount(cells.get("balance"))

            debit = parse_amount(cells.get("debit"))
            credit = parse_amount(cells.get("credit"))
            if debit is None and credit is None:
                # Single-amount layout: the sign, or an explicit Dr/Cr column,
                # decides which side it belongs on.
                amount = parse_amount(cells.get("amount"))
                marker = cells.get("dr_cr", "").strip().lower()
                if amount is not None:
                    if marker.startswith("d") or amount < 0:
                        debit = abs(amount)
                    else:
                        credit = abs(amount)
            txn.debit = abs(debit) if debit is not None else None
            txn.credit = abs(credit) if credit is not None else None

            transactions.append(txn)
            continue

        # Not a new row: a wrapped narration belonging to the previous one.
        if transactions:
            extra = normalise_space(
                " ".join(
                    cells.get(role, "")
                    for role in ("narration", "reference")
                    if cells.get(role)
                )
            )
            if extra:
                transactions[-1].narration = normalise_space(
                    f"{transactions[-1].narration} {extra}"
                )

    return transactions


def score_confidence(result: StatementResult) -> float:
    """Score a parse from 0 to 1, and flag the rows that dragged it down.

    Three independent signals, because any one of them can be fooled:
      - how many rows came out structurally complete
      - whether the running balance is arithmetically consistent row to row
      - whether the final balance matches the one printed on the statement

    Row-level flags are what the user actually acts on; the aggregate number is
    what we alert on when a bank quietly changes its layout (spec 19, R8).
    """
    transactions = result.transactions
    if not transactions:
        return 0.0

    complete = sum(1 for txn in transactions if txn.is_complete())
    structure_score = complete / len(transactions)
    for txn in transactions:
        if not txn.is_complete():
            txn.flags.append("incomplete row — check against the statement")

    balance_score = None
    with_balance = [txn for txn in transactions if txn.balance is not None]
    if len(with_balance) >= 2:
        checked = 0
        consistent = 0
        for previous, current in zip(with_balance, with_balance[1:]):
            movement = (current.credit or Decimal(0)) - (current.debit or Decimal(0))
            checked += 1
            if abs(previous.balance + movement - current.balance) <= BALANCE_EPSILON:
                consistent += 1
            else:
                current.flags.append("balance does not follow from the previous row")
        balance_score = consistent / checked if checked else None

    closing_score = None
    if result.closing_balance_printed is not None and with_balance:
        computed = with_balance[-1].balance
        if abs(computed - result.closing_balance_printed) <= BALANCE_EPSILON:
            closing_score = 1.0
        else:
            closing_score = 0.0
            result.warnings.append(
                "The closing balance calculated from the transactions does not match the one "
                "printed on the statement. Some rows are probably missing or misread — check "
                "before using this data."
            )

    weights = [(structure_score, 0.5)]
    if balance_score is not None:
        weights.append((balance_score, 0.35))
    if closing_score is not None:
        weights.append((closing_score, 0.15))

    total_weight = sum(weight for _, weight in weights)
    return round(sum(score * weight for score, weight in weights) / total_weight, 3)
