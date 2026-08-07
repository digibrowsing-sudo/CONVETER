"""Workbook and CSV writers for the finance module.

Two things matter here beyond getting the data into cells:

  * Amounts must be real numbers with an Indian number format, not text. A
    bookkeeper's first action is to sum a column, and a column of strings that
    sums to zero is worse than no output at all.
  * Anything the parser was unsure about has to be visible in the sheet itself.
    A confidence score buried in a JSON response helps nobody; a flagged row
    with a coloured cell gets checked.
"""

from __future__ import annotations

import csv
from datetime import date
from decimal import Decimal
from typing import Optional, Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# Indian digit grouping: 12,34,567.89 rather than 1,234,567.89.
INR_FORMAT = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00"
DATE_FORMAT = "DD-MM-YYYY"

HEADER_FILL = PatternFill("solid", fgColor="1E3A8A")
HEADER_FONT = Font(color="FFFFFF", bold=True)
FLAG_FILL = PatternFill("solid", fgColor="FEF3C7")
WARN_FONT = Font(color="92400E", bold=True)

ACCURACY_NOTICE = (
    "Check every figure against the original document before using it in books of account, "
    "a return or any filing. This sheet was produced by automated extraction and you remain "
    "responsible for its accuracy."
)


def _style_header(sheet, columns: Sequence[str]) -> None:
    sheet.append(list(columns))
    for cell in sheet[sheet.max_row]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    sheet.freeze_panes = sheet.cell(row=sheet.max_row + 1, column=1)


def _autosize(sheet, widths: Sequence[int]) -> None:
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width


def _num(value: Optional[Decimal]):
    """openpyxl writes Decimal as a string; floats round-trip as numbers."""
    return float(value) if value is not None else None


def _write_summary(workbook: Workbook, rows: Sequence[tuple[str, object]], warnings: Sequence[str]):
    sheet = workbook.create_sheet("Summary", 0)
    sheet["A1"] = "FileForge extraction summary"
    sheet["A1"].font = Font(bold=True, size=14)

    row_index = 3
    for label, value in rows:
        sheet.cell(row=row_index, column=1, value=label).font = Font(bold=True)
        sheet.cell(row=row_index, column=2, value=value)
        row_index += 1

    row_index += 1
    sheet.cell(row=row_index, column=1, value="Please check before you file").font = WARN_FONT
    sheet.cell(row=row_index + 1, column=1, value=ACCURACY_NOTICE).alignment = Alignment(wrap_text=True)
    sheet.merge_cells(start_row=row_index + 1, start_column=1, end_row=row_index + 3, end_column=6)
    row_index += 5

    if warnings:
        sheet.cell(row=row_index, column=1, value="Warnings").font = Font(bold=True)
        for offset, warning in enumerate(warnings, start=1):
            sheet.cell(row=row_index + offset, column=1, value=warning)

    _autosize(sheet, [28, 34, 14, 14, 14, 14])
    return sheet


# --------------------------------------------------------------- bank statement

BANK_COLUMNS = (
    "Date",
    "Value Date",
    "Narration",
    "Reference",
    "Debit",
    "Credit",
    "Balance",
    "Check",
)


def write_bank_statement_xlsx(path: str, result, bank_name: str) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Transactions"
    _style_header(sheet, BANK_COLUMNS)

    for txn in result.transactions:
        sheet.append(
            [
                txn.txn_date,
                txn.value_date,
                txn.narration,
                txn.reference,
                _num(txn.debit),
                _num(txn.credit),
                _num(txn.balance),
                "; ".join(txn.flags),
            ]
        )
        row = sheet[sheet.max_row]
        row[0].number_format = DATE_FORMAT
        row[1].number_format = DATE_FORMAT
        for cell in row[4:7]:
            cell.number_format = INR_FORMAT
        if txn.flags:
            for cell in row:
                cell.fill = FLAG_FILL

    _autosize(sheet, [12, 12, 58, 20, 15, 15, 16, 42])

    total_debit = sum((txn.debit or Decimal(0)) for txn in result.transactions)
    total_credit = sum((txn.credit or Decimal(0)) for txn in result.transactions)

    _write_summary(
        workbook,
        [
            ("Bank", bank_name),
            ("Statement period", _period_text(result.period_from, result.period_to)),
            ("Transactions extracted", len(result.transactions)),
            ("Rows needing a check", sum(1 for txn in result.transactions if txn.flags)),
            ("Opening balance", _num(result.opening_balance)),
            ("Closing balance on statement", _num(result.closing_balance_printed)),
            ("Total debits", _num(total_debit)),
            ("Total credits", _num(total_credit)),
            ("Confidence", result.confidence),
        ],
        result.warnings,
    )
    workbook.save(path)


# Tally's bank import expects these headings in this order.
TALLY_COLUMNS = ("Date", "Voucher Type", "Reference", "Narration", "Debit", "Credit")


def write_tally_csv(path: str, result) -> None:
    """Write the Tally-ready CSV.

    Voucher types are assigned mechanically — Receipt for money in, Payment for
    money out — because the contra ledger is a judgement call that belongs to
    the person doing the import, not to us.
    """
    with open(path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(TALLY_COLUMNS)
        for txn in result.transactions:
            if not txn.is_complete():
                continue  # a half-read row must never reach live books
            writer.writerow(
                [
                    txn.txn_date.strftime("%d-%m-%Y") if txn.txn_date else "",
                    "Receipt" if txn.credit else "Payment",
                    txn.reference,
                    txn.narration,
                    f"{txn.debit:.2f}" if txn.debit else "",
                    f"{txn.credit:.2f}" if txn.credit else "",
                ]
            )


# ------------------------------------------------------------------ GST invoice

GST_LINE_COLUMNS = (
    "S.No",
    "Description",
    "HSN/SAC",
    "Quantity",
    "Rate",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
    "Total",
)


def write_gst_invoice_xlsx(path: str, invoice) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Line items"
    _style_header(sheet, GST_LINE_COLUMNS)

    for item in invoice.items:
        sheet.append(
            [
                item.serial,
                item.description,
                item.hsn,
                _num(item.quantity),
                _num(item.rate),
                _num(item.taxable_value),
                _num(item.cgst),
                _num(item.sgst),
                _num(item.igst),
                _num(item.total),
            ]
        )
        for cell in sheet[sheet.max_row][3:]:
            cell.number_format = INR_FORMAT

    _autosize(sheet, [8, 46, 12, 12, 14, 16, 14, 14, 14, 16])

    _write_summary(
        workbook,
        [
            ("Invoice number", invoice.number),
            ("Invoice date", invoice.invoice_date),
            ("Supplier GSTIN", invoice.supplier_gstin),
            ("Supplier GSTIN valid", _yes_no(invoice.supplier_gstin_valid)),
            ("Recipient GSTIN", invoice.recipient_gstin),
            ("Recipient GSTIN valid", _yes_no(invoice.recipient_gstin_valid)),
            ("Place of supply", invoice.place_of_supply),
            ("Line items", len(invoice.items)),
            ("Taxable value total", _num(invoice.taxable_total)),
            ("Invoice total on document", _num(invoice.invoice_total)),
            ("Confidence", invoice.confidence),
        ],
        invoice.warnings,
    )
    workbook.save(path)


# --------------------------------------------------------------------- Form 26AS

TDS_COLUMNS = (
    "Deductor",
    "TAN",
    "Section",
    "Transaction Date",
    "Date of Booking",
    "Amount Paid / Credited",
    "Tax Deducted",
    "TDS Deposited",
)


def write_form26as_xlsx(path: str, statement) -> None:
    workbook = Workbook()
    workbook.remove(workbook.active)

    for part in statement.parts:
        sheet = workbook.create_sheet(part.title[:31])
        _style_header(sheet, TDS_COLUMNS)
        for entry in part.entries:
            sheet.append(
                [
                    entry.deductor,
                    entry.tan,
                    entry.section,
                    entry.transaction_date,
                    entry.booking_date,
                    _num(entry.amount_paid),
                    _num(entry.tax_deducted),
                    _num(entry.tds_deposited),
                ]
            )
            row = sheet[sheet.max_row]
            row[3].number_format = DATE_FORMAT
            row[4].number_format = DATE_FORMAT
            for cell in row[5:]:
                cell.number_format = INR_FORMAT
        _autosize(sheet, [42, 14, 12, 18, 18, 20, 16, 16])

    _write_summary(
        workbook,
        [("Sections found", ", ".join(part.title for part in statement.parts) or "none")]
        + [(f"{part.title} entries", len(part.entries)) for part in statement.parts]
        + [
            ("Total tax deducted", _num(statement.total_tax_deducted)),
            ("Confidence", statement.confidence),
        ],
        statement.warnings,
    )
    workbook.save(path)


# ----------------------------------------------------------------------- helpers


def _period_text(start: Optional[date], end: Optional[date]) -> str:
    if start and end:
        return f"{start:%d-%m-%Y} to {end:%d-%m-%Y}"
    return "not stated on the document"


def _yes_no(value: Optional[bool]) -> str:
    if value is None:
        return "not found"
    return "yes" if value else "no — check this against the original"
