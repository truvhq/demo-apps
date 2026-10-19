#!/bin/bash
# Truv Intake Tool - double-click launcher for Mac and Linux.
# This finds Python, checks the version, and starts setup.

cd "$(dirname "$0")" || exit 1

echo ""
echo "=============================================================="
echo "  Truv Intake Tool - getting started"
echo "=============================================================="
echo ""

# Find a usable Python 3.
PY=""
for candidate in python3 python3.12 python3.11 python3.10 python3.9 python3.8 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,8) else 1)' 2>/dev/null; then
            PY="$candidate"
            break
        fi
    fi
done

if [ -z "$PY" ]; then
    echo "  PROBLEM: Python 3.8 or newer was not found on this computer."
    echo ""
    echo "  WHAT TO DO:"
    echo "    1. Go to https://www.python.org/downloads/"
    echo "    2. Download and install the latest Python 3."
    echo "    3. Double-click this file again."
    echo ""
    read -r -p "  Press Enter to close. " _
    exit 1
fi

echo "  Using: $($PY --version 2>&1)  ($(command -v $PY))"
echo ""

"$PY" truv_intake.py setup
STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
    echo "  Setup finished. Next, run this to check everything:"
    echo ""
    echo "      $PY truv_intake.py doctor"
    echo ""
else
    echo "  Setup did not finish. Scroll up for the reason."
    echo ""
fi

read -r -p "  Press Enter to close. " _
