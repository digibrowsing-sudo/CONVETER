"""GST invoice extraction.

A tax invoice has a legally prescribed set of fields but no prescribed layout,
so this parser works in two passes: labelled fields are pulled out of the page
text by regex, and the line items are read from whichever table on the page has
a recognisable item header.

Both GSTINs are checksum-validated rather than merely pattern-matched, and the
line-item taxable values are summed and compared with the invoice total. A
figure that fails either check is flagged in the sheet — the whole point of the
tool is that the person filing the return sees what to verify.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional, Sequence

from textutil import (
    GSTIN_RE,
    normalise_space,
    parse_amount,
    parse_date,
    valid_gstin,
)

TOTAL_EPSILON = Decimal("1.00")  # invoices routinely round to the rupee

INVOICE_NUMBER_RE = re.compile(
    r"(?:tax\s+)?invoice\s*(?:no\.?|number|#)\s*:?\s*([A-Za-z0-9][A-Za-z0-9/\-]{0,29})",
    re.IGNORECASE,
)
INVOICE_DATE_RE = re.compile(
    r"(?:invoice\s*date|date\s+of\s+invoice|dated)\s*:?\s*"
    r"(\d{1,2}[/\-. ][\w]{1,9}[/\-. ]\d{2,4})",
    re.IGNORECASE,
)
PLACE_OF_SUPPLY_RE = re.compile(r"place\s+of\s+supply\s*:?\s*([A-Za-z ()\-]{3,40})", re.IGNORECASE)
INVOICE_TOTAL_RE = re.compile(
    r"(?:grand\s+total|invoice\s+total|total\s+invoice\s+value|amount\s+payable)\s*:?\s*"
    r"([\d,]+\.?\d{0,2})",
    re.IGNORECASE,
)

SUPPLIER_HINTS = ("supplier", "seller", "sold by", "from", "billed from")
RECIPIENT_HINTS = ("recipient", "buyer", "bill to", "billed to", "ship to", "customer")

ITEM_HEADER_HINTS = ("description", "hsn", "sac", "taxable", "qty", "quantity")


@dataclass
class LineItem:
    serial: str = ""
    description: str = ""
    hsn: str = ""
    quantity: Optional[Decimal] = None
    rate: Optional[Decimal] = None
    taxable_value: Optional[Decimal] = None
    cgst: Optional[Decimal] = None
    sgst: Optional[Decimal] = None
    igst: Optional[Decimal] = None
    total: Optional[Decimal] = None


@dataclass
class Invoice:
    number: str = ""
    invoice_date: Optional[str] = None
    supplier_gstin: str = ""
    recipient_gstin: str = ""
    supplier_gstin_valid: Optional[bool] = None
    recipient_gstin_valid: Optional[bool] = None
    place_of_supply: str = ""
    items: list[LineItem] = field(default_factory=list)
    taxable_total: Optional[Decimal] = None
    invoice_total: Optional[Decimal] = None
    warnings: list[str] = field(default_factory=list)
    confidence: float = 0.0


def _find(pattern: re.Pattern, text: str) -> str:
    match = pattern.search(text)
    return normalise_space(match.group(1)) if match else ""


def _assign_gstins(text: str, invoice: Invoice) -> None:
    """Decide which GSTIN belongs to whom by the words immediately before it."""
    found: list[tuple[str, str]] = []
    for match in GSTIN_RE.finditer(text):
        context = text[max(0, match.start() - 120) : match.start()].lower()
        role = ""
        if any(hint in context for hint in RECIPIENT_HINTS):
            role = "recipient"
        elif any(hint in context for hint in SUPPLIER_HINTS):
            role = "supplier"
        found.append((role, match.group(0)))

    for role, gstin in found:
        if role == "supplier" and not invoice.supplier_gstin:
            invoice.supplier_gstin = gstin
        elif role == "recipient" and not invoice.recipient_gstin:
            invoice.recipient_gstin = gstin

    # No labels to go on: an invoice prints the supplier's own GSTIN first.
    unlabelled = [gstin for role, gstin in found if not role]
    for gstin in unlabelled:
        if not invoice.supplier_gstin:
            invoice.supplier_gstin = gstin
        elif not invoice.recipient_gstin and gstin != invoice.supplier_gstin:
            invoice.recipient_gstin = gstin

    if invoice.supplier_gstin:
        invoice.supplier_gstin_valid = valid_gstin(invoice.supplier_gstin)
    if invoice.recipient_gstin:
        invoice.recipient_gstin_valid = valid_gstin(invoice.recipient_gstin)


def _looks_like_item_header(row: Sequence[Optional[str]]) -> bool:
    joined = " ".join(normalise_space(cell).lower() for cell in row if cell)
    return sum(1 for hint in ITEM_HEADER_HINTS if hint in joined) >= 2


def _column_index(header: Sequence[Optional[str]], *needles: str) -> Optional[int]:
    for index, cell in enumerate(header):
        text = normalise_space(cell).lower()
        if any(needle in text for needle in needles):
            return index
    return None


def _extract_items(pdf) -> list[LineItem]:
    items: list[LineItem] = []
    for page in pdf.pages:
        for table in page.extract_tables() or []:
            if not table or not _looks_like_item_header(table[0]):
                continue
            header = table[0]
            index = {
                "serial": _column_index(header, "s.no", "sr", "sl", "#"),
                "description": _column_index(header, "description", "particular", "item", "goods"),
                "hsn": _column_index(header, "hsn", "sac"),
                "quantity": _column_index(header, "qty", "quantity"),
                "rate": _column_index(header, "rate", "price"),
                "taxable": _column_index(header, "taxable", "amount"),
                "cgst": _column_index(header, "cgst"),
                "sgst": _column_index(header, "sgst", "utgst"),
                "igst": _column_index(header, "igst"),
                "total": _column_index(header, "total"),
            }

            for row in table[1:]:
                cell = lambda key: (  # noqa: E731 - a local shorthand reads better here
                    normalise_space(row[index[key]])
                    if index[key] is not None and index[key] < len(row)
                    else ""
                )
                description = cell("description")
                taxable = parse_amount(cell("taxable"))
                if not description and taxable is None:
                    continue
                if description.lower().startswith(("total", "grand total", "sub total")):
                    continue

                items.append(
                    LineItem(
                        serial=cell("serial"),
                        description=description,
                        hsn=cell("hsn"),
                        quantity=parse_amount(cell("quantity")),
                        rate=parse_amount(cell("rate")),
                        taxable_value=taxable,
                        cgst=parse_amount(cell("cgst")),
                        sgst=parse_amount(cell("sgst")),
                        igst=parse_amount(cell("igst")),
                        total=parse_amount(cell("total")),
                    )
                )
    return items


def _score(invoice: Invoice) -> float:
    checks = [
        bool(invoice.number),
        bool(invoice.invoice_date),
        bool(invoice.supplier_gstin),
        invoice.supplier_gstin_valid is not False,
        invoice.recipient_gstin_valid is not False,
        bool(invoice.items),
    ]
    return round(sum(1 for check in checks if check) / len(checks), 3)


def parse(pdf) -> Invoice:
    text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    invoice = Invoice()

    invoice.number = _find(INVOICE_NUMBER_RE, text)
    raw_date = _find(INVOICE_DATE_RE, text)
    parsed_date = parse_date(raw_date)
    invoice.invoice_date = parsed_date.strftime("%d-%m-%Y") if parsed_date else raw_date
    invoice.place_of_supply = _find(PLACE_OF_SUPPLY_RE, text)
    _assign_gstins(text, invoice)

    invoice.items = _extract_items(pdf)
    if invoice.items:
        invoice.taxable_total = sum(
            (item.taxable_value or Decimal(0)) for item in invoice.items
        )
    invoice.invoice_total = parse_amount(_find(INVOICE_TOTAL_RE, text))

    if not invoice.items:
        invoice.warnings.append(
            "No line-item table was recognised. The invoice may be a scan, or use a layout we "
            "cannot read yet — the summary fields above may still be usable."
        )
    if invoice.supplier_gstin_valid is False:
        invoice.warnings.append("The supplier GSTIN failed its checksum. Verify it before filing.")
    if invoice.recipient_gstin_valid is False:
        invoice.warnings.append("The recipient GSTIN failed its checksum. Verify it before filing.")

    # Sanity-check the arithmetic. Tax on top of the taxable value means the
    # totals will not match exactly, so only a wild difference is worth raising.
    if invoice.taxable_total and invoice.invoice_total:
        tax = sum(
            (item.cgst or Decimal(0)) + (item.sgst or Decimal(0)) + (item.igst or Decimal(0))
            for item in invoice.items
        )
        expected = invoice.taxable_total + tax
        if abs(expected - invoice.invoice_total) > TOTAL_EPSILON:
            invoice.warnings.append(
                "Line items plus tax do not add up to the invoice total on the document. "
                "A line may be missing or misread."
            )

    invoice.confidence = _score(invoice)
    return invoice
