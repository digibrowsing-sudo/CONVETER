#!/bin/bash
# Deploy the latest version: pull, build, restart PM2 processes.
set -e
cd "$(dirname "$0")/.."

git pull
cd frontend && npm ci && npm run build
cd ../backend && npm ci --omit=dev
cd ..
pm2 restart ecosystem.config.js
echo "Deploy complete."
