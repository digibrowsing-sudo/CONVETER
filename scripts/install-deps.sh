#!/bin/bash
set -e
sudo apt update
sudo apt install -y libreoffice --no-install-recommends
sudo apt install -y ghostscript qpdf redis-server python3-pip
pip3 install pdf2docx --break-system-packages
sudo systemctl enable --now redis-server
echo "All conversion dependencies installed."
