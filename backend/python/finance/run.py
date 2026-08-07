#!/usr/bin/env python3
"""Finance module entry point.

    python3 run.py --doc-type bank_statement --input in.pdf --output out.xlsx \
        --format xlsx [--bank hdfc]

Contract with the Node worker: exactly one JSON object is printed on stdout and
it contains **metadata only** — bank code, row count, confidence, warnings.
No transaction, name, account number, PAN, GSTIN or balance is ever returned,
because whatever crosses this boundary can end up in a log line, and a bank
statement in a log is the failure this whole module is designed to prevent
(spec 6, 12.7, 13.1).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Spec 12.2 — Python XML parsing is hardened before anything else is imported.
# Office formats and several PDF metadata paths are XML, and the stdlib parsers
# resolve external entities by default.
import defusedxml

defusedxml.defuse_stdlib()

import pdfplumber  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import banks  # noqa: E402
import form26as  # noqa: E402
import gst_invoice  # noqa: E402
import output  # noqa: E402
from base import ParseError, score_confidence  # noqa: E402

# Below this, the output is more likely to mislead than to help, so we say so
# loudly rather than handing over a sheet that looks authoritative.
LOW_CONFIDENCE = 0.75


def fail(code: str, message: str) -> int:
    print(json.dumps({"ok": False, "code": code, "message": message}))
    return 1


def open_pdf(path: str):
    try:
        return pdfplumber.open(path)
    except Exception as exc:  # pdfplumber raises a variety of pdfminer errors
        if "password" in str(exc).lower() or "encrypt" in str(exc).lower():
            raise ParseError(
                "ENCRYPTED_INPUT",
                "This PDF is password protected. Unlock it first with our Unlock PDF tool.",
            ) from exc
        raise ParseError(
            "CORRUPT_INPUT",
            "This PDF could not be read — it may be damaged or incomplete.",
        ) from exc


def run_bank_statement(pdf, args) -> dict:
    text = "\n".join(page.extract_text() or "" for page in pdf.pages[:3])

    if args.bank:
        parser = banks.by_code(args.bank)
        scores = {}
        if parser is None:
            raise ParseError("BANK_UNSUPPORTED", f'We do not have a parser for "{args.bank}" yet.')
    else:
        parser, scores = banks.detect(text)
        if parser is None:
            # Try the generic reader before giving up: many statements use a
            # conventional ruled table even when we cannot name the bank.
            parser = banks.GenericParser

    result = parser.parse(pdf)
    result.confidence = score_confidence(result)

    if not result.transactions:
        raise ParseError(
            "BANK_UNSUPPORTED",
            "We could not find a transaction table in this statement. If it is a scan we cannot "
            "read it yet; if it is a text PDF, tell us which bank it is from and we will add support.",
        )

    if args.format == "csv":
        output.write_tally_csv(args.output, result)
        usable = sum(1 for txn in result.transactions if txn.is_complete())
        if usable < len(result.transactions):
            result.warnings.append(
                f"{len(result.transactions) - usable} row(s) could not be read completely and were "
                "left out of the CSV. Check the statement before importing."
            )
    else:
        output.write_bank_statement_xlsx(args.output, result, parser.NAME)

    if result.confidence < LOW_CONFIDENCE:
        result.warnings.append(
            "Confidence in this extraction is low. Check the flagged rows against your statement "
            "before using the data."
        )

    return {
        "ok": True,
        "bank_code": result.bank_code,
        "rows_parsed": len(result.transactions),
        "confidence": result.confidence,
        "detection_scores": scores,
        "warnings": result.warnings,
    }


def run_gst_invoice(pdf, args) -> dict:
    invoice = gst_invoice.parse(pdf)
    if not invoice.items and not invoice.number:
        raise ParseError(
            "CORRUPT_INPUT",
            "This does not look like a text-based GST invoice. A scanned invoice needs OCR, "
            "which we do not offer yet.",
        )
    output.write_gst_invoice_xlsx(args.output, invoice)
    return {
        "ok": True,
        "bank_code": None,
        "rows_parsed": len(invoice.items),
        "confidence": invoice.confidence,
        "warnings": invoice.warnings,
    }


def run_form26as(pdf, args) -> dict:
    statement = form26as.parse(pdf)
    if not statement.parts:
        raise ParseError(
            "CORRUPT_INPUT",
            "No TDS tables were found. If this file came straight from TRACES it is password "
            "protected — unlock it first with your date of birth in DDMMYYYY form.",
        )
    output.write_form26as_xlsx(args.output, statement)
    return {
        "ok": True,
        "bank_code": None,
        "rows_parsed": sum(len(part.entries) for part in statement.parts),
        "confidence": statement.confidence,
        "warnings": statement.warnings,
    }


HANDLERS = {
    "bank_statement": run_bank_statement,
    "gst_invoice": run_gst_invoice,
    "form_26as": run_form26as,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="FileForge finance document parser")
    parser.add_argument("--doc-type", required=True, choices=sorted(HANDLERS))
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--format", default="xlsx", choices=["xlsx", "csv"])
    parser.add_argument("--bank", default=None)
    args = parser.parse_args()

    try:
        with open_pdf(args.input) as pdf:
            result = HANDLERS[args.doc_type](pdf, args)
    except ParseError as exc:
        return fail(exc.code, exc.message)
    except Exception:  # noqa: BLE001 - the message could echo document content
        return fail("CONVERSION_FAILED", "This document could not be processed.")

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
