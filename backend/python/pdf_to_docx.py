#!/usr/bin/env python3
"""PDF -> DOCX via pdf2docx.

Called as:  python3 pdf_to_docx.py <input.pdf> <output.docx>

Paths arrive through argv and are never interpolated into source. Nothing from
the document is printed to stdout or stderr: the worker logs whatever this
script writes, and a converted document's contents must never reach a log
(spec 13.1).
"""

import sys

from defusedxml.common import EntitiesForbidden  # noqa: F401  (import asserts availability)
from pdf2docx import Converter


def has_extractable_text(pdf_path: str) -> bool:
    """A scan has pages but no text, and pdf2docx would emit an empty document."""
    try:
        import fitz  # PyMuPDF, a pdf2docx dependency
    except ImportError:
        return True  # cannot tell; let the conversion try

    with fitz.open(pdf_path) as doc:
        for page in doc:
            if page.get_text("text").strip():
                return True
    return False


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: pdf_to_docx.py <input.pdf> <output.docx>", file=sys.stderr)
        return 2

    src, dst = sys.argv[1], sys.argv[2]

    if not has_extractable_text(src):
        print("no extractable text", file=sys.stderr)
        return 3

    converter = Converter(src)
    try:
        converter.convert(dst)
    finally:
        converter.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
