from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from truv_integration.models import WebhookEvent
from urla.models import LoanApplication

from .models import ActivityLogEntry


@api_view(["GET"])
def activity_log(request, application_id):
    """Combines this loan's narrative ActivityLogEntry rows with any Truv
    webhook events matched by order id — merged and sorted so the feed reads
    as one timeline rather than two separate lists."""
    application = get_object_or_404(LoanApplication, pk=application_id)

    entries = [
        {"kind": "activity", "actor": e.actor, "message": e.message, "timestamp": e.created_at}
        for e in ActivityLogEntry.objects.filter(loan_application=application)
    ]

    if application.last_truv_order_id:
        webhook_events = WebhookEvent.objects.filter(truv_order_id=application.last_truv_order_id)
        entries += [
            {
                "kind": "webhook",
                "actor": "truv",
                "message": f"Webhook: {e.event_type} (signature {'valid' if e.signature_valid else 'INVALID'})",
                "timestamp": e.received_at,
            }
            for e in webhook_events
        ]

    entries.sort(key=lambda e: e["timestamp"], reverse=True)
    return Response(entries)
