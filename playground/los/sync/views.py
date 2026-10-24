import json

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from activity.services import log_activity
from urla.serializers import LoanFilePayloadSerializer
from verification.views import auto_sync_verification_documents

from .services import ingest_loan_file


def _check_internal_key(request):
    provided = request.headers.get("X-Internal-Api-Key", "")
    return settings.INTERNAL_SYNC_API_KEY and provided == settings.INTERNAL_SYNC_API_KEY


@csrf_exempt
def receive_loan_file(request):
    """POS pushes here on 'Submit to LOS' — see pos/sync/services.py::push_to_los."""
    if request.method != "POST":
        return JsonResponse({"error": "method not allowed"}, status=405)
    if not _check_internal_key(request):
        return JsonResponse({"error": "invalid or missing X-Internal-Api-Key"}, status=403)

    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON"}, status=400)

    application = ingest_loan_file(payload)
    log_activity(application, "system", f"Loan file received from POS (status: {application.status})")
    auto_sync_verification_documents(application)
    return JsonResponse({
        "los_loan_file_id": application.id,
        "loan_uuid": str(application.loan_uuid),
        "status": application.status,
    }, status=201)


def loan_file_snapshot(request, application_id):
    """Read-only: the exact payload shape LOS would push back on refresh —
    useful for POS/LOS parity debugging. Not part of the push flow itself."""
    from django.shortcuts import get_object_or_404

    from urla.models import LoanApplication

    application = get_object_or_404(LoanApplication, pk=application_id)
    return JsonResponse(LoanFilePayloadSerializer(application).data)
