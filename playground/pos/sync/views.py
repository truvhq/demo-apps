import json

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response

from urla.models import LoanApplication
from urla.sync import ingest_loan_file


def _check_internal_key(request):
    provided = request.headers.get("X-Internal-Api-Key", "")
    return settings.INTERNAL_SYNC_API_KEY and provided == settings.INTERNAL_SYNC_API_KEY


@csrf_exempt
def refresh_callback(request):
    """LOS pushes here after a refresh completes — see los/sync/services.py::push_to_pos.
    LOS is authoritative post-submission, so this overwrites POS's copy outright."""
    if request.method != "POST":
        return JsonResponse({"error": "method not allowed"}, status=405)
    if not _check_internal_key(request):
        return JsonResponse({"error": "invalid or missing X-Internal-Api-Key"}, status=403)

    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON"}, status=400)

    application = ingest_loan_file(payload)
    return JsonResponse({"pos_application_id": application.id, "status": application.status}, status=200)


@api_view(["GET"])
def sync_status(request, application_id):
    """Lightweight poll target for the POS frontend — bumps whenever a refresh
    push-back lands, without the wizard needing to know why."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    return Response({
        "last_synced_at": application.last_synced_at,
        "status": application.status,
    })
