"""LOS's two webhook surfaces. Only LOS gets an ngrok tunnel (it's the
longer-lived system of record), so it exposes both its own receiver and a
byte-exact relay into POS's receiver — one tunnel, two logical endpoints.
"""
import json
import logging

import requests
from django.conf import settings
from django.http import HttpResponseNotAllowed, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from truv_integration.webhooks import record_webhook_event, verify_against_any_credential_set
from urla.mapping import apply_truv_data
from urla.models import LoanApplication

logger = logging.getLogger(__name__)


@csrf_exempt
def truv_webhook_receiver(request):
    """LOS's own receiver. On a completion-shaped event for an order LOS
    already knows about (last_truv_order_id), re-applies immediately rather
    than waiting for someone to click "Refresh from Truv" — this is what
    makes Hosted Orders (which has no in-page widget callback at all)
    actually complete without manual intervention."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    raw_body = request.body
    header_sig = request.headers.get("X-Webhook-Sign", "")
    is_valid, matched_env = verify_against_any_credential_set(raw_body, header_sig)

    try:
        payload = json.loads(raw_body or b"{}")
    except json.JSONDecodeError:
        payload = {}

    record_webhook_event(payload, is_valid, matched_env)

    order_id = payload.get("order_id") or payload.get("id")
    event_type = payload.get("event_type", "")
    if is_valid and order_id and event_type in ("order-status-updated", "order-finalized"):
        application = LoanApplication.objects.filter(last_truv_order_id=order_id).first()
        if application is not None:
            try:
                from truv_integration.client import TruvClient
                client = TruvClient.for_active()
                order_resp = client.get_order(order_id)
                borrower = application.borrowers.filter(borrower_type="primary").first()
                apply_truv_data(application, borrower, order_resp.data, order_id)
                logger.info("Auto-applied webhook-triggered update for order %s", order_id)
            except Exception:
                logger.exception("Failed to auto-apply webhook update for order %s", order_id)

    return JsonResponse({"received": True, "signature_valid": is_valid})


@csrf_exempt
def pos_relay(request):
    """Forwards the raw, unmodified body + original signature header to
    POS's own receiver so POS can verify independently against its own
    credential secret. A dumb byte-exact relay, not a re-signed request —
    this is what lets a single ngrok tunnel serve both apps."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        resp = requests.post(
            f"{settings.POS_BASE_URL}/api/verification/webhooks/truv/",
            data=request.body,
            headers={"X-Webhook-Sign": request.headers.get("X-Webhook-Sign", ""),
                      "Content-Type": "application/json"},
            timeout=10,
        )
        return JsonResponse({"relayed": True, "pos_status": resp.status_code})
    except requests.RequestException as exc:
        logger.warning("Failed to relay webhook to POS: %s", exc)
        return JsonResponse({"relayed": False, "error": str(exc)}, status=502)
