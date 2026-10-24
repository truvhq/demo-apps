from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from truv_integration.client import TruvClient, TruvNotConfigured
from urla.mapping import coverage_summary
from urla.models import Borrower, LoanAndProperty, LoanApplication
from urla.serializers import BorrowerSerializer, FieldFillStateSerializer, LoanAndPropertySerializer
from urla.truv_loan import push_loan_object_update

from .serializers import LoanFileDetailSerializer, LoanFileListSerializer
from .services import mark_los_override

_LOAN_OBJECT_FIELDS = {"originator_name", "originator_email", "loan_processor_name", "loan_processor_email", "funding_date"}


def _push_loan_object_update_best_effort(application):
    """Best-effort: pushes any updated loan-officer/processor/funding_date
    fields onto this application's most-recently-known Truv order. Never
    raises — Truv not being configured, or rejecting the update because the
    order has already completed (a real, documented constraint — see
    urla.truv_loan.push_loan_object_update), shouldn't break saving the form."""
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured:
        return None
    try:
        return push_loan_object_update(client, application)
    except Exception:
        return None


@api_view(["GET"])
def loan_file_list(request):
    qs = LoanApplication.objects.all().order_by("-updated_at")
    return Response(LoanFileListSerializer(qs, many=True).data)


@api_view(["GET"])
def loan_file_detail(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    return Response(LoanFileDetailSerializer(application).data)


@api_view(["GET"])
def loan_file_coverage(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    return Response(coverage_summary(application))


@api_view(["GET"])
def loan_file_field_fill_states(request, application_id):
    from urla.models import FieldFillState

    application = get_object_or_404(LoanApplication, pk=application_id)
    qs = FieldFillState.objects.filter(loan_application=application).select_related("field_definition")
    return Response(FieldFillStateSerializer(qs, many=True).data)


@api_view(["PATCH"])
def borrower_correction(request, application_id, borrower_id):
    """Underwriter correction — marks touched fields LOS_OVERRIDE rather than
    MANUAL, so the coverage screen can distinguish "the borrower typed this"
    from "underwriting caught and fixed this"."""
    borrower = get_object_or_404(Borrower, pk=borrower_id, loan_application_id=application_id)
    serializer = BorrowerSerializer(borrower, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    mark_los_override(borrower.loan_application, borrower, "Borrower", list(request.data.keys()))
    return Response(serializer.data)


@api_view(["PATCH"])
def loan_property_correction(request, application_id):
    """Lets a processor set rate/term/program (and correct loan amount/property
    value) — these fields were never Truv-fillable to begin with, so unlike
    borrower_correction there's no LOS_OVERRIDE bookkeeping to do here.
    Also handles assigning the processor and funding the loan (same PATCH,
    same fields Truv's real `loan` object exposes) — when those specific
    fields are touched, pushes the update onto the current Truv order via
    PATCH /v1/orders/{id}/ and reports back whether Truv actually accepted it."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    loan_property = get_object_or_404(LoanAndProperty, loan_application=application)
    serializer = LoanAndPropertySerializer(loan_property, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()

    response_data = dict(serializer.data)
    if _LOAN_OBJECT_FIELDS & set(request.data.keys()):
        push_result = _push_loan_object_update_best_effort(application)
        if push_result is not None:
            response_data["truv_push"] = {"ok": push_result.ok, "status_code": push_result.status_code, "data": push_result.data}
    return Response(response_data)
