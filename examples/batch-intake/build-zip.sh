#!/bin/bash
# Rebuild the customer-facing download served by the Batching demo.
#
# The source of truth is this folder. public/batching/Truv_Intake_Kit.zip is a
# build artifact - regenerate it whenever you change anything here, or the demo
# will hand customers a stale copy.
#
#   ./examples/batch-intake/build-zip.sh
#
# The PDFs in public/batching/ are built separately from the HTML sources kept
# alongside the guides; they are not produced by this script.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$REPO/public/batching/Truv_Intake_Kit.zip"
STAGE="$(mktemp -d)/Truv_Intake_Kit"

trap 'rm -rf "$(dirname "$STAGE")"' EXIT

mkdir -p "$STAGE"

# Everything a customer needs, and nothing internal.
for f in truv_intake.py README.md config.ini.example orders_template.csv \
         direct_example.py webhook_receiver_example.py \
         START-HERE-mac-linux.command START-HERE-windows.bat; do
    cp "$HERE/$f" "$STAGE/"
done

# Both customer-facing guides travel with the kit, so "Download the kit" really
# does mean every file the page offers.
cp "$REPO/public/batching/Truv_Batch_Setup_Guide.pdf" "$STAGE/"
cp "$REPO/public/batching/Truv_Webhooks_and_Results.pdf" "$STAGE/"

chmod +x "$STAGE/START-HERE-mac-linux.command" "$STAGE"/*.py

# The kit's license, its version, and how to tell it is the real download.
cp "$REPO/LICENSE" "$STAGE/LICENSE"
KIT_VERSION="$(sed -n 's/^VERSION = "\(.*\)"/\1/p' "$HERE/truv_intake.py")"
printf 'Truv Intake Kit %s\n' "$KIT_VERSION" > "$STAGE/VERSION"

# The demo page shows code excerpts and says they are copied from the shipped
# files. Refuse to build if any excerpt line is no longer in its file.
python3 - "$REPO/src/demos/Batching.jsx" "$HERE" <<'CHECK'
import re, sys, os
jsx, here = sys.argv[1], sys.argv[2]
src = open(jsx, encoding="utf-8").read()
bad = []
for m in re.finditer(r"f: '([\w.]+\.py)'[^\[]*?code: \[(.*?)\n\s*\],", src, re.S):
    name, body = m.group(1), m.group(2)
    shipped = open(os.path.join(here, name), encoding="utf-8").read().splitlines()
    for lit in re.findall(r"^\s*'((?:[^'\\]|\\.)*)',\s*$", body, re.M):
        line = lit.encode().decode("unicode_escape")
        if line.strip() and line not in shipped:
            bad.append("%s: %s" % (name, line))
if bad:
    sys.stderr.write("REFUSING: demo excerpts no longer match the shipped files:\n  "
                     + "\n  ".join(bad) + "\n")
    sys.exit(1)
CHECK


# Guard: never ship a real config or the internal playbook.
if ls "$STAGE"/config.ini >/dev/null 2>&1; then
    echo "REFUSING: config.ini (not .example) is staged - it may contain live keys." >&2
    exit 1
fi
if ls "$STAGE"/*INTERNAL* >/dev/null 2>&1; then
    echo "REFUSING: an INTERNAL document is staged for a public download." >&2
    exit 1
fi
if grep -rlE 'sandbox-[a-f0-9]{20,}|prod-[a-f0-9]{20,}' "$STAGE" 2>/dev/null; then
    echo "REFUSING: what looks like a real API secret is staged." >&2
    exit 1
fi

# Line endings are a correctness requirement, not cosmetics. cmd.exe parses
# .bat files by byte offset and misparses LF-only ones - unreliably, and this
# launcher has four multi-line ( ) blocks. Conversely a CR anywhere in the mac
# .command breaks its shebang. Neither failure shows up on the build machine,
# so assert both here.
for f in START-HERE-windows.bat config.ini.example orders_template.csv; do
    if [ -f "$STAGE/$f" ] && ! grep -qU $'\r' "$STAGE/$f" 2>/dev/null; then
        echo "REFUSING: $f must have CRLF line endings for Windows." >&2
        exit 1
    fi
done
if [ -f "$STAGE/START-HERE-mac-linux.command" ] && grep -qU $'\r' "$STAGE/START-HERE-mac-linux.command" 2>/dev/null; then
    echo "REFUSING: START-HERE-mac-linux.command must be LF-only; a CR breaks its shebang." >&2
    exit 1
fi

rm -f "$OUT"
( cd "$(dirname "$STAGE")" && zip -rq "$OUT" "$(basename "$STAGE")" -x '*.DS_Store' )

( cd "$(dirname "$OUT")" && shasum -a 256 "$(basename "$OUT")" > "$(basename "$OUT").sha256" )

echo "Wrote $OUT"
cat "$OUT.sha256"
unzip -l "$OUT"
