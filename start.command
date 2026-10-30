#!/bin/sh
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
sh ./start.sh
result=$?
if [ "$result" -ne 0 ]; then
  printf '\n%s\n' 'Startup stopped. Read the message above, then press Enter to close.'
  read -r answer
fi
exit "$result"
