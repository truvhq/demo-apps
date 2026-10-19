#!/usr/bin/env python3
"""
Truv webhook receiver - a complete, working reference implementation.

This is a real, runnable HTTP server that does the four things every Truv
webhook receiver must do:

  1. Verify the X-WEBHOOK-SIGN signature against the RAW request body.
  2. Answer 2xx within 10 seconds.
  3. Ignore events it has already seen (idempotency on webhook_id).
  4. Fetch the actual order data only after the order is finalized.

It uses only the Python standard library so you can run it anywhere to prove
the flow works. For production, port these four behaviours into whatever web
framework you already use - do not run this as your production endpoint.

--------------------------------------------------------------------------------
RUN IT
--------------------------------------------------------------------------------
    export TRUV_CLIENT_ID=your_client_id
    export TRUV_ACCESS_KEY=your_access_secret
    python3 webhook_receiver_example.py 8080

Then expose it with a tunnel so Truv can reach it, and register the URL:

    ngrok http 8080
    python3 truv_intake.py webhook add https://YOUR-SUBDOMAIN.ngrok.io/webhooks/truv

Received orders are written to ./received/<order_number>.json and, when a PDF
is available, ./received/<order_number>.pdf
--------------------------------------------------------------------------------
"""

import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

CLIENT_ID = os.environ.get("TRUV_CLIENT_ID", "")
ACCESS_KEY = os.environ.get("TRUV_ACCESS_KEY", "")
API_BASE = "https://prod.truv.com/v1"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "received")

# In production use a database or Redis. An in-memory set is lost on restart,
# which would let a redelivered event be processed twice.
SEEN_WEBHOOK_IDS = set()


# =============================================================================
# 1. Signature verification
# =============================================================================

def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """
    Truv sends: X-WEBHOOK-SIGN: v1=<hex hmac-sha256 of the raw body>
    The key is your Access Secret.

    The signature MUST be computed over the raw bytes exactly as received.
    Parsing JSON and re-serializing changes the bytes and the check will fail.
    """
    if not signature_header:
        return False
    expected = "v1=" + hmac.new(
        key=secret.encode("utf-8"),
        msg=raw_body,
        digestmod=hashlib.sha256,
    ).hexdigest()
    # compare_digest avoids leaking timing information.
    return hmac.compare_digest(expected, signature_header)


# =============================================================================
# 4. Fetching results after the order is done
# =============================================================================

def api_get(path, query=None, raw=False):
    url = API_BASE.rstrip("/") + path
    if query:
        # urllib.parse is imported at module scope on purpose. Importing it here
        # would make `urllib` a function-local name and turn the urllib.request
        # call below into an UnboundLocalError.
        url += "?" + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers={
        "X-Access-Client-Id": CLIENT_ID,
        "X-Access-Secret": ACCESS_KEY,
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
    return body if raw else json.loads(body.decode("utf-8"))


def fetch_and_store(order_id):
    """Pull the finished order, save the JSON, and save any PDF reports."""
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        order = api_get("/orders/%s/" % order_id)
    except urllib.error.HTTPError as e:
        log("could not fetch order %s: HTTP %s %s"
            % (order_id, e.code, e.read().decode("utf-8", "replace")[:200]))
        return
    except urllib.error.URLError as e:
        log("could not reach Truv to fetch order %s: %s" % (order_id, e))
        return

    label = order.get("order_number") or order_id
    safe = "".join(c for c in str(label) if c.isalnum() or c in "-_") or order_id

    json_path = os.path.join(OUT_DIR, "%s.json" % safe)
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(order, fh, indent=2)
    log("saved %s" % json_path)

    # PDF reports live on each suborder: one per employer / financial account.
    pdf_urls = []
    for group in ("employers", "financial_accounts"):
        for item in order.get(group) or []:
            if item.get("pdf_report"):
                pdf_urls.append(item["pdf_report"])

    for i, url in enumerate(pdf_urls, start=1):
        suffix = "" if len(pdf_urls) == 1 else "-%d" % i
        pdf_path = os.path.join(OUT_DIR, "%s%s.pdf" % (safe, suffix))
        try:
            req = urllib.request.Request(url, headers={
                "X-Access-Client-Id": CLIENT_ID,
                "X-Access-Secret": ACCESS_KEY,
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            with open(pdf_path, "wb") as fh:
                fh.write(data)
            log("saved %s (%d KB)" % (pdf_path, len(data) // 1024))
        except (urllib.error.URLError, OSError) as e:
            log("could not download PDF %s: %s" % (url, e))

    if not pdf_urls:
        log("order %s has no PDF report - the connection may not have completed"
            % label)

    # The assets (VOA) report is different: one consolidated report for the
    # whole order, referenced by ID at the top level and fetched from its own
    # endpoint. The loop above never sees it.
    if order.get("voa_report_id") and order.get("user_id"):
        voa_path = os.path.join(OUT_DIR, "%s-assets.pdf" % safe)
        try:
            data = api_get("/users/%s/assets/reports/%s/"
                           % (order["user_id"], order["voa_report_id"]),
                           query={"fmt": "pdf"}, raw=True)
            with open(voa_path, "wb") as fh:
                fh.write(data)
            log("saved %s (%d KB)" % (voa_path, len(data) // 1024))
        except (urllib.error.URLError, OSError) as e:
            log("could not download assets report for %s: %s" % (label, e))


# =============================================================================
# The handler
# =============================================================================

def log(msg):
    print("%s  %s" % (datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def handle_event(event):
    """Decide what to do with a verified event. Runs AFTER we replied 200."""
    etype = event.get("event_type")
    order_id = event.get("order_id")

    if etype == "order-finalized":
        # The order has reached its terminal state. Nothing more will change.
        # THIS is the signal to pull results.
        log("order %s finalized - fetching results" % event.get("order_number") or order_id)
        fetch_and_store(order_id)

    elif etype == "order-status-updated":
        # Fires per suborder (one employer or one financial account), not once
        # per order. Do not treat this as "the order is done".
        log("suborder update on %s: status=%s employer=%s"
            % (order_id, event.get("status"), event.get("employer_id")))

    elif etype == "task-status-updated":
        # Fires on individual connection attempts, including failures.
        status = event.get("status")
        if status in ("login_error", "mfa_error", "config_error"):
            log("applicant hit a problem connecting: %s (order %s)" % (status, order_id))
        elif status == "done":
            log("a connection finished downloading data (order %s)" % order_id)

    elif etype == "certification-completed":
        log("applicant submitted self-certification for order %s" % order_id)

    else:
        log("event %s (no handler)" % etype)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        if self.path.rstrip("/") not in ("/webhooks/truv", "/webhooks", ""):
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length)

        # --- 1. Verify BEFORE doing anything else --------------------------
        signature = self.headers.get("X-WEBHOOK-SIGN", "")
        if not ACCESS_KEY:
            log("REFUSING: TRUV_ACCESS_KEY is not set, cannot verify signatures")
            self._reply(500, "server misconfigured")
            return
        if not verify_signature(raw_body, signature, ACCESS_KEY):
            log("REJECTED: bad or missing signature (%s)" % (signature or "none"))
            self._reply(401, "invalid signature")
            return

        try:
            event = json.loads(raw_body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            log("REJECTED: body was not valid JSON")
            self._reply(400, "invalid json")
            return

        # --- 3. Idempotency -------------------------------------------------
        wid = event.get("webhook_id")
        if wid and wid in SEEN_WEBHOOK_IDS:
            log("duplicate delivery %s - acknowledged, not reprocessed" % wid)
            self._reply(200, "already processed")
            return
        if wid:
            SEEN_WEBHOOK_IDS.add(wid)

        # --- 2. Answer fast, THEN do the slow work --------------------------
        # Truv gives you 10 seconds. Fetching an order and a PDF can exceed
        # that, so in production you would enqueue here and return immediately.
        self._reply(200, "ok")

        try:
            handle_event(event)
        except Exception as e:  # never let a handler error crash the server
            log("handler error: %s" % e)

    def do_GET(self):
        # A health check so you can confirm the server is reachable.
        self._reply(200, "truv webhook receiver is running")

    def _reply(self, code, text):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *a):
        pass  # we do our own logging


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    if not CLIENT_ID or not ACCESS_KEY:
        print("\n  WARNING: TRUV_CLIENT_ID / TRUV_ACCESS_KEY are not set.")
        print("  Signature verification and result fetching will not work.\n")
        print("  export TRUV_CLIENT_ID=...")
        print("  export TRUV_ACCESS_KEY=...\n")

    print("Truv webhook receiver listening on http://0.0.0.0:%d" % port)
    print("  endpoint:     POST /webhooks/truv")
    print("  health check: GET  /")
    print("  output:       %s" % OUT_DIR)
    print("\nExpose it with:  ngrok http %d" % port)
    print("Register it:     python3 truv_intake.py webhook add https://<your-tunnel>/webhooks/truv")
    print("\nCtrl-C to stop.\n")
    try:
        HTTPServer(("0.0.0.0", port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.\n")


if __name__ == "__main__":
    main()
