#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 22 or later (includes npm): https://nodejs.org/'
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Node.js 22 or later is required.");process.exit(1)}'
printf '\n%s\n' 'Open http://127.0.0.1:3210 in your browser.' 'Keep this terminal open. Press Ctrl+C to stop.'
exec npm start
