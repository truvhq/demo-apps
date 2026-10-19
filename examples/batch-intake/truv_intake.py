#!/usr/bin/env python3
"""
Truv Intake Tool - create Truv verification orders from CSV files, or directly
from your own application.

You do not need to read this file to use it. Run:

    python3 truv_intake.py setup

...and answer the questions. Everything else is automatic.

--------------------------------------------------------------------------------
COMMANDS
--------------------------------------------------------------------------------
  setup            Interactive first-time setup. Start here. Safe to re-run.
  doctor           Check the whole setup and report PASS/FAIL for each item.
  selftest         Create one real test order to prove the connection works.
  template         Write a blank CSV you can fill in.
  validate FILE    Check a CSV for problems. Creates nothing, sends nothing.
  run              THE SCHEDULED COMMAND. Processes everything in input/.
  send FILE        Process one specific CSV right now.
  direct           Create a single order from command-line values.
  webhook list     Show the webhooks configured on your account.
  webhook add URL  Register a webhook so results are pushed to your system.
  fetch ORDER_ID   Download an order's data as JSON, or its report as PDF.
  schedule         Mac: install the hourly job. Elsewhere: show how.
  version          Print the tool version.

Requires Python 3.8 or newer. Uses only the Python standard library - there is
nothing to install.
--------------------------------------------------------------------------------
"""

import sys

VERSION = "2.2"
MIN_PY = (3, 8)

# ------------------------------------------------------------------ python gate
# This check runs before any other import so that an old Python still gets a
# readable message instead of a SyntaxError.
if sys.version_info < MIN_PY:
    sys.stderr.write(
        "\n"
        "  This tool needs Python %d.%d or newer.\n"
        "  You are running Python %d.%d.\n\n"
        "  WHAT TO DO: install a current Python from https://www.python.org/downloads/\n"
        "  then run this command again.\n\n" % (
            MIN_PY[0], MIN_PY[1], sys.version_info[0], sys.version_info[1])
    )
    raise SystemExit(1)

import argparse
import configparser
import csv
import getpass
import hashlib
import hmac
import json
import os
import platform
import re
import smtplib
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from email.message import EmailMessage

# ------------------------------------------------------------------- constants
HERE = os.path.dirname(os.path.abspath(__file__))
PY_CMD = "py -3" if os.name == "nt" else "python3"
CONFIG_PATH = os.path.join(HERE, "config.ini")
STATE_DIR = os.path.join(HERE, "state")
LEDGER_PATH = os.path.join(STATE_DIR, "ledger.csv")
LOCK_PATH = os.path.join(STATE_DIR, ".run.lock")
SANDBOX_MARKER = os.path.join(STATE_DIR, ".sandbox_verified")

LOCK_MAX_AGE_SEC = 2 * 60 * 60
HTTP_TIMEOUT = 30
MAX_CC_EMAILS = 15
RETRY_STATUS = (429, 500, 502, 503, 504)
RETRY_MAX = 3
RETRY_BACKOFF_SEC = 2
RETRY_AFTER_GIVE_UP_SEC = 60

# The order limit is counted in ORDERS PER HOUR, not requests per minute: an
# account can create 3,000 orders an hour, and those may arrive as one batch of
# 3,000, two of 1,500, or 3,000 single calls (confirmed with Truv engineering).
# So a whole file goes in one request and there is nothing to pace per row. The
# gentle per-minute floor below only stops the housekeeping calls - status polls,
# credential checks - from hammering the API.
MAX_ORDERS_PER_BATCH = 3000
DEFAULT_RPM = 240
_last_call_at = [0.0]

# A whole file goes to the batch endpoint in ONE request; Truv creates the orders
# in the background and reports the outcome of each one. These bound the wait for
# that job so a scheduled run reports rather than hanging forever.
BATCH_POLL_INTERVAL_SEC = 5
BATCH_POLL_TIMEOUT_SEC = 3600

# There is ONE Truv API host. Sandbox vs production is decided by WHICH KEY PAIR
# you use, not by a different URL. This is the single most common and most
# expensive mistake, so the tool guards it explicitly.
API_BASE = "https://prod.truv.com/v1"

COLUMNS = ["first_name", "last_name", "case_number", "email", "phone",
           "staff_name", "staff_email", "cc_emails", "force_new"]
REQUIRED_COLUMNS = ["first_name", "last_name"]

# Common header names from case systems, mapped to the tool's columns. Matching
# happens after normalize_header(), so case, spaces and hyphens already do not
# matter. Anything else can be mapped in config.ini under [columns].
HEADER_ALIASES = {
    "first_name": ("first", "firstname", "fname", "given_name", "givenname",
                   "applicant_first_name"),
    "last_name": ("last", "lastname", "lname", "surname", "family_name",
                  "familyname", "applicant_last_name"),
    "case_number": ("case", "case_id", "caseid", "case_no", "case_num", "case_#",
                    "casenumber", "case_nbr"),
    "email": ("email_address", "emailaddress", "e_mail", "applicant_email"),
    "phone": ("phone_number", "phonenumber", "mobile", "mobile_phone", "cell",
              "cell_phone", "telephone"),
    "staff_email": ("worker_email", "caseworker_email", "case_worker_email"),
    "staff_name": ("worker_name", "caseworker_name", "case_worker_name"),
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

LEDGER_FIELDS = ["key", "order_id", "created_at", "source_file", "environment"]
RESULT_FIELDS = ["key", "row", "status", "order_id", "share_url", "error"]

CONFIG_TEMPLATE = """\
# ==============================================================================
# Truv Intake Tool configuration
#
# THIS FILE CONTAINS SECRETS. Keep it readable only by the account that runs the
# tool. On Mac/Linux the tool does this for you (chmod 600). On Windows, restrict
# the file to the service account in Properties -> Security.
# ==============================================================================

[truv]
# Paste the two values from the Truv Dashboard -> Development -> API Keys.
client_id = REPLACE_ME
access_key = REPLACE_ME

# Which key pair did you paste above? Either "sandbox" or "production".
# IMPORTANT: the API URL is the same either way. Switching to production means
# swapping the KEYS above, then changing this label to match.
environment = sandbox

# Which verifications to request on each order. Comma-separated.
products = income,assets

# Optional. Leave blank to use your account's default template.
template_id =

[folders]
input = input
processed = processed
failed = failed
logs = logs

[email]
# Optional. Off until you set it up. When on, the tool connects to your mail
# server (SMTP) as well as to Truv.
enabled = false
smtp_host = REPLACE_ME
smtp_port = 587
use_tls = true
smtp_user = REPLACE_ME
smtp_password = REPLACE_ME
from_addr = truv-orders@example.org

# Who gets the operations summary after every run. Comma-separated.
to_addrs = REPLACE_ME

# Email a summary even when there was nothing to do. Recommended: true.
# With this on, if the summary stops arriving, the tool or the machine is down.
send_on_noop = true

# Email each row's staff_email and cc_emails a confirmation listing the lines
# that became orders. No verification results are ever included.
send_row_confirmations = true

[safety]
# Refuse to run against production until a sandbox selftest has passed.
# Leave this on. It is what stops an untested setup from touching real people.
require_sandbox_first = true

# Your account can create 3,000 orders per hour, and one request may carry all
# 3,000. A file larger than this is rejected with instructions rather than
# half-sent - split it across runs.
max_orders_per_run = 3000

# Only paces housekeeping calls (status polls, credential checks). Order volume is
# limited by the hourly order count above, not by this.
max_requests_per_minute = 240

# Delete files older than this many days from the processed, failed and logs
# folders at the start of each run. They hold applicant names. 0 = keep forever.
retention_days = 0

[columns]
# Optional. If your export uses column names the tool does not recognize, map
# them here: tool_column = Your Header. Examples:
# first_name = Applicant First
# case_number = Program Case Ref
"""


# =============================================================================
# Output helpers - every failure tells the operator what to DO.
# =============================================================================

def _supports_color():
    return sys.stdout.isatty() and os.environ.get("TERM") != "dumb" and os.name != "nt"


C_OK = "\033[32m" if _supports_color() else ""
C_BAD = "\033[31m" if _supports_color() else ""
C_WARN = "\033[33m" if _supports_color() else ""
C_DIM = "\033[2m" if _supports_color() else ""
C_OFF = "\033[0m" if _supports_color() else ""


def say(msg=""):
    print(msg)


def ok(msg):
    print("  %sPASS%s  %s" % (C_OK, C_OFF, msg))


def bad(msg):
    print("  %sFAIL%s  %s" % (C_BAD, C_OFF, msg))


def warn(msg):
    print("  %sWARN%s  %s" % (C_WARN, C_OFF, msg))


def die(problem, what_to_do):
    """Exit with a message an operator can act on without calling anyone."""
    sys.stdout.flush()
    sys.stderr.write("\n  %sPROBLEM%s  %s\n\n" % (C_BAD, C_OFF, problem))
    sys.stderr.write("  WHAT TO DO: %s\n\n" % what_to_do)
    raise SystemExit(1)


def rule(title=""):
    print("\n" + "-" * 78)
    if title:
        print(title)
        print("-" * 78)


class Logger:
    def __init__(self, logs_dir=None):
        self.lines = []
        self.path = None
        if logs_dir:
            os.makedirs(logs_dir, exist_ok=True)
            self.path = os.path.join(
                logs_dir, "run-%s.log" % datetime.now().strftime("%Y%m%d"))

    def log(self, msg):
        line = "%s  %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
        print(line)
        self.lines.append(line)
        if self.path:
            try:
                with open(self.path, "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
                make_private(self.path)
            except OSError:
                pass


# =============================================================================
# Config
# =============================================================================

def load_config(required=True):
    if not os.path.exists(CONFIG_PATH):
        if not required:
            return None
        die("There is no config.ini in %s" % HERE,
            "Run:  python3 truv_intake.py setup")
    cfg = configparser.ConfigParser()
    try:
        cfg.read(CONFIG_PATH, encoding="utf-8")
    except configparser.Error as e:
        die("config.ini could not be read: %s" % e,
            "Fix the line mentioned above, or delete config.ini and run "
            "`python3 truv_intake.py setup` again.")
    return cfg


# Truv access secrets carry their own environment as a prefix. The key - and
# nothing else - decides whether an order is real: the API host is the same for
# both. Every X-Access-Secret starts with its environment - "sandbox-",
# "prod-" or "dev-". The client_id is NOT prefixed, so the secret is the
# only witness we have. `environment` in config.ini is a hand-typed label; it is
# a claim, not evidence, and it is never trusted on its own.
KEY_ENV_PREFIXES = (("sandbox-", "sandbox"), ("prod-", "production"), ("dev-", "dev"))


def env_from_key(access_key):
    """The environment this access secret actually belongs to.

    Returns "sandbox", "production", "dev", or None when the prefix is not one
    Truv issues. Never guesses - an unrecognized key returns None so callers can
    refuse outright instead of assuming the safe answer.
    """
    key = (access_key or "").strip().lower()
    for prefix, env in KEY_ENV_PREFIXES:
        if key.startswith(prefix):
            return env
    return None


def truv_settings(cfg):
    client_id = os.environ.get("TRUV_CLIENT_ID") or cfg.get("truv", "client_id", fallback="")
    access_key = os.environ.get("TRUV_ACCESS_KEY") or cfg.get("truv", "access_key", fallback="")
    return {
        "client_id": client_id.strip(),
        "access_key": access_key.strip(),
        "environment": cfg.get("truv", "environment", fallback="sandbox").strip().lower(),
        # What the KEY says, as opposed to what config.ini claims. Any disagreement
        # is fatal - see enforce_environment().
        "key_environment": env_from_key(access_key),
        "products": [p.strip() for p in cfg.get("truv", "products", fallback="income,assets").split(",") if p.strip()],
        "template_id": cfg.get("truv", "template_id", fallback="").strip(),
    }


def creds_are_placeholder(truv):
    return (not truv["client_id"] or not truv["access_key"]
            or "REPLACE_ME" in (truv["client_id"] + truv["access_key"]))


def make_private(path):
    """Owner-only permissions for files that hold applicant data. Best effort:
    on Windows, folder permissions are what protect these files."""
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def folder(cfg, name):
    path = cfg.get("folders", name, fallback=name)
    return path if os.path.isabs(path) else os.path.join(HERE, path)


def ensure_folders(cfg):
    made = []
    for key in ("input", "processed", "failed", "logs"):
        p = folder(cfg, key)
        if not os.path.isdir(p):
            os.makedirs(p, exist_ok=True)
            made.append(os.path.basename(p))
    os.makedirs(STATE_DIR, exist_ok=True)
    return made


def lock_down_config():
    """Restrict config.ini permissions. Best-effort; Windows is a no-op."""
    try:
        if os.name != "nt":
            os.chmod(CONFIG_PATH, 0o600)
            return True
    except OSError:
        pass
    return False


# =============================================================================
# HTTP - one place, with retries on transient failures
# =============================================================================

def api_call(method, path, truv, payload=None, query=None, expect_bytes=False, rpm=DEFAULT_RPM):
    """Call the Truv API. Returns (status_code, parsed_or_bytes). Retries 5xx/429."""
    url = API_BASE.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode(query)

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "X-Access-Client-Id": truv["client_id"],
        "X-Access-Secret": truv["access_key"],
        "User-Agent": "TruvIntakeTool/%s" % VERSION,
    }
    if data is not None:
        headers["Content-Type"] = "application/json"

    # Stay under the documented per-key rate limit rather than relying on network
    # latency to throttle us. A fast server would otherwise blow past 300/min.
    if rpm and rpm > 0:
        min_gap = 60.0 / rpm
        elapsed = time.time() - _last_call_at[0]
        if elapsed < min_gap:
            time.sleep(min_gap - elapsed)

    last_err = None
    for attempt in range(1, RETRY_MAX + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                _last_call_at[0] = time.time()
                raw = resp.read()
                if expect_bytes:
                    return resp.status, raw
                if not raw:
                    return resp.status, {}
                return resp.status, json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            _last_call_at[0] = time.time()
            body = e.read().decode("utf-8", errors="replace")
            if e.code in RETRY_STATUS and attempt < RETRY_MAX:
                # Truv sends Retry-After on 429 and the docs require honoring it.
                # Fall back to exponential backoff when the header is absent.
                wait = RETRY_BACKOFF_SEC * attempt
                if e.code == 429:
                    hdr = e.headers.get("Retry-After") if e.headers else None
                    try:
                        wait = max(wait, int(float(hdr)))
                    except (TypeError, ValueError):
                        wait = min(60, max(1, RETRY_BACKOFF_SEC ** attempt))
                    # The order limit is hourly. A long Retry-After means the hour
                    # has to roll over: sleeping through it in a scheduled run helps
                    # nobody, so stop now and let advice() say what to do.
                    if wait > RETRY_AFTER_GIVE_UP_SEC:
                        raise TruvError(e.code, body)
                time.sleep(wait)
                last_err = "HTTP %s: %s" % (e.code, body[:300])
                continue
            raise TruvError(e.code, body)
        except (urllib.error.URLError, ssl.SSLError, TimeoutError) as e:
            if attempt < RETRY_MAX:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
                last_err = str(e)
                continue
            raise TruvError(None, "Could not reach %s (%s)" % (url, e))
    raise TruvError(None, last_err or "unknown transport error")


class TruvError(Exception):
    def __init__(self, status, body):
        self.status = status
        self.body = body
        super().__init__("HTTP %s: %s" % (status, body) if status else str(body))

    def advice(self):
        """Plain-English next step for the most common API failures."""
        if self.status in (401, 403):
            return ("Your Client ID or Access Secret is wrong, or it belongs to a "
                    "different environment. Re-copy both values from the Truv "
                    "Dashboard -> Development -> API Keys and run "
                    "`python3 truv_intake.py setup` again.")
        if self.status == 400:
            return ("Truv rejected the data in one or more rows. The message above "
                    "names the field. Fix the CSV and drop it back into input/.")
        if self.status == 404:
            return "That order ID does not exist on this account."
        if self.status == 429:
            return ("You have hit the order limit for this account: 3,000 orders per "
                    "hour. Splitting the file does not help inside the same hour - "
                    "wait for the hour to roll over and drop the file back into the "
                    "input folder. Nothing already created will be created again.")
        if self.status is None:
            return ("This machine could not reach prod.truv.com. Check internet "
                    "access and whether a firewall or proxy is blocking outbound "
                    "HTTPS on port 443.")
        return "Send this whole message to your Truv contact."


# =============================================================================
# CSV / order building
# =============================================================================

def normalize_phone(raw):
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def split_emails(raw):
    return [e.strip() for e in re.split(r"[;,]", raw or "") if e.strip()]


def collect_cc(row):
    # `dfo_email` is read only for backwards compatibility with an older export
    # format that used that column name. It is not part
    # of COLUMNS, the template or the docs - new customers just use cc_emails. Kept
    # so an older export keeps working rather than silently dropping a recipient.
    cc = []
    for key in ("dfo_email", "cc_emails"):
        for addr in split_emails(row.get(key, "")):
            if addr not in cc:
                cc.append(addr)
    return cc


def recipients_for_row(row):
    """Who gets the per-line confirmation: staff_email + CCs. Never the applicant."""
    out = []
    staff = (row.get("staff_email") or "").strip()
    if staff:
        out.append(staff)
    for addr in collect_cc(row):
        if addr not in out:
            out.append(addr)
    return out


SAMPLE_DOMAINS = ("@example.com", "@example.org", "@example.net")


def row_errors(row, require_staff_email):
    problems = []
    if (row.get("email") or "").strip().lower().endswith(SAMPLE_DOMAINS):
        problems.append("this looks like a sample row from the template (example.com "
                        "address) - delete it before sending real orders")
    for col in REQUIRED_COLUMNS:
        if not (row.get(col) or "").strip():
            problems.append("missing %s" % col)

    staff = (row.get("staff_email") or "").strip()
    if require_staff_email and not staff:
        problems.append("missing staff_email")
    elif staff and not EMAIL_RE.match(staff):
        problems.append("staff_email is not a valid email address")

    email = (row.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        problems.append("email is not a valid email address")

    if (row.get("phone") or "").strip() and len(normalize_phone(row.get("phone"))) != 10:
        problems.append("phone is not 10 digits after removing punctuation")

    bad_cc = [a for a in collect_cc(row) if not EMAIL_RE.match(a)]
    if bad_cc:
        problems.append("invalid cc email(s): " + ", ".join(bad_cc))
    if len(collect_cc(row)) > MAX_CC_EMAILS:
        problems.append("more than %d cc emails" % MAX_CC_EMAILS)
    return problems


def order_number_for(row, stamp=None):
    """The order reference Truv stores: the case number plus the applicant's name.

    order_number must be unique within the environment, and the BATCH endpoint
    deduplicates on it - an order whose number already exists is skipped and
    reported as `existing`. A benefits case routinely covers a whole household, so
    sending the bare case number would create an order for the first person and
    silently attach everyone after them to it. Verified against sandbox: three
    household members on one case number produced ONE order.

    Adding the name makes each applicant their own order. In the dashboard the
    reference reads `CASE-1001-Maria-Lopez`; searching the case number still finds
    the whole household because every reference starts with it.
    """
    case = (row.get("case_number") or "").strip()
    if not case:
        return ""
    name = "%s %s" % ((row.get("first_name") or "").strip(),
                      (row.get("last_name") or "").strip())
    ref = re.sub(r"\s+", "-", ("%s %s" % (case, name)).strip())
    # A force_new row is a deliberate repeat (redetermination, expired order).
    # Truv's batch endpoint treats an order_number it already has as `existing`
    # and creates NOTHING, so a repeat needs its own reference. The run stamp
    # keeps it unique and still starts with the case number for searching.
    if is_truthy(row.get("force_new")) and stamp:
        ref = "%s-R%s" % (ref, stamp)
    return ref


def build_payload(row, truv, stamp=None):
    """Build the POST /v1/orders/ body. Field names verified against openapi.yaml."""
    payload = {
        "products": truv["products"],
        "first_name": (row.get("first_name") or "").strip(),
        "last_name": (row.get("last_name") or "").strip(),
    }
    order_number = order_number_for(row, stamp)
    if order_number:
        payload["order_number"] = order_number
    if (row.get("email") or "").strip():
        payload["email"] = row["email"].strip()
    phone = normalize_phone(row.get("phone", ""))
    if phone:
        payload["phone"] = phone

    staff = (row.get("staff_email") or "").strip()
    if staff:
        manager = {"email": staff}
        if (row.get("staff_name") or "").strip():
            manager["name"] = row["staff_name"].strip()
        # `manager` is a nested object. There is no flat order_manager_email field.
        payload["manager"] = manager

    cc = collect_cc(row)
    if cc:
        payload["cc_emails"] = cc[:MAX_CC_EMAILS]
    if truv["template_id"]:
        payload["template_id"] = truv["template_id"]
    return payload


def normalize_header(name):
    """Make a column name match regardless of how the export cased or spaced it.

    Real exports arrive as "First_Name", "FIRST NAME", " first-name ". They all
    mean the same column, and rejecting a whole file over capitalization is not
    a defensible reason to verify nobody that day.
    """
    h = (name or "").strip().lower()
    return re.sub(r"[\s\-]+", "_", h)


def sniff_delimiter(first_line):
    """Which character separates the columns?

    Excel writes semicolon-separated files on any machine whose locale uses a
    comma for decimals - most of Europe and Latin America - and calls the result
    a .csv. Tab-separated files get saved as .csv by hand just as often. Guessing
    from the header line is reliable because header names never contain these.
    """
    candidates = [(first_line.count(d), d) for d in (",", ";", "\t", "|")]
    best_count, best = max(candidates)
    return best if best_count else ","


class NotACsv(Exception):
    """The file is not a CSV at all - say so plainly instead of failing oddly."""


def canonical_header(name, custom=None):
    h = normalize_header(name)
    if custom and h in custom:
        return custom[h]
    for col, alts in HEADER_ALIASES.items():
        if h in alts:
            return col
    return h


def detect_format(path):
    """Spot files that are not text CSV before csv tries to parse them."""
    with open(path, "rb") as fh:
        head = fh.read(512)
    if head.startswith(b"PK\x03\x04") or head.startswith(b"\xd0\xcf\x11\xe0"):
        raise NotACsv("This is an Excel workbook saved with a .csv name, not a CSV. "
                      "Open it in Excel and use File > Save As > CSV UTF-8 "
                      "(Comma delimited).")
    if head.startswith(b"\xff\xfe") or head.startswith(b"\xfe\xff"):
        return "utf-16"
    if b"\x00" in head:
        raise NotACsv("This file is not plain text (it contains null bytes). "
                      "Re-save it as CSV UTF-8 (Comma delimited).")
    return None


def read_rows(path, custom_headers=None):
    """Read a CSV, tolerating how Windows and Excel actually produce them.

    Excel's "CSV UTF-8" export writes a BOM (handled by utf-8-sig), but Excel's
    plain "CSV (Comma delimited)" on Windows writes cp1252 - so any name with
    an accent (José, García, Nguyễn) is not valid UTF-8. Rather than reject the
    file and ask staff to re-export, fall back to cp1252, which is what those
    bytes actually are. CRLF line endings are handled by newline="".

    Returns (headers, rows, notes). `notes` carries anything the operator should
    know about how the file was interpreted - e.g. that it was semicolon-
    separated - so a successful run can still say what it assumed.
    """
    last_error = None
    forced = detect_format(path)
    for encoding in ((forced,) if forced else ("utf-8-sig", "cp1252")):
        try:
            with open(path, newline="", encoding=encoding) as fh:
                first_line = fh.readline()
                fh.seek(0)
                delimiter = sniff_delimiter(first_line)
                reader = csv.DictReader(fh, delimiter=delimiter)
                if reader.fieldnames is None:
                    return [], [], []
                notes = []
                if delimiter != ",":
                    notes.append("This file is %s-separated, not comma-separated. "
                                 "It was read correctly anyway."
                                 % {";": "semicolon", "\t": "tab",
                                    "|": "pipe"}[delimiter])
                headers = [canonical_header(h, custom_headers) for h in reader.fieldnames]
                rows = []
                for raw in reader:
                    row = {}
                    for k, v in raw.items():
                        # csv puts any extra unnamed columns under a None key.
                        if k is None:
                            continue
                        row[canonical_header(k, custom_headers)] = v
                    # A row where every cell is empty is not a person. Excel
                    # leaves these behind whenever someone clears a row instead
                    # of deleting it; reporting them as errors would put a fix
                    # file next to almost every real export.
                    if any((v or "").strip() for v in row.values()):
                        rows.append(row)
                return headers, rows, notes
        except UnicodeDecodeError as e:
            last_error = e
            continue
    raise last_error


def is_truthy(value):
    return (value or "").strip().lower() in ("1", "y", "yes", "true", "t")


def row_key(row, index, source_file):
    """Stable identity for a row: the PERSON within the case, not the case.

    A case number is not unique to a person. Benefits cases routinely cover a
    whole household, so several rows legitimately share one case_number - keying
    on the case alone would reject a household as duplicates and would silently
    skip everyone after the first. The key is therefore case_number plus the
    applicant's name.

    Repeat verification for the same person on the same case is also legitimate
    - redeterminations, an expired order, a second attempt after no_data. Set
    `force_new` on that row to bypass the check and always create a new order.
    """
    case = (row.get("case_number") or "").strip().lower()
    name = "%s|%s" % ((row.get("first_name") or "").strip().lower(),
                      (row.get("last_name") or "").strip().lower())
    if case:
        return "case:%s|%s" % (case, name)
    # No case number: key on who the person is (name plus email and phone), not
    # on where the row sits, so renaming or re-sorting a file cannot create
    # duplicates. Truv's own duplicate check needs an order_number, which needs a
    # case number - so rows without one rely on this local key alone.
    who = "%s|%s|%s" % (name, (row.get("email") or "").strip().lower(),
                        normalize_phone(row.get("phone", "")))
    return "person:%s" % hashlib.sha256(who.encode()).hexdigest()[:16]


# =============================================================================
# Ledger - the tool's memory. This is what makes duplicates impossible.
# =============================================================================

def ledger_load():
    if not os.path.exists(LEDGER_PATH):
        return {}
    out = {}
    try:
        with open(LEDGER_PATH, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if r.get("key"):
                    out[r["key"]] = r
    except OSError:
        pass
    return out


def ledger_append(entries):
    if not entries:
        return
    os.makedirs(STATE_DIR, exist_ok=True)
    write_header = not os.path.exists(LEDGER_PATH)
    with open(LEDGER_PATH, "a", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=LEDGER_FIELDS)
        if write_header:
            w.writeheader()
        w.writerows(entries)
    make_private(LEDGER_PATH)


# =============================================================================
# Email
# =============================================================================

def send_email(cfg, subject, body, log, to_addrs=None):
    if not cfg.getboolean("email", "enabled", fallback=False):
        log("email disabled in config; not sending")
        return False
    if to_addrs is None:
        to_addrs = [a.strip() for a in cfg.get("email", "to_addrs", fallback="").split(",")
                    if a.strip() and "REPLACE_ME" not in a]
    if not to_addrs:
        log("no email recipients configured; not sending")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.get("email", "from_addr", fallback="truv-orders@example.org")
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(body)

    host = cfg.get("email", "smtp_host", fallback="")
    port = cfg.getint("email", "smtp_port", fallback=587)
    with smtplib.SMTP(host, port, timeout=HTTP_TIMEOUT) as server:
        if cfg.getboolean("email", "use_tls", fallback=True):
            # Verify the mail server's certificate and hostname. Python's bare
            # starttls() does not, which would expose the SMTP password and the
            # applicant names in these emails to anyone on the network path.
            server.starttls(context=ssl.create_default_context())
        user = cfg.get("email", "smtp_user", fallback="")
        pw = os.environ.get("TRUV_SMTP_PASSWORD") or cfg.get("email", "smtp_password", fallback="")
        if user and pw and "REPLACE_ME" not in user:
            server.login(user, pw)
        server.send_message(msg)
    log("email sent to %s" % ", ".join(to_addrs))
    return True


def build_summary_body(truv, summaries, started, env_label):
    L = []
    L.append("Truv order intake - run summary")
    L.append("Started:     %s" % started)
    L.append("Environment: %s" % env_label.upper())
    L.append("Products:    %s" % ", ".join(truv["products"]))
    L.append("")
    if not summaries:
        L.append("No new CSV files were found. Nothing to do.")
        L.append("")
        L.append("This message confirms the tool ran.")
        return "\n".join(L)

    total_created = sum(s["created"] for s in summaries)
    total_failed = sum(s["failed"] for s in summaries)
    total_skipped = sum(s["skipped"] for s in summaries)
    L.append("Orders created: %d" % total_created)
    if total_skipped:
        L.append("Already ordered (skipped, nothing new created): %d" % total_skipped)
    if total_failed:
        L.append("Rows that failed: %d" % total_failed)
    L.append("")

    action = []
    for s in summaries:
        L.append("FILE: %s" % s["file"])
        L.append("  rows: %d | created: %d | skipped: %d | failed: %d | outcome: %s"
                 % (s["rows"], s["created"], s["skipped"], s["failed"], s["outcome"]))
        if s["fix_file"]:
            L.append("  %d row(s) were not created. They are in the failed folder as"
                     % s["failed"])
            L.append("    %s" % s["fix_file"])
            L.append("  with the reason on each line. Fix them and move that file")
            L.append("  into the input folder to send just those rows.")
        if s["problems"]:
            L.append("  REJECTED - no orders were created from this file:")
            for p in s["problems"][:40]:
                L.append("    - %s" % p)
            if len(s["problems"]) > 40:
                L.append("    ... and %d more" % (len(s["problems"]) - 40))
            action.append("Fix %s and put it back in the input folder." % s["file"])
        for e in s["errors"][:20]:
            L.append("  ERROR %s" % e)
        if s["errors"]:
            action.append("Some rows in %s were not created - see ERROR lines." % s["file"])
        L.append("")

    if action:
        L.append("ACTION NEEDED")
        for a in action:
            L.append("  * %s" % a)
        L.append("")
    L.append("Completed verifications are reviewed in the Truv dashboard.")
    return "\n".join(L)


def build_recipient_digests(file_name, deliveries, started):
    """One email per recipient, listing only their own lines."""
    by_addr = {}
    for d in deliveries:
        for addr in d["recipients"]:
            by_addr.setdefault(addr, []).append(d)

    out = []
    for addr, items in sorted(by_addr.items()):
        created = [i for i in items if i["status"] == "created"]
        earlier = [i for i in items if i["status"] == "already done"]
        failed = [i for i in items if i["status"] == "failed"]
        subject = "Truv orders processed - %s (%d created)" % (file_name, len(created))
        L = ["Verification orders for your cases:", ""]
        for i in created:
            label = i["case_number"] or "(no case number)"
            L.append("  %s - %s - order created" % (label, i["name"]))
        for i in earlier:
            label = i["case_number"] or "(no case number)"
            L.append("  %s - %s - already ordered earlier, nothing new created"
                     % (label, i["name"]))
        if failed:
            L.append("")
            L.append("NOT created - these need attention:")
            for i in failed:
                label = i["case_number"] or "(no case number)"
                L.append("  %s - %s - %s" % (label, i["name"], i["error"]))
        L.append("")
        L.append("File: %s" % file_name)
        L.append("Run:  %s" % started)
        L.append("")
        L.append("This message lists what happened to each of your cases. It")
        L.append("contains no verification results - review those in the Truv")
        L.append("dashboard.")
        out.append((addr, subject, "\n".join(L)))
    return out


# =============================================================================
# Core: process one CSV
# =============================================================================

def process_file(path, truv, cfg, log, dry_run=False):
    name = os.path.basename(path)
    summary = {"file": name, "rows": 0, "created": 0, "failed": 0, "skipped": 0,
               "outcome": "", "problems": [], "errors": [], "deliveries": [],
               "fix_file": ""}

    custom = {}
    if cfg.has_section("columns"):
        for col, theirs in cfg.items("columns"):
            if theirs.strip():
                custom[normalize_header(theirs)] = col
    try:
        headers, rows, read_notes = read_rows(path, custom)
        for note in read_notes:
            log("%s: %s" % (name, note))
    except NotACsv as e:
        summary["outcome"] = "unreadable"
        summary["problems"].append(str(e))
        return summary
    except (OSError, UnicodeDecodeError, csv.Error) as e:
        summary["outcome"] = "unreadable"
        summary["problems"].append(
            "The file could not be read (%s). Re-save it as CSV UTF-8." % e)
        return summary

    if not rows:
        summary["outcome"] = "rejected"
        summary["problems"].append("The file has a header row but no data rows.")
        return summary

    # Two columns with the same name mean csv silently keeps only the last one,
    # so "Ana Reyes" would be sent as "Ana Smith". We cannot know which column
    # is authoritative, so refuse the file rather than send the wrong person.
    seen, duped = set(), []
    for h in headers:
        if h and h in seen and h not in duped:
            duped.append(h)
        seen.add(h)
    if duped:
        summary["outcome"] = "rejected"
        summary["problems"].append(
            "The file has more than one column named: %s. Only the last one "
            "would be used, which would silently send the wrong values. Remove "
            "the duplicate column and re-export." % ", ".join(duped))
        return summary

    missing = [c for c in REQUIRED_COLUMNS if c not in headers]
    if missing:
        summary["outcome"] = "rejected"
        summary["problems"].append(
            "The file is missing required column(s): %s. Found: %s. "
            "Rename the column in your export, or map it in config.ini under "
            "[columns] (for example: first_name = Applicant First)."
            % (", ".join(missing), ", ".join(headers) or "(none)"))
        return summary

    summary["rows"] = len(rows)

    cap = min(cfg.getint("safety", "max_orders_per_run", fallback=MAX_ORDERS_PER_BATCH),
              MAX_ORDERS_PER_BATCH)
    rpm = cfg.getint("safety", "max_requests_per_minute", fallback=DEFAULT_RPM)
    if len(rows) > cap:
        summary["outcome"] = "rejected"
        summary["problems"].append(
            "The file has %d rows. Truv accepts %d orders per hour, so this file "
            "cannot go in one batch. Split it into files of %d rows or fewer and "
            "drop them in across separate runs."
            % (len(rows), cap, cap))
        return summary

    require_staff = "staff_email" in headers

    # ---- Check every row, but do NOT hold the file hostage to one bad row ----
    # Truv's batch endpoint creates the valid orders and reports the invalid ones,
    # so a single typo should not block the rest. File-level problems (missing
    # columns, unreadable, too big) still reject the whole file - those mean the
    # export itself is wrong, not one applicant.
    bad_rows = {}      # row number -> reason
    for i, row in enumerate(rows, start=1):
        problems = row_errors(row, require_staff)
        if problems:
            bad_rows[i] = "; ".join(problems)

    seen_keys = {}
    for i, row in enumerate(rows, start=1):
        if i in bad_rows or is_truthy(row.get("force_new")):
            continue
        k = row_key(row, i, path)
        if k in seen_keys:
            bad_rows[i] = ("same applicant as row %d (same name and case_number). "
                           "If this is deliberate - a redetermination or a retry - "
                           "put yes in a force_new column on that row."
                           % seen_keys[k])
        else:
            seen_keys[k] = i

    if dry_run:
        summary["failed"] = len(bad_rows)
        summary["problems"] = ["row %d: %s" % (i, r) for i, r in sorted(bad_rows.items())]
        good = summary["rows"] - len(bad_rows)
        summary["outcome"] = ("ok (dry run - nothing sent)" if not bad_rows
                              else "dry run - %d row(s) would be sent, %d skipped"
                                   % (good, len(bad_rows)))
        return summary

    # ---- Resume + duplicate protection --------------------------------------
    results_path = os.path.splitext(path)[0] + ".results.csv"
    done = {}
    if os.path.exists(results_path):
        try:
            _, prev, _ = read_rows(results_path)
            for r in prev:
                if r.get("status") == "success" and r.get("key"):
                    done[r["key"]] = r.get("order_id", "")
        except (OSError, csv.Error):
            pass

    ledger = ledger_load()

    def record(row, i, status, order_id, error):
        full = ("%s %s" % ((row.get("first_name") or "").strip(),
                           (row.get("last_name") or "").strip())).strip()
        summary["deliveries"].append({
            "row": i,
            "case_number": (row.get("case_number") or "").strip(),
            "name": full,
            "recipients": recipients_for_row(row),
            "status": status, "order_id": order_id, "error": error})

    new_results, new_ledger = [], []
    to_send = []   # (row number, row, key) for every row that still needs an order
    for i, row in enumerate(rows, start=1):
        if i in bad_rows:
            summary["failed"] += 1
            summary["errors"].append("row %d: %s" % (i, bad_rows[i]))
            new_results.append({"key": "", "row": i, "status": "error",
                                "order_id": "", "share_url": "", "error": bad_rows[i]})
            record(row, i, "failed", "", bad_rows[i][:120])
            continue

        key = row_key(row, i, path)

        if key in done and not is_truthy(row.get("force_new")):
            summary["skipped"] += 1
            record(row, i, "already done", done[key], "")
            continue
        if key in ledger and not is_truthy(row.get("force_new")):
            prev = ledger[key]
            summary["skipped"] += 1
            log("row %d skipped - already ordered on %s (order %s)"
                % (i, prev.get("created_at", "?"), prev.get("order_id", "?")))
            record(row, i, "already done", prev.get("order_id", ""), "")
            continue

        to_send.append((i, row, key))

    # One request for the whole file, however many rows it holds. The stamp
    # gives force_new rows a fresh order reference (see order_number_for).
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    outcomes = submit_batch([build_payload(row, truv, stamp) for _, row, _ in to_send],
                            truv, log, rpm=rpm) if to_send else []

    for (i, row, key), outcome in zip(to_send, outcomes):
        if outcome["ok"] and outcome.get("status") == "existing":
            # Truv already held an order with this reference, so NOTHING was
            # created. Report it as skipped - never as created - and remember it.
            oid = outcome["order_id"]
            new_results.append({"key": key, "row": i, "status": "existing",
                                "order_id": oid, "share_url": outcome.get("share_url", ""),
                                "error": "already ordered at Truv - nothing new created"})
            new_ledger.append({"key": key, "order_id": oid,
                               "created_at": datetime.now().isoformat(timespec="seconds"),
                               "source_file": name, "environment": truv["environment"]})
            summary["skipped"] += 1
            log("row %d already had a Truv order (%s) - nothing new created" % (i, oid))
            record(row, i, "already done", oid, "")
        elif outcome["ok"]:
            oid = outcome["order_id"]
            new_results.append({"key": key, "row": i, "status": "success",
                                "order_id": oid, "share_url": outcome.get("share_url", ""),
                                "error": ""})
            new_ledger.append({"key": key, "order_id": oid,
                               "created_at": datetime.now().isoformat(timespec="seconds"),
                               "source_file": name, "environment": truv["environment"]})
            summary["created"] += 1
            record(row, i, "created", oid, "")
        else:
            msg = outcome["error"]
            new_results.append({"key": key, "row": i, "status": "error",
                                "order_id": "", "share_url": "", "error": msg})
            summary["failed"] += 1
            summary["errors"].append("row %d: %s" % (i, msg))
            record(row, i, "failed", "", msg[:120])

    if new_results:
        write_header = not os.path.exists(results_path)
        with open(results_path, "a", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=RESULT_FIELDS)
            if write_header:
                w.writeheader()
            w.writerows(new_results)
        make_private(results_path)
    ledger_append(new_ledger)

    # A file containing ONLY the rows that failed, with the reason attached. Fix
    # them, rename it into input/, and drop it back: the successful rows are
    # already in the ledger and Truv skips repeated order_numbers anyway, so
    # nothing is created twice.
    failed_rows = [i for i in range(1, len(rows) + 1)
                   if any(r["row"] == i and r["status"] == "error" for r in new_results)]
    if failed_rows:
        reasons = {r["row"]: r["error"] for r in new_results if r["status"] == "error"}
        # Written into failed/, not next to the input file: that folder means
        # "needs your attention", and it keeps the file out of input/ where the
        # next scheduled run would pick it up and fail it all over again.
        fix_dir = folder(cfg, "failed")
        os.makedirs(fix_dir, exist_ok=True)
        fix_path = os.path.join(
            fix_dir, "%s__%s.failed-rows.csv"
                     % (datetime.now().strftime("%Y%m%d-%H%M%S"),
                        os.path.splitext(os.path.basename(path))[0]))
        try:
            # Only the columns this tool reads, plus the reason. Anything else in
            # the export (SSN, date of birth...) is never copied into new files.
            keep = [c for c in COLUMNS if c in headers]
            with open(fix_path, "w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=keep + ["_error"])
                w.writeheader()
                for i in failed_rows:
                    out = {k: rows[i - 1].get(k, "") for k in keep}
                    out["_error"] = reasons.get(i, "")
                    w.writerow(out)
            make_private(fix_path)
            summary["fix_file"] = os.path.basename(fix_path)
            log("wrote failed/%s - fix those rows and move the file into input/"
                % os.path.basename(fix_path))
        except OSError as e:
            log("could not write the failed-rows file: %s" % e)

    if summary["failed"] == 0:
        summary["outcome"] = "ok" if summary["created"] else "already done"
    else:
        summary["outcome"] = ("partial" if summary["created"] or summary["skipped"]
                              else "all rows failed")
    return summary


def submit_batch(payloads, truv, log, rpm=DEFAULT_RPM):
    """Create many orders in ONE request and wait for the background job to finish.

    Returns one dict per payload in the same order: {"ok": True, "order_id",
    "share_url"} or {"ok": False, "error"}. Never raises - a transport or job-level
    failure is reported against every row so the caller records it like any other
    per-row problem.

    Truv processes each order independently: one invalid order does not block the
    rest, so this reports per row rather than treating the batch as pass/fail.
    """
    try:
        _, job = api_call("POST", "/orders/batch/", truv,
                          payload={"orders": payloads}, rpm=rpm)
    except TruvError as e:
        return [{"ok": False, "error": "HTTP %s - %s" % (e.status, str(e.body)[:400])}
                for _ in payloads]

    job_id = job.get("id")
    if not job_id:
        return [{"ok": False, "error": "Truv accepted the batch but returned no job id"}
                for _ in payloads]

    log("batch %s submitted with %d orders - waiting for it to finish"
        % (job_id, len(payloads)))
    deadline = time.time() + BATCH_POLL_TIMEOUT_SEC
    while job.get("status") not in ("completed", "failed"):
        if time.time() > deadline:
            return [{"ok": False,
                     "error": "batch %s did not finish within %d minutes - check it in "
                              "the Truv dashboard before re-running this file"
                              % (job_id, BATCH_POLL_TIMEOUT_SEC // 60)}
                    for _ in payloads]
        time.sleep(BATCH_POLL_INTERVAL_SEC)
        try:
            # rpm=0: the poll interval already paces these.
            _, job = api_call("GET", "/orders/batch/%s/" % job_id, truv, rpm=0)
        except TruvError as e:
            log("batch %s status check failed (%s) - retrying" % (job_id, e.status))

    if job.get("status") == "failed":
        return [{"ok": False, "error": "the batch failed: %s" % str(job.get("errors"))[:400]}
                for _ in payloads]

    by_index = {r.get("index"): r for r in (job.get("results") or []) if isinstance(r, dict)}
    outcomes = []
    for position in range(len(payloads)):
        result = by_index.get(position)
        if result is None:
            outcomes.append({"ok": False, "error": "Truv returned no result for this row"})
        elif result.get("status") == "failed":
            outcomes.append({"ok": False, "error": str(result.get("errors"))[:400]})
        else:
            # "existing" means Truv already had an order with this reference and
            # created nothing. process_file reports those as skipped.
            outcomes.append({"ok": True,
                             "status": result.get("status", "created"),
                             "order_id": result.get("order_id", ""),
                             "share_url": result.get("share_url", "")})
    return outcomes


def move_file(path, dest_dir, log):
    os.makedirs(dest_dir, exist_ok=True)
    base = os.path.basename(path)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(dest_dir, "%s__%s" % (stamp, base))
    try:
        os.replace(path, dest)
        make_private(dest)
        side = os.path.splitext(path)[0] + ".results.csv"
        if os.path.exists(side):
            os.replace(side, os.path.join(
                dest_dir, "%s__%s" % (stamp, os.path.basename(side))))
        log("moved %s -> %s" % (base, os.path.basename(dest_dir)))
    except OSError as e:
        log("COULD NOT MOVE %s (%s) - it may be processed again next run" % (base, e))


# =============================================================================
# Locking
# =============================================================================

def acquire_lock(log):
    os.makedirs(STATE_DIR, exist_ok=True)
    if os.path.exists(LOCK_PATH):
        age = time.time() - os.path.getmtime(LOCK_PATH)
        if age < LOCK_MAX_AGE_SEC:
            log("another run is already in progress (started %d min ago); exiting"
                % (age / 60))
            return False
        log("found a stale lock (%d min old); taking over" % (age / 60))
    with open(LOCK_PATH, "w", encoding="utf-8") as fh:
        fh.write("%d %s\n" % (os.getpid(), datetime.now().isoformat()))
    return True


def release_lock():
    try:
        os.remove(LOCK_PATH)
    except OSError:
        pass


# =============================================================================
# Safety gate
# =============================================================================

def enforce_environment(truv):
    """Refuse to do anything when config.ini disagrees with the key.

    `environment` in config.ini changes nothing about where orders go - the key
    decides that, and the API host is identical for both. So if the label and the
    key disagree, the label is telling the operator something false about what is
    about to happen. Stop before a single order is created.

    The dangerous direction is production keys under `environment = sandbox`:
    every safety check in this tool keys off the label, so all of them would pass
    while real applicants got emailed.
    """
    declared = truv["environment"]
    actual = truv["key_environment"]

    if actual is None:
        die("The Access Secret in config.ini is not one Truv issued.",
            "Truv Access Secrets begin with 'sandbox-' or 'prod-'. Re-copy the "
            "whole value - including the prefix - from the Truv Dashboard -> "
            "Development -> API Keys.")

    if actual == "dev":
        die("That is an internal Truv development key, not a customer key.",
            "Use the sandbox or production keys from the Truv Dashboard -> "
            "Development -> API Keys.")

    if actual == declared:
        return

    if actual == "production":
        die("STOP. config.ini says environment = %s, but these are PRODUCTION "
            "keys. Running now would create real orders and email real "
            "applicants. Nothing has been sent." % declared,
            "To test: paste your sandbox Access Secret instead - it begins with "
            "'sandbox-'. To really go live: set environment = production in "
            "config.ini, so the production safety checks actually apply.")

    die("config.ini says environment = %s, but these are SANDBOX keys, so "
        "nothing would reach a real applicant." % declared,
        "To go live: paste your production Access Secret - it begins with "
        "'prod-'. To keep testing: set environment = sandbox in config.ini.")


def check_environment_gate(cfg, truv):
    """Block runs where config.ini lies about the environment, then block
    production runs until a sandbox selftest has passed."""
    enforce_environment(truv)
    if truv["environment"] != "production":
        return
    if not cfg.getboolean("safety", "require_sandbox_first", fallback=True):
        return
    if os.path.exists(SANDBOX_MARKER):
        return
    die("config.ini says environment = production, but this installation has "
        "never completed a successful sandbox test.",
        "Set environment = sandbox, paste your SANDBOX keys, run "
        "`python3 truv_intake.py selftest`, confirm the test order appears in "
        "the Truv dashboard, then switch back to your production keys. "
        "(To skip this check, set require_sandbox_first = false in config.ini - "
        "not recommended.)")


def scheduler_hint():
    tool = os.path.join(HERE, "truv_intake.py")
    if platform.system() == "Windows":
        return ("Windows - Task Scheduler:\n"
                "    Create Task -> Trigger: Daily, repeat every 1 hour\n"
                "    Action: Start a program\n"
                "      Program:   %s\n"
                "      Arguments: \"%s\" run\n"
                "      Start in:  %s\n"
                "    Check \"Run whether user is logged on or not\"."
                % (sys.executable, tool, HERE))
    if platform.system() == "Darwin":
        return ("Mac - run `%s truv_intake.py schedule` to install an hourly job\n"
                "  (launchd) with the right paths filled in. Or use cron:\n"
                "    30 * * * * cd %s && %s truv_intake.py run"
                % (PY_CMD, HERE, sys.executable))
    return ("Mac / Linux - cron. Run `crontab -e` and add this line:\n"
            "    30 * * * * cd %s && %s truv_intake.py run\n"
            "  That runs at :30 past every hour. For once daily at 6:30am use "
            "`30 6 * * *`." % (HERE, sys.executable))


# =============================================================================
# Commands
# =============================================================================

LAUNCHD_LABEL = "com.truv.intake"
LAUNCHD_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>%(label)s</string>
    <key>ProgramArguments</key>
    <array>
        <string>%(python)s</string>
        <string>%(tool)s</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key><string>%(here)s</string>
    <key>StartCalendarInterval</key><dict><key>Minute</key><integer>30</integer></dict>
    <key>StandardOutPath</key><string>%(log)s</string>
    <key>StandardErrorPath</key><string>%(log)s</string>
</dict>
</plist>
"""


def cmd_schedule(args):
    """Install the hourly macOS job with this machine's real paths."""
    if platform.system() != "Darwin":
        rule("Schedule the hourly run")
        for line in scheduler_hint().splitlines():
            say("  " + line)
        return 0
    from xml.sax.saxutils import escape
    agents = os.path.expanduser("~/Library/LaunchAgents")
    os.makedirs(agents, exist_ok=True)
    os.makedirs(STATE_DIR, exist_ok=True)
    dest = os.path.join(agents, LAUNCHD_LABEL + ".plist")
    with open(dest, "w", encoding="utf-8") as fh:
        fh.write(LAUNCHD_PLIST % {
            "label": LAUNCHD_LABEL, "python": escape(sys.executable),
            "tool": escape(os.path.join(HERE, "truv_intake.py")), "here": escape(HERE),
            "log": escape(os.path.join(STATE_DIR, "launchd.log"))})
    ok("wrote %s" % dest)
    say("")
    say("Turn it on with:")
    say("    launchctl load %s" % dest)
    say("Turn it off with:")
    say("    launchctl unload %s" % dest)
    say("")
    warn("This runs while you are logged in to this Mac. For a server that runs "
         "with nobody logged in, ask your IT team to install it as a LaunchDaemon.")
    if any(seg in HERE for seg in ("/Documents", "/Desktop", "/Downloads")):
        warn("This folder is inside Documents, Desktop or Downloads. macOS can block "
             "scheduled jobs from reading those. Move the folder (for example to "
             "your home folder) and run this command again.")
    return 0


def cmd_setup(args):
    rule("Truv Intake Tool %s - setup" % VERSION)
    say("This writes config.ini and creates the folders. Press Ctrl-C to stop.")
    say("Re-running is safe: press Enter to keep any existing value.")

    existing = load_config(required=False)
    interactive = sys.stdin.isatty()

    if not interactive:
        if existing:
            say("\nNot an interactive terminal - leaving the existing config.ini alone.")
        else:
            with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
                fh.write(CONFIG_TEMPLATE)
            lock_down_config()
            say("\nNot an interactive terminal, so I wrote a blank config.ini.")
        cfg = load_config()
        made = ensure_folders(cfg)
        write_template(folder(cfg, "input"))
        if made:
            ok("folders created: %s" % ", ".join(made))
        say("Open config.ini, replace every REPLACE_ME, then run: "
            "python3 truv_intake.py doctor")
        return 0

    def ask(prompt, current="", secret=False):
        shown = ""
        if current and "REPLACE_ME" not in current:
            shown = " [%s]" % ("*" * 8 if secret else current)
        while True:
            raw = (getpass.getpass("  %s%s: " % (prompt, shown)) if secret
                   else input("  %s%s: " % (prompt, shown)))
            raw = raw.strip()
            if raw:
                return raw
            if current and "REPLACE_ME" not in current:
                return current
            say("     This one is required.")

    def ask_choice(prompt, options, current):
        while True:
            raw = input("  %s (%s) [%s]: " % (prompt, "/".join(options), current)).strip().lower()
            if not raw:
                return current
            if raw in options:
                return raw
            say("     Type one of: %s" % ", ".join(options))

    cur = truv_settings(existing) if existing else {
        "client_id": "", "access_key": "", "environment": "sandbox",
        "products": ["income", "assets"], "template_id": ""}

    rule("Step 1 of 4 - Truv API keys")
    say("Find these in the Truv Dashboard -> Development -> API Keys.")
    say("Start with your SANDBOX keys. You will switch to production later.")
    say("")
    client_id = ask("Client ID", cur["client_id"])
    access_key = ask("Access Secret", cur["access_key"], secret=True)
    # Don't ask which environment these are - the key says so, and a typed answer
    # that disagreed with the key was how production orders could be created while
    # every safety check reported sandbox.
    env = env_from_key(access_key)
    if env == "dev":
        bad("That is an internal Truv development key, not a customer key.")
        say("  Use the sandbox or production keys from the Truv Dashboard.")
        say("\n  Nothing was saved.\n")
        return 1
    if env is None:
        warn("That Access Secret does not begin with 'sandbox-' or 'prod-'.")
        say("  Truv issues secrets with the environment in the prefix, so this is")
        say("  probably a truncated copy-paste. Check it before going further.")
        env = ask_choice("Treat these keys as", ["sandbox", "production"],
                         cur["environment"])
    else:
        ok("Read from the key: these are %s keys." % env.upper())

    rule("Step 2 of 4 - testing those keys against Truv")
    probe = {"client_id": client_id, "access_key": access_key,
             "environment": env, "products": [], "template_id": ""}
    try:
        api_call("GET", "/orders/", probe, query={"page_size": 1})
        ok("Truv accepted these credentials.")
    except TruvError as e:
        bad("Truv rejected these credentials (HTTP %s)." % e.status)
        say("")
        say("  %s" % e.advice())
        say("")
        if input("  Save anyway and fix later? (y/N): ").strip().lower() != "y":
            say("\n  Nothing was saved. Re-run setup when you have the right keys.\n")
            return 1

    rule("Step 3 of 4 - what to verify")
    say("Common choices: income,assets   or   income   or   employment")
    products = input("  Products [%s]: " % ",".join(cur["products"])).strip() or ",".join(cur["products"])
    template_id = input("  Template ID (optional, Enter to skip) [%s]: "
                        % (cur["template_id"] or "account default")).strip() or cur["template_id"]

    rule("Step 4 of 4 - email notifications")
    say("Optional. The tool can email a summary after every run, which tells you")
    say("it is still working. It needs your mail server's details. You can skip")
    say("this now and turn it on later in config.ini.")
    say("")
    want_email = input("  Set up email now? (y/N): ").strip().lower() == "y"

    e = {"enabled": "false", "smtp_host": "REPLACE_ME", "smtp_port": "587",
         "smtp_user": "REPLACE_ME", "smtp_password": "REPLACE_ME",
         "from_addr": "truv-orders@example.org", "to_addrs": "REPLACE_ME"}
    if existing and existing.has_section("email"):
        for k in list(e):
            e[k] = existing.get("email", k, fallback=e[k])
    if want_email:
        e["enabled"] = "true"
        e["smtp_host"] = ask("SMTP server (e.g. smtp.office365.com)", e["smtp_host"])
        e["smtp_port"] = input("  SMTP port [%s]: " % e["smtp_port"]).strip() or e["smtp_port"]
        e["smtp_user"] = ask("SMTP username", e["smtp_user"])
        e["smtp_password"] = ask("SMTP password", e["smtp_password"], secret=True)
        e["from_addr"] = ask("Send from address", e["from_addr"])
        e["to_addrs"] = ask("Send run summaries to (comma-separated)", e["to_addrs"])

    text = (CONFIG_TEMPLATE
            .replace("client_id = REPLACE_ME", "client_id = %s" % client_id)
            .replace("access_key = REPLACE_ME", "access_key = %s" % access_key)
            .replace("environment = sandbox", "environment = %s" % env)
            .replace("products = income,assets", "products = %s" % products)
            .replace("template_id =", "template_id = %s" % template_id)
            .replace("enabled = true", "enabled = %s" % e["enabled"], 1)
            .replace("smtp_host = REPLACE_ME", "smtp_host = %s" % e["smtp_host"])
            .replace("smtp_port = 587", "smtp_port = %s" % e["smtp_port"])
            .replace("smtp_user = REPLACE_ME", "smtp_user = %s" % e["smtp_user"])
            .replace("smtp_password = REPLACE_ME", "smtp_password = %s" % e["smtp_password"])
            .replace("from_addr = truv-orders@example.org", "from_addr = %s" % e["from_addr"])
            .replace("to_addrs = REPLACE_ME", "to_addrs = %s" % e["to_addrs"]))

    with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
        fh.write(text)
    locked = lock_down_config()

    cfg = load_config()
    made = ensure_folders(cfg)
    write_template(folder(cfg, "input"))

    rule("Setup complete")
    ok("config.ini written%s" % (" and locked to your user only" if locked else ""))
    if made:
        ok("folders created: %s" % ", ".join(made))
    ok("blank orders_template.csv placed in the input folder")
    if os.name == "nt":
        warn("Windows: restrict config.ini in Properties -> Security so only the "
             "service account can read it.")

    say("")
    say("NEXT - three commands, in this order:")
    say("")
    say("  1.  %s truv_intake.py doctor      (checks everything)" % PY_CMD)
    say("  2.  %s truv_intake.py selftest    (creates one real test order)" % PY_CMD)
    say("  3.  schedule the hourly run:")
    say("")
    for line in scheduler_hint().splitlines():
        say("      " + line)
    say("")
    return 0


def write_template(dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(dest_dir, "orders_template.csv")
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(COLUMNS)
        # Two rows on ONE case number on purpose: a household is several
        # applicants, and each one gets its own order. Value count must match
        # COLUMNS exactly or the file opens misaligned in Excel.
        w.writerow(["Maria", "Lopez", "CASE-1001", "maria.lopez@example.com",
                    "415-555-4193", "Jane Doe", "jane.doe@example.org", "", ""])
        w.writerow(["Carlos", "Lopez", "CASE-1001", "carlos.lopez@example.com",
                    "", "Jane Doe", "jane.doe@example.org",
                    "supervisor@example.org", ""])
    return path


def cmd_template(args):
    cfg = load_config()
    dest = args.folder or folder(cfg, "input")
    path = write_template(dest)
    say("Wrote %s" % path)
    say("")
    say("Required columns: %s" % ", ".join(REQUIRED_COLUMNS))
    say("All columns:      %s" % ", ".join(COLUMNS))
    say("")
    say("Delete the two example rows before using it.")
    return 0


def cmd_doctor(args):
    rule("Truv Intake Tool %s - doctor" % VERSION)
    cfg = load_config()
    truv = truv_settings(cfg)
    failures = []

    say("\nPython and platform")
    ok("Python %d.%d.%d on %s" % (sys.version_info[0], sys.version_info[1],
                                  sys.version_info[2], platform.platform()))

    say("\nConfiguration")
    if creds_are_placeholder(truv):
        bad("Truv credentials are not filled in.")
        failures.append("Run `python3 truv_intake.py setup` and paste your API keys.")
    else:
        # Report what the KEY says. Echoing config.ini here would repeat the
        # operator's own claim back at them as though it had been checked.
        actual_env = truv["key_environment"]
        ok("Truv credentials are present (key environment: %s)"
           % (actual_env.upper() if actual_env else "UNRECOGNIZED"))
    if truv["environment"] not in ("sandbox", "production"):
        bad("environment must be exactly 'sandbox' or 'production' (found '%s')"
            % truv["environment"])
        failures.append("Fix the environment line in config.ini.")
    if not truv["products"]:
        bad("No products configured.")
        failures.append("Set products in config.ini, e.g. products = income,assets")
    else:
        ok("products: %s" % ", ".join(truv["products"]))

    mode = None
    if os.path.exists(CONFIG_PATH) and os.name != "nt":
        mode = oct(os.stat(CONFIG_PATH).st_mode & 0o777)
        if mode == "0o600":
            ok("config.ini permissions are %s (private)" % mode)
        else:
            warn("config.ini permissions are %s - should be 0o600. "
                 "Run: chmod 600 config.ini" % mode)

    say("\nFolders")
    for key in ("input", "processed", "failed", "logs"):
        p = folder(cfg, key)
        if not os.path.isdir(p):
            bad("%s folder missing: %s" % (key, p))
            failures.append("Run `python3 truv_intake.py setup` to create the folders.")
        elif not os.access(p, os.W_OK):
            bad("%s folder is not writable: %s" % (key, p))
            failures.append("Give the account that runs this tool write access to %s" % p)
        else:
            ok("%-9s %s" % (key, p))

    say("\nTruv API")
    if creds_are_placeholder(truv):
        bad("skipped - credentials not configured")
    else:
        try:
            api_call("GET", "/orders/", truv, query={"page_size": 1})
            ok("connected to %s and the credentials were accepted" % API_BASE)
        except TruvError as e:
            bad("could not use the Truv API (HTTP %s)" % e.status)
            failures.append(e.advice())

    say("\nSafety")
    # Everything here is judged on the KEY. Saying "you are in sandbox" because
    # config.ini claims so would be the reassurance that hides the problem.
    actual = truv["key_environment"]
    if actual is None:
        bad("the Access Secret does not begin with 'sandbox-' or 'prod-', so the "
            "real environment cannot be determined")
        failures.append("Re-copy the whole Access Secret, including its prefix, "
                        "from the Truv Dashboard -> Development -> API Keys.")
    elif actual == "dev":
        bad("that is an internal Truv development key, not a customer key")
        failures.append("Use the sandbox or production keys from the Truv "
                        "Dashboard -> Development -> API Keys.")
    elif actual != truv["environment"]:
        bad("config.ini says environment = %s but the key is a %s key - the KEY "
            "decides, so this installation is really pointed at %s"
            % (truv["environment"], actual.upper(), actual.upper()))
        if actual == "production":
            failures.append("DANGEROUS: real applicants would be emailed while "
                            "the tool reports sandbox. Either paste sandbox keys "
                            "(prefix 'sandbox-') or set environment = production.")
        else:
            failures.append("Either paste production keys (prefix 'prod-') or set "
                            "environment = sandbox.")
    elif actual == "production":
        ok("the key is a PRODUCTION key and config.ini agrees")
        if os.path.exists(SANDBOX_MARKER):
            ok("a sandbox selftest has passed on this installation")
        elif cfg.getboolean("safety", "require_sandbox_first", fallback=True):
            bad("environment is production but no sandbox test has ever passed")
            failures.append("Run a sandbox selftest first - see `selftest`.")
        else:
            warn("require_sandbox_first is off - production runs are unguarded")
    else:
        ok("the key itself is a SANDBOX key - no real applicants will be contacted")
    ok("duplicate protection: %d case(s) in the ledger" % len(ledger_load()))

    say("\nEmail")
    if not cfg.getboolean("email", "enabled", fallback=False):
        warn("email is disabled - you will get no run summaries and no failure alerts")
    else:
        try:
            log = Logger(folder(cfg, "logs")).log
            sent = send_email(
                cfg, "Truv Intake Tool - test email",
                "This is a test from `doctor` on %s.\n\nIf you can read this, the "
                "tool can email you run summaries.\n" % platform.node(), log)
            if sent:
                ok("test email sent - confirm it arrives")
            else:
                bad("email is enabled but no recipients are set")
                failures.append("Set to_addrs in config.ini.")
        except (smtplib.SMTPException, OSError) as e:
            bad("could not send email: %s" % e)
            failures.append("Check smtp_host, smtp_port, smtp_user and smtp_password "
                            "in config.ini. Many mail servers need an app password "
                            "rather than the normal one.")

    rule()
    if failures:
        say("%sNOT READY%s - fix these, then run doctor again:\n" % (C_BAD, C_OFF))
        for i, f in enumerate(dict.fromkeys(failures), 1):
            say("  %d. %s" % (i, f))
        say("")
        return 1
    say("%sALL CHECKS PASSED.%s\n" % (C_OK, C_OFF))
    say("Next: python3 truv_intake.py selftest")
    say("")
    return 0


def cmd_selftest(args):
    rule("Selftest - creates ONE real order")
    cfg = load_config()
    truv = truv_settings(cfg)
    if creds_are_placeholder(truv):
        die("Credentials are not configured.", "Run: python3 truv_intake.py setup")
    # selftest is the command we tell people to run FIRST, to prove the setup is
    # safe. It must not be the one command that trusts the label.
    enforce_environment(truv)

    if truv["environment"] == "production":
        warn("environment is PRODUCTION. This will create a REAL order.")
        if not args.yes:
            if not sys.stdin.isatty():
                die("Refusing to create a production test order without confirmation.",
                    "Re-run with --yes if you really mean to.")
            if input("  Type CREATE to continue: ").strip() != "CREATE":
                say("\n  Canceled. Nothing was created.\n")
                return 1

    row = {"first_name": "Truv", "last_name": "Selftest",
           "case_number": "SELFTEST-%s" % datetime.now().strftime("%Y%m%d%H%M%S")}
    say("\nCreating a test order (%s)..." % row["case_number"])
    try:
        _, resp = api_call("POST", "/orders/", truv, payload=build_payload(row, truv))
    except TruvError as e:
        bad("the order was not created (HTTP %s)" % e.status)
        say("\n  %s\n" % e.advice())
        say("  Truv said: %s\n" % str(e.body)[:500])
        return 1

    oid = resp.get("id", "")
    ok("order created")
    say("")
    say("  Order ID:  %s" % oid)
    say("  Reference: %s" % row["case_number"])
    if resp.get("share_url"):
        say("  Share URL: %s" % resp["share_url"])
    say("")

    say("Reading it back...")
    try:
        _, back = api_call("GET", "/orders/%s/" % oid, truv)
        ok("the order can be read back from Truv")
    except TruvError as e:
        warn("created, but could not be read back: %s" % e)

    if truv["environment"] == "sandbox":
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(SANDBOX_MARKER, "w", encoding="utf-8") as fh:
            fh.write("sandbox selftest passed %s\norder_id=%s\n"
                     % (datetime.now().isoformat(timespec="seconds"), oid))
        ok("sandbox verified - this installation may now be switched to production")

    rule("Selftest passed")
    say("Confirm the order appears in the Truv dashboard, then:")
    say("")
    say("  - To go live: put your PRODUCTION keys in config.ini and set")
    say("    environment = production. The API URL does not change.")
    say("  - Then schedule the hourly run:")
    say("")
    for line in scheduler_hint().splitlines():
        say("      " + line)
    say("")
    return 0


def cmd_validate(args):
    cfg = load_config()
    truv = truv_settings(cfg)
    if not os.path.exists(args.file):
        die("No such file: %s" % args.file, "Check the path and try again.")

    rule("Validating %s" % os.path.basename(args.file))
    say("Nothing is created and nothing is sent by this command.\n")
    s = process_file(args.file, truv, cfg, Logger().log, dry_run=True)

    say("Rows found: %d" % s["rows"])
    if s["problems"] and not s["failed"]:
        # File-level problem: nothing can be sent at all.
        bad("This file would be REJECTED. No orders would be created.\n")
        for p in s["problems"]:
            say("    - %s" % p)
        say("")
        say("Fix every line above, then run validate again.")
        say("")
        return 1
    if s["failed"]:
        warn("%d row(s) would be SKIPPED. The other %d would still be sent."
             % (s["failed"], s["rows"] - s["failed"]))
        say("")
        for p in s["problems"]:
            say("    - %s" % p)
        say("")
        say("Truv creates the good rows and reports the bad ones, so a single bad")
        say("row no longer blocks the file. Fix these to have them sent too.")
        say("")
        return 0
    ok("No problems found. %d order(s) would be created." % s["rows"])
    ledger = ledger_load()
    dupes = [r for i, r in enumerate(read_rows(args.file)[1], 1)
             if row_key(r, i, args.file) in ledger]
    if dupes:
        say("")
        warn("%d row(s) were already ordered previously and will be skipped "
             "automatically." % len(dupes))
    say("")
    return 0


def _run_files(paths, cfg, truv, log, started, move=True, dry_run=False):
    summaries = []
    send_conf = cfg.getboolean("email", "send_row_confirmations", fallback=True)
    for path in paths:
        log("processing %s" % os.path.basename(path))
        s = process_file(path, truv, cfg, log, dry_run=dry_run)
        summaries.append(s)

        if send_conf and s["deliveries"] and not dry_run:
            for addr, subj, body in build_recipient_digests(s["file"], s["deliveries"], started):
                try:
                    send_email(cfg, subj, body, log, to_addrs=[addr])
                except (smtplib.SMTPException, OSError) as e:
                    log("could not send confirmation to %s: %s" % (addr, e))

        if move and not dry_run:
            # failed/ means "a person needs to look at this": the whole file was
            # rejected, or every row failed. A file whose rows were all already
            # ordered did its job and goes to processed/ with its results.
            dest = ("failed" if s["outcome"] in ("rejected", "unreadable", "all rows failed")
                    else "processed")
            move_file(path, folder(cfg, dest), log)
    return summaries


def purge_old_files(cfg, log):
    """Optional retention: remove old files that hold applicant data."""
    days = cfg.getint("safety", "retention_days", fallback=0)
    if days <= 0:
        return
    cutoff = time.time() - days * 86400
    removed = 0
    for name in ("processed", "failed", "logs"):
        d = folder(cfg, name)
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if os.path.isfile(p) and os.path.getmtime(p) < cutoff:
                try:
                    os.remove(p)
                    removed += 1
                except OSError as e:
                    log("could not remove %s: %s" % (f, e))
    if removed:
        log("retention: removed %d file(s) older than %d days" % (removed, days))


def cmd_run(args):
    cfg = load_config()
    log = Logger(folder(cfg, "logs")).log
    started = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log("run started (v%s)" % VERSION)

    truv = truv_settings(cfg)
    if creds_are_placeholder(truv):
        log("ABORT - Truv credentials are not configured")
        try:
            send_email(cfg, "Truv order intake - CONFIG ERROR",
                       "The scheduled run could not start: the Truv credentials in "
                       "config.ini are still placeholders.\n\nRun "
                       "`python3 truv_intake.py setup` on the machine that runs "
                       "this tool.\n", log)
        except Exception:
            pass
        return 1
    check_environment_gate(cfg, truv)

    if not acquire_lock(log):
        return 0
    try:
        in_dir = folder(cfg, "input")
        os.makedirs(in_dir, exist_ok=True)
        purge_old_files(cfg, log)
        names = os.listdir(in_dir)
        paths = sorted(
            os.path.join(in_dir, f) for f in names
            if f.lower().endswith(".csv")
            and not f.lower().endswith(".results.csv")
            and not f.lower().endswith(".failed-rows.csv")
            and f != "orders_template.csv")

        summaries = _run_files(paths, cfg, truv, log, started,
                               move=True, dry_run=args.dry_run)

        # Workbooks and other formats are never read, but they must not sit in
        # input/ unnoticed either - say what to do and move them aside.
        for f in sorted(names):
            if f.lower().endswith((".xlsx", ".xls", ".xlsm", ".ods", ".numbers", ".txt")):
                summaries.append({"file": f, "rows": 0, "created": 0, "failed": 0,
                                  "skipped": 0, "outcome": "rejected", "deliveries": [],
                                  "errors": [], "fix_file": "",
                                  "problems": ["This is not a CSV file. Open it and use "
                                               "Save As > CSV UTF-8 (Comma delimited), "
                                               "then put the .csv in the input folder."]})
                if not args.dry_run:
                    move_file(os.path.join(in_dir, f), folder(cfg, "failed"), log)

        if not paths and not cfg.getboolean("email", "send_on_noop", fallback=True):
            log("nothing to do and send_on_noop is false; not emailing")
        else:
            created = sum(s["created"] for s in summaries)
            failed = sum(s["failed"] for s in summaries)
            rejected = sum(1 for s in summaries
                           if s["outcome"] in ("rejected", "unreadable"))
            subject = ("Truv order intake - ran, nothing to do (%s)" % started
                       if not summaries else
                       "Truv order intake - %d created, %d failed, %d rejected (%s)"
                       % (created, failed, rejected, started))
            try:
                send_email(cfg, subject,
                           build_summary_body(truv, summaries, started,
                                              truv["environment"]), log)
            except (smtplib.SMTPException, OSError) as e:
                log("could not send the summary email: %s" % e)
        problems = sum(s["failed"] for s in summaries) + sum(
            1 for s in summaries if s["outcome"] in ("rejected", "unreadable"))
        log("run finished")
        # Non-zero when anything needs a person, so a scheduler or monitoring
        # agent sees failures without anyone reading the email.
        return 2 if problems else 0
    finally:
        release_lock()


def cmd_send(args):
    cfg = load_config()
    truv = truv_settings(cfg)
    if creds_are_placeholder(truv):
        die("Credentials are not configured.", "Run: python3 truv_intake.py setup")
    check_environment_gate(cfg, truv)
    if not os.path.exists(args.file):
        die("No such file: %s" % args.file, "Check the path and try again.")

    log = Logger(folder(cfg, "logs")).log
    started = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if not acquire_lock(log):
        return 1
    try:
        s = _run_files([args.file], cfg, truv, log, started,
                       move=args.move, dry_run=False)[0]
    finally:
        release_lock()

    rule("Result")
    say("rows: %d | created: %d | skipped: %d | failed: %d | outcome: %s"
        % (s["rows"], s["created"], s["skipped"], s["failed"], s["outcome"]))
    for p in s["problems"]:
        say("  - %s" % p)
    for e in s["errors"]:
        say("  ERROR %s" % e)
    say("")
    return 0 if s["outcome"].startswith("ok") else 1


def cmd_direct(args):
    """Create one order from command-line values - the 'direct' pattern, by hand."""
    cfg = load_config()
    truv = truv_settings(cfg)
    if creds_are_placeholder(truv):
        die("Credentials are not configured.", "Run: python3 truv_intake.py setup")
    check_environment_gate(cfg, truv)

    row = {"first_name": args.first_name, "last_name": args.last_name,
           "case_number": args.case_number or "", "email": args.email or "",
           "phone": args.phone or "", "staff_name": args.staff_name or "",
           "staff_email": args.staff_email or "", "cc_emails": args.cc or ""}

    problems = row_errors(row, require_staff_email=False)
    if problems:
        die("These values are not valid: %s" % "; ".join(problems),
            "Correct them and run the command again.")

    key = row_key(row, 1, "direct")
    ledger = ledger_load()
    if key in ledger and not args.allow_duplicate:
        prev = ledger[key]
        die("%s was already ordered on %s (order %s)."
            % (key.replace("case:", "Case number "), prev.get("created_at"),
               prev.get("order_id")),
            "Nothing was created. Pass --allow-duplicate if you really want a "
            "second order for the same case.")

    try:
        _, resp = api_call("POST", "/orders/", truv, payload=build_payload(row, truv))
    except TruvError as e:
        bad("the order was not created (HTTP %s)" % e.status)
        say("\n  %s\n" % e.advice())
        say("  Truv said: %s\n" % str(e.body)[:500])
        return 1

    ledger_append([{"key": key, "order_id": resp.get("id", ""),
                    "created_at": datetime.now().isoformat(timespec="seconds"),
                    "source_file": "direct", "environment": truv["environment"]}])
    if args.json:
        print(json.dumps(resp, indent=2))
    else:
        ok("order created")
        say("  Order ID:  %s" % resp.get("id", ""))
        if resp.get("share_url"):
            say("  Share URL: %s" % resp["share_url"])
    return 0


def cmd_webhook(args):
    cfg = load_config()
    truv = truv_settings(cfg)
    if creds_are_placeholder(truv):
        die("Credentials are not configured.", "Run: python3 truv_intake.py setup")

    if args.action == "list":
        try:
            _, resp = api_call("GET", "/webhooks/", truv)
        except TruvError as e:
            die("Could not list webhooks (HTTP %s): %s" % (e.status, e.body), e.advice())
        items = resp.get("results", resp if isinstance(resp, list) else [])
        if not items:
            say("\nNo webhooks are configured on this account.")
            say("Results are only available in the Truv dashboard until you add one.")
            say("\nTo add one:  python3 truv_intake.py webhook add https://your.host/truv\n")
            return 0
        rule("Configured webhooks")
        for w in items:
            state = "enabled" if w.get("enabled") else "DISABLED"
            say("  %s  [%s / %s]" % (w.get("webhook_url", "?"),
                                     w.get("env_type", "?"), state))
            say("      id:     %s" % w.get("id", "?"))
            say("      events: %s" % ", ".join(w.get("events", [])) or "(all)")
            say("")
        return 0

    if args.action == "add":
        if not args.url:
            die("No URL given.",
                "Use: python3 truv_intake.py webhook add https://your.host/truv")
        if not args.url.lower().startswith("https://"):
            die("The webhook URL must start with https:// - Truv will send real "
                "applicant data to it.",
                "Put the endpoint behind TLS and use its https:// address.")
        env_type = "prod" if truv["environment"] == "production" else "sandbox"
        events = [e.strip() for e in (args.events or
                  "order-finalized").split(",")
                  if e.strip()]
        payload = {"name": args.name or "Truv Intake Tool",
                   "webhook_url": args.url, "env_type": env_type, "events": events}
        try:
            _, resp = api_call("POST", "/webhooks/", truv, payload=payload)
        except TruvError as e:
            die("Could not create the webhook (HTTP %s): %s" % (e.status, e.body),
                e.advice())
        ok("webhook registered")
        say("  id:     %s" % resp.get("id", ""))
        say("  url:    %s" % resp.get("webhook_url", ""))
        say("  env:    %s" % resp.get("env_type", ""))
        say("  events: %s" % ", ".join(resp.get("events", [])))
        say("")
        say("Your endpoint must verify the X-WEBHOOK-SIGN header and answer 2xx")
        say("within 10 seconds. See webhook_receiver_example.py in this folder.")
        say("")
        return 0

    if args.action == "history":
        try:
            _, resp = api_call("GET", "/webhook-requests/", truv)
        except TruvError as e:
            die("Could not read webhook history (HTTP %s): %s" % (e.status, e.body),
                e.advice())
        items = resp.get("results", [])
        if not items:
            say("\nNo webhook delivery attempts in the last 30 days.\n")
            return 0
        rule("Recent webhook deliveries (last 30 days)")
        for r in items[:40]:
            code = r.get("status_code")
            flag = "OK  " if code and 200 <= code < 300 else "FAIL"
            say("  %s  %s  %s  -> %s" % (flag, r.get("event_created_at", "?"),
                                         r.get("event_type", "?"), code))
            if r.get("error_message"):
                say("        %s" % r["error_message"])
        say("")
        return 0
    return 1


def cmd_fetch(args):
    cfg = load_config()
    truv = truv_settings(cfg)
    if creds_are_placeholder(truv):
        die("Credentials are not configured.", "Run: python3 truv_intake.py setup")

    try:
        _, order = api_call("GET", "/orders/%s/" % args.order_id, truv)
    except TruvError as e:
        die("Could not fetch order %s (HTTP %s)" % (args.order_id, e.status), e.advice())

    if args.pdf:
        pdfs = []
        for group in ("employers", "financial_accounts"):
            for item in order.get(group) or []:
                if item.get("pdf_report"):
                    pdfs.append((group, item.get("id", "?"), item["pdf_report"]))
        # The per-connection PDFs above are not the whole story. The assets
        # (VOA) report is one consolidated report for the whole order, and it is
        # only reachable by ID from its own endpoint.
        user_id = order.get("user_id")
        if user_id and order.get("voa_report_id"):
            pdfs.append(("voa", order["voa_report_id"], "%s/users/%s/assets/reports/%s/?fmt=pdf"
                         % (API_BASE, user_id, order["voa_report_id"])))
        if not pdfs:
            say("\nThis order has no PDF report yet.")
            say("A PDF appears once a connection reaches completed status.")
            say("Order state: completed_at=%s canceled_at=%s is_expired=%s\n"
                % (order.get("completed_at"), order.get("canceled_at"),
                   order.get("is_expired")))
            return 1
        for group, iid, url in pdfs:
            out = args.out or "order-%s-%s-%s.pdf" % (args.order_id[:8], group[:3], iid[:8])
            try:
                req = urllib.request.Request(url, headers={
                    "X-Access-Client-Id": truv["client_id"],
                    "X-Access-Secret": truv["access_key"]})
                with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                    data = resp.read()
                with open(out, "wb") as fh:
                    fh.write(data)
                ok("saved %s (%d KB)" % (out, len(data) // 1024))
            except (urllib.error.URLError, OSError) as e:
                bad("could not download %s: %s" % (url, e))
        return 0

    text = json.dumps(order, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        ok("saved %s" % args.out)
    else:
        print(text)
    return 0


def cmd_version(args):
    say("Truv Intake Tool %s" % VERSION)
    say("Python %d.%d.%d on %s" % (sys.version_info[0], sys.version_info[1],
                                   sys.version_info[2], platform.platform()))
    say("API: %s" % API_BASE)
    return 0


# =============================================================================
# Entry point
# =============================================================================

def main(argv=None):
    p = argparse.ArgumentParser(
        prog="truv_intake.py",
        description="Create Truv verification orders from CSV files or directly.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Start with:  python3 truv_intake.py setup")
    sub = p.add_subparsers(dest="command")

    sub.add_parser("setup", help="Interactive first-time setup. Start here.")
    sub.add_parser("doctor", help="Check the setup and report PASS/FAIL.")

    st = sub.add_parser("selftest", help="Create one real test order.")
    st.add_argument("--yes", action="store_true",
                    help="Skip confirmation when the environment is production.")

    tp = sub.add_parser("template", help="Write a blank CSV.")
    tp.add_argument("folder", nargs="?", help="Where to write it.")

    va = sub.add_parser("validate", help="Check a CSV. Creates nothing.")
    va.add_argument("file")

    rn = sub.add_parser("run", help="THE SCHEDULED COMMAND. Processes input/.")
    rn.add_argument("--dry-run", action="store_true",
                    help="Validate only. Create nothing, move nothing.")

    sd = sub.add_parser("send", help="Process one specific CSV now.")
    sd.add_argument("file")
    sd.add_argument("--move", action="store_true",
                    help="Also move the file to processed/ or failed/.")

    dr = sub.add_parser("direct", help="Create one order from command-line values.")
    dr.add_argument("--first-name", required=True)
    dr.add_argument("--last-name", required=True)
    dr.add_argument("--case-number")
    dr.add_argument("--email")
    dr.add_argument("--phone")
    dr.add_argument("--staff-name")
    dr.add_argument("--staff-email")
    dr.add_argument("--cc")
    dr.add_argument("--json", action="store_true", help="Print the raw API response.")
    dr.add_argument("--allow-duplicate", action="store_true",
                    help="Create even if this case number was ordered before.")

    wh = sub.add_parser("webhook", help="Set up or inspect webhooks.")
    wh.add_argument("action", choices=["list", "add", "history"])
    wh.add_argument("url", nargs="?", help="For `add`: your https:// endpoint.")
    wh.add_argument("--name", help="A label for the webhook.")
    wh.add_argument("--events", help="Comma-separated event list.")

    fe = sub.add_parser("fetch", help="Download an order's JSON or PDF.")
    fe.add_argument("order_id")
    fe.add_argument("--pdf", action="store_true", help="Download the PDFs instead: one per connection, plus the order's "
                    "assets report when it has one.")
    fe.add_argument("--out", help="Write to this file instead of the screen.")

    sub.add_parser("version", help="Print the tool version.")
    sub.add_parser("schedule", help="Mac: install the hourly job. Other systems: show how.")

    args = p.parse_args(argv)
    if not args.command:
        p.print_help()
        say("")
        say("First time here? Run:  python3 truv_intake.py setup")
        say("")
        return 0

    handlers = {"setup": cmd_setup, "doctor": cmd_doctor, "selftest": cmd_selftest,
                "template": cmd_template, "validate": cmd_validate, "run": cmd_run,
                "send": cmd_send, "direct": cmd_direct, "webhook": cmd_webhook,
                "fetch": cmd_fetch, "version": cmd_version,
                "schedule": cmd_schedule}
    return handlers[args.command](args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        sys.stderr.write("\n\n  Stopped. Nothing was left half-done.\n\n")
        raise SystemExit(130)
