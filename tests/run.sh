#!/usr/bin/env bash
# Runs the pipeline tests: starts a static server on $PORT (default 8781), runs every tests/*.test.js (or the ones named
# on the command line, e.g. `tests/run.sh early resume`), prints a summary and exits non-zero if anything failed.
set -u
cd "$(dirname "$0")/.."
export PORT="${PORT:-8781}"
# playwright may be installed globally
if ! node -e "require('playwright')" >/dev/null 2>&1; then export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"; fi
if ! node -e "require('playwright')" >/dev/null 2>&1; then echo "playwright is not installed (npm i -D playwright && npx playwright install chromium)"; exit 2; fi

# 1) the page script must parse
node - <<'EOF' || { echo "FAIL index.html script does not parse"; exit 1; }
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const html = fs.readFileSync('index.html', 'utf8'), all = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length);
const f = path.join(os.tmpdir(), 'hudhud-app-' + process.pid + '.js'); fs.writeFileSync(f, all[0]);
try{ cp.execFileSync(process.execPath, ['--check', f], {stdio:'inherit'}); console.log('PASS index.html script parses'); } finally { fs.unlinkSync(f); }
EOF

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/index.html" && break; sleep 0.25; done

if [ $# -gt 0 ]; then FILES=""; for n in "$@"; do FILES="$FILES tests/${n%.test.js}.test.js"; done; else FILES=$(ls tests/*.test.js); fi
FAILED=""
for f in $FILES; do
  echo "=== $f"
  OUT=$(timeout "${TEST_TIMEOUT:-240}" node "$f" 2>&1); CODE=$?
  echo "$OUT" | grep -E "PASS|FAIL|Error|error:" | cut -c1-600
  [ -n "${VERBOSE:-}" ] && echo "$OUT"
  if [ $CODE -ne 0 ] || echo "$OUT" | grep -qE "(^| )FAIL( |$)" || ! echo "$OUT" | grep -q "PASS"; then FAILED="$FAILED $f"; echo "--- failed (exit $CODE)"; [ -z "${VERBOSE:-}" ] && echo "$OUT" | tail -n 15 | cut -c1-900; fi
done
echo
if [ -n "$FAILED" ]; then echo "FAILED:$FAILED"; exit 1; fi
echo "ALL TESTS PASSED"
