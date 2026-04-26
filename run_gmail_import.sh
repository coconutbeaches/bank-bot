#!/bin/zsh
set -euo pipefail

cd /Users/tyler/Projects/bank-bot

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' \
  /Users/tyler/Projects/bank-bot/import_bbl_emails.ts \
  --gmail true \
  "$@"
