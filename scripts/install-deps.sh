#!/bin/bash
# Install everything the conversion engines need on Ubuntu 24.04.
# Safe to re-run.
set -euo pipefail

sudo apt update

# Office -> PDF. --no-install-recommends keeps this to roughly 400 MB instead
# of pulling in the whole desktop.
sudo apt install -y --no-install-recommends \
  libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress

# PDF engines.
#   ghostscript  - compression, PDF/A
#   qpdf         - encrypt, decrypt, repair, linearise
#   poppler-utils- pdfinfo, which the upload validation chain requires before
#                  any heavier engine is allowed near a file (spec 12.1 step 6)
#   util-linux   - prlimit, used to cap each engine's address space (spec 12.4)
sudo apt install -y ghostscript qpdf poppler-utils util-linux redis-server python3-pip

# Fonts. This is the single most common cause of "my converted PDF has square
# boxes" — install the Indic families from day one, not after the first
# complaint (spec 4.3).
sudo apt install -y fonts-liberation fonts-dejavu fonts-indic

# Python toolchain for worker-finance and pdf-to-word.
pip3 install --break-system-packages -r "$(dirname "$0")/../backend/python/requirements.txt"

sudo systemctl enable --now redis-server

echo
echo "Checking that everything the workers need is on PATH:"
missing=0
for binary in libreoffice gs qpdf pdfinfo python3 prlimit; do
  if command -v "$binary" >/dev/null 2>&1; then
    echo "  ok       $binary"
  else
    echo "  MISSING  $binary"
    missing=1
  fi
done

python3 - <<'PY'
import importlib.util
for module in ("pdfplumber", "openpyxl", "pdf2docx", "defusedxml"):
    status = "ok      " if importlib.util.find_spec(module) else "MISSING "
    print(f"  {status} python:{module}")
PY

if [ "$missing" -ne 0 ]; then
  echo
  echo "Some dependencies are missing — the tools that need them will fail cleanly," \
       "but fix them before going live."
  exit 1
fi

echo
echo "All conversion dependencies installed."
