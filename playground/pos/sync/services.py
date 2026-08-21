import requests
from django.conf import settings

from urla.models import LoanApplication
from urla.serializers import LoanFilePayloadSerializer


class LosSyncError(Exception):
    pass


def push_to_los(loan_application: LoanApplication) -> dict:
    """POS -> LOS submit. One retry on connection failure — this is two
    localhost processes under one operator, not a flaky network, so anything
    beyond a single retry would just be masking a real misconfiguration."""
    payload = LoanFilePayloadSerializer(loan_application).data
    url = f"{settings.LOS_BASE_URL}/api/sync/loan-files/"
    headers = {"Content-Type": "application/json", "X-Internal-Api-Key": settings.INTERNAL_SYNC_API_KEY}

    last_exc = None
    for attempt in range(2):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            break
        except requests.RequestException as exc:
            last_exc = exc
    else:
        raise LosSyncError(f"Could not reach LOS at {url}: {last_exc}")

    if not resp.ok:
        raise LosSyncError(f"LOS rejected loan file push: {resp.status_code} {resp.text}")

    return resp.json()
