import requests
from django.conf import settings

from urla.serializers import LoanFilePayloadSerializer
from urla.sync import ingest_loan_file  # noqa: F401 — re-exported for los/sync/views.py


class PosSyncError(Exception):
    pass


def push_to_pos(loan_application) -> dict:
    """LOS -> POS refresh push-back. Sends the exact same payload shape as
    POS's original submit push (see pos/sync/services.py::push_to_los) — POS's
    /api/sync/refresh-callback/ ingests it with the same shared urla.sync
    logic and overwrites its copy, since LOS is authoritative post-submission."""
    payload = LoanFilePayloadSerializer(loan_application).data
    url = f"{settings.POS_BASE_URL}/api/sync/refresh-callback/"
    headers = {"Content-Type": "application/json", "X-Internal-Api-Key": settings.INTERNAL_SYNC_API_KEY}

    last_exc = None
    for attempt in range(2):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            break
        except requests.RequestException as exc:
            last_exc = exc
    else:
        raise PosSyncError(f"Could not reach POS at {url}: {last_exc}")

    if not resp.ok:
        raise PosSyncError(f"POS rejected refresh push-back: {resp.status_code} {resp.text}")

    return resp.json()
