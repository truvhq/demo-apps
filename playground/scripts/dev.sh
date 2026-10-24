#!/usr/bin/env bash
# Boots the full local dev stack: POS backend+frontend, LOS backend+frontend,
# an ngrok tunnel to LOS, and Truv webhook registration against that tunnel.
#
# Usage: ./scripts/dev.sh [--no-ngrok]
#   --no-ngrok   skip ngrok + webhook registration (Embedded Orders and manual
#                "Check Status & Apply" / "Refresh from Truv" buttons still
#                work fully without it — only live webhook push needs the tunnel)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source .venv/bin/activate

PIDS=()
cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "Starting POS backend on :8000..."
(cd pos && python manage.py runserver 8000) > /tmp/truv-demo-pos-backend.log 2>&1 &
PIDS+=($!)

echo "Starting LOS backend on :8001..."
(cd los && python manage.py runserver 8001) > /tmp/truv-demo-los-backend.log 2>&1 &
PIDS+=($!)

sleep 2

echo "Starting POS frontend on :5183..."
(cd pos/frontend && npm run dev) > /tmp/truv-demo-pos-frontend.log 2>&1 &
PIDS+=($!)

echo "Starting LOS frontend on :5184..."
(cd los/frontend && npm run dev) > /tmp/truv-demo-los-frontend.log 2>&1 &
PIDS+=($!)

if [[ "${1:-}" != "--no-ngrok" ]]; then
  if ! command -v ngrok >/dev/null 2>&1; then
    echo "ngrok not found on PATH — skipping tunnel + webhook registration."
    echo "Install it (https://ngrok.com/download) or pass --no-ngrok to silence this."
  else
    echo "Starting ngrok tunnel to LOS (:8001)..."
    ngrok http 8001 --log stdout > /tmp/truv-demo-ngrok.log 2>&1 &
    PIDS+=($!)

    echo "Waiting for ngrok's local API..."
    NGROK_URL=""
    for _ in $(seq 1 20); do
      sleep 1
      NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
        | python -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(next((x['public_url'] for x in t if x['public_url'].startswith('https')), ''))" 2>/dev/null || true)
      [[ -n "$NGROK_URL" ]] && break
    done

    if [[ -z "$NGROK_URL" ]]; then
      echo "Could not read ngrok's public URL from http://127.0.0.1:4040/api/tunnels — skipping webhook registration."
    else
      echo "ngrok tunnel: $NGROK_URL"
      # Update (or add) NGROK_URL in .env
      if grep -q '^NGROK_URL=' .env; then
        sed -i.bak "s|^NGROK_URL=.*|NGROK_URL=${NGROK_URL}|" .env && rm -f .env.bak
      else
        echo "NGROK_URL=${NGROK_URL}" >> .env
      fi

      echo "Registering Truv webhooks against the tunnel..."
      (cd los && python manage.py register_truv_webhook) || \
        echo "Webhook registration failed or skipped (no active credential set yet? add one in Settings, then re-run: cd los && python manage.py register_truv_webhook)"
    fi
  fi
fi

echo ""
echo "=========================================================="
echo " POS:  http://localhost:5183"
echo " LOS:  http://localhost:5184"
echo "=========================================================="
echo "Press Ctrl+C to stop everything."
wait
