#!/usr/bin/env python3
"""
DIRECT INTAKE - create the Truv order at the moment the application is
submitted, instead of writing a row to a CSV for later.

This is the recommended pattern. The CSV does not disappear; it changes job.
Instead of being the queue that drives order creation, it becomes the daily
record of what was already done.

--------------------------------------------------------------------------------
BEFORE (batch)                          AFTER (direct)
--------------------------------------------------------------------------------
applicant submits form                  applicant submits form
  -> row appended to today's CSV          -> order created immediately (this file)
  -> CSV sits until the next run          -> row appended to today's CSV as a LOG
  -> scheduled job creates orders         -> nothing waits
  -> applicant contacted up to 1hr late   -> applicant contacted in seconds
--------------------------------------------------------------------------------

WHAT TO CHANGE IN YOUR APPLICATION

Find the code that writes the applicant row to the CSV. It looks something like:

    writer.writerow([first_name, last_name, case_number, email, phone])

Add one line before it:

    result = create_truv_order(first_name, last_name, case_number, email, phone)

...and one column after it, so the log records what happened:

    writer.writerow([first_name, last_name, case_number, email, phone,
                     result.order_id, result.status])

That is the entire migration. The function is below, with no dependencies
beyond the Python standard library.

--------------------------------------------------------------------------------
TRY IT
--------------------------------------------------------------------------------
    export TRUV_CLIENT_ID=your_client_id
    export TRUV_ACCESS_KEY=your_access_secret
    python3 direct_example.py
--------------------------------------------------------------------------------
"""

import csv
import json
import os
import re
import time
import urllib.error
import urllib.request
from collections import namedtuple
from datetime import datetime

# There is ONE Truv API host. Sandbox versus production is decided by WHICH KEY
# PAIR you send, not by a different URL. Use sandbox keys until you have tested.
TRUV_API = "https://prod.truv.com/v1/orders/"

CLIENT_ID = os.environ.get("TRUV_CLIENT_ID", "")
ACCESS_KEY = os.environ.get("TRUV_ACCESS_KEY", "")

PRODUCTS = ["income", "assets"]        # what to verify
TEMPLATE_ID = ""                       # optional; blank = account default

TIMEOUT_SEC = 15
RETRY_STATUS = (429, 500, 502, 503, 504)
RETRY_MAX = 3

OrderResult = namedtuple("OrderResult", "ok order_id share_url status error")


# =============================================================================
# The one function your application calls
# =============================================================================

def create_truv_order(first_name, last_name, case_number=None, email=None,
                      phone=None, staff_name=None, staff_email=None,
                      cc_emails=None):
    """
    Create one Truv verification order. Returns an OrderResult.

    NEVER raises. A verification problem must not take down your application
    form - if this returns ok=False, accept the application anyway and let the
    nightly batch pick up the stragglers. That fallback is the whole reason to
    keep the CSV.

    Only first_name and last_name are required by the Truv API.
    """
    if not CLIENT_ID or not ACCESS_KEY:
        return OrderResult(False, None, None, "not_configured",
                           "TRUV_CLIENT_ID / TRUV_ACCESS_KEY are not set")

    if not (first_name or "").strip() or not (last_name or "").strip():
        return OrderResult(False, None, None, "invalid",
                           "first_name and last_name are required")

    payload = {
        "products": PRODUCTS,
        "first_name": first_name.strip(),
        "last_name": last_name.strip(),
    }

    if case_number:
        # Your own identifier: the case number plus the applicant's name, the same
        # reference truv_intake.py uses. A case often covers a household, so the
        # name keeps each person's order separate. This path does not read the
        # batch tool's ledger, so send each applicant through one path only.
        ref = "%s %s %s" % (str(case_number).strip(), first_name.strip(), last_name.strip())
        payload["order_number"] = "-".join(ref.split())

    if email:
        payload["email"] = email.strip()

    if phone:
        # Truv wants 10 digits, no country code. "(415) 555-4193" -> "4155554193"
        digits = re.sub(r"\D", "", phone)
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) == 10:
            payload["phone"] = digits

    if staff_email:
        # `manager` is a NESTED OBJECT. There is no flat order_manager_email
        # field - sending one silently drops order ownership.
        payload["manager"] = {"email": staff_email.strip()}
        if staff_name:
            payload["manager"]["name"] = staff_name.strip()

    if cc_emails:
        addrs = ([cc_emails] if isinstance(cc_emails, str)
                 else list(cc_emails))
        flat = []
        for a in addrs:
            flat.extend(x.strip() for x in re.split(r"[;,]", a) if x.strip())
        if flat:
            payload["cc_emails"] = flat[:15]      # Truv caps CCs at 15

    if TEMPLATE_ID:
        payload["template_id"] = TEMPLATE_ID

    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Access-Client-Id": CLIENT_ID,
        "X-Access-Secret": ACCESS_KEY,
    }

    last_error = None
    for attempt in range(1, RETRY_MAX + 1):
        try:
            req = urllib.request.Request(TRUV_API, data=body, headers=headers,
                                         method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return OrderResult(True, data.get("id"), data.get("share_url"),
                               "created", None)

        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:300]
            if e.code in RETRY_STATUS and attempt < RETRY_MAX:
                time.sleep(2 * attempt)
                last_error = "HTTP %s: %s" % (e.code, detail)
                continue
            # 400 means the data was wrong; 401/403 means the keys are wrong.
            # Neither is worth retrying.
            return OrderResult(False, None, None, "error",
                               "HTTP %s: %s" % (e.code, detail))

        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < RETRY_MAX:
                time.sleep(2 * attempt)
                last_error = str(e)
                continue
            return OrderResult(False, None, None, "unreachable",
                               "could not reach Truv: %s" % e)

    return OrderResult(False, None, None, "error", last_error or "unknown")


# =============================================================================
# The CSV's new job: a record of what happened, not a queue
# =============================================================================

LOG_COLUMNS = ["submitted_at", "case_number", "first_name", "last_name",
               "email", "phone", "truv_order_id", "status", "error"]


def log_to_daily_csv(folder, applicant, result):
    """Append one line to today's log. Creates the file and header if needed."""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "orders-%s.csv" % datetime.now().strftime("%Y-%m-%d"))
    is_new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=LOG_COLUMNS)
        if is_new:
            w.writeheader()
        w.writerow({
            "submitted_at": datetime.now().isoformat(timespec="seconds"),
            "case_number": applicant.get("case_number", ""),
            "first_name": applicant.get("first_name", ""),
            "last_name": applicant.get("last_name", ""),
            "email": applicant.get("email", ""),
            "phone": applicant.get("phone", ""),
            "truv_order_id": result.order_id or "",
            "status": result.status,
            "error": result.error or "",
        })
    return path


# =============================================================================
# What this looks like inside a real submit handler
# =============================================================================

def on_application_submitted(applicant, log_folder="daily-log"):
    """
    Call this from your form's submit handler, after you have saved the
    application to your own system.

    Note the order of operations: your own save happens FIRST and is what
    determines whether the applicant's submission succeeded. The Truv order is
    an additional step that must never be able to reject the application.
    """
    result = create_truv_order(
        first_name=applicant.get("first_name"),
        last_name=applicant.get("last_name"),
        case_number=applicant.get("case_number"),
        email=applicant.get("email"),
        phone=applicant.get("phone"),
        staff_name=applicant.get("staff_name"),
        staff_email=applicant.get("staff_email"),
        cc_emails=applicant.get("cc_emails"),
    )

    log_to_daily_csv(log_folder, applicant, result)

    if result.ok:
        # The applicant can be sent straight into the verification flow.
        # result.share_url is the hosted page for this specific order.
        return {"verification_started": True, "share_url": result.share_url}

    # Failed. The application is still valid - the log row records that this
    # case still needs an order, and the nightly batch will create it.
    return {"verification_started": False, "will_retry": True}


# =============================================================================
# Demo
# =============================================================================

if __name__ == "__main__":
    print(__doc__.split("TRY IT")[0])

    if not CLIENT_ID or not ACCESS_KEY:
        print("  Set TRUV_CLIENT_ID and TRUV_ACCESS_KEY to run the live demo.\n")
        raise SystemExit(1)

    demo = {
        "first_name": "Maria",
        "last_name": "Lopez",
        "case_number": "DIRECT-%s" % datetime.now().strftime("%Y%m%d%H%M%S"),
        "email": "",
        "phone": "(415) 555-4193",
        "staff_name": "Jane Doe",
        "staff_email": "jane.doe@example.org",
    }

    print("  Submitting applicant %s %s (case %s)...\n"
          % (demo["first_name"], demo["last_name"], demo["case_number"]))
    outcome = on_application_submitted(demo)

    if outcome["verification_started"]:
        print("  Order created.")
        print("  Share URL: %s" % outcome.get("share_url"))
    else:
        print("  Order NOT created - logged for the nightly batch to retry.")
    print("\n  Today's log: daily-log/orders-%s.csv\n"
          % datetime.now().strftime("%Y-%m-%d"))
