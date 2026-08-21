import random

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from truv_integration.client import TruvClient, TruvNotConfigured
from urla.mapping import coverage_summary
from urla.models import (
    Asset, Borrower, Declaration, DemographicInfo, EmploymentRecord, Liability,
    LoanAndProperty, LoanApplication, OtherIncomeSource, RealEstateOwned,
)
from urla.serializers import (
    AssetSerializer, BorrowerSerializer, DeclarationSerializer, DemographicInfoSerializer,
    EmploymentRecordSerializer, LiabilitySerializer, LoanAndPropertySerializer,
    OtherIncomeSourceSerializer, RealEstateOwnedSerializer,
)
from urla.truv_loan import push_loan_object_update

from sync.services import LosSyncError, push_to_los

from .serializers import LoanApplicationDetailSerializer, LoanApplicationListSerializer
from .services import mark_manual_fill


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


# --- Loan application -------------------------------------------------------

@api_view(["GET", "POST"])
def loan_application_list_create(request):
    if request.method == "GET":
        qs = LoanApplication.objects.all().order_by("-created_at")
        return Response(LoanApplicationListSerializer(qs, many=True).data)

    loan_number = request.data.get("loan_number") or f"DEMO-{random.randint(100000, 999999)}"
    application = LoanApplication.objects.create(
        loan_number=loan_number,
        application_number=request.data.get("application_number", ""),
    )
    LoanAndProperty.objects.create(loan_application=application)
    borrower_data = request.data.get("borrower") or {}
    Borrower.objects.create(
        loan_application=application,
        borrower_type=Borrower.BorrowerType.PRIMARY,
        first_name=borrower_data.get("first_name", ""),
        last_name=borrower_data.get("last_name", ""),
        email=borrower_data.get("email", ""),
        phone=borrower_data.get("phone", ""),
    )
    return Response(LoanApplicationDetailSerializer(application).data, status=201)


@api_view(["GET", "PATCH"])
def loan_application_detail(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    if request.method == "GET":
        return Response(LoanApplicationDetailSerializer(application).data)
    for field in ("loan_number", "application_number", "status"):
        if field in request.data:
            setattr(application, field, request.data[field])
    application.save()
    return Response(LoanApplicationDetailSerializer(application).data)


@api_view(["GET"])
def loan_application_coverage(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    return Response(coverage_summary(application))


@api_view(["GET"])
def loan_application_field_fill_states(request, application_id):
    from urla.models import FieldFillState
    from urla.serializers import FieldFillStateSerializer

    application = get_object_or_404(LoanApplication, pk=application_id)
    qs = FieldFillState.objects.filter(loan_application=application).select_related("field_definition")
    return Response(FieldFillStateSerializer(qs, many=True).data)


_LOAN_OBJECT_FIELDS = {"originator_name", "originator_email", "loan_processor_name", "loan_processor_email", "funding_date"}


@api_view(["GET", "PATCH"])
def loan_property_detail(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    instance, _ = LoanAndProperty.objects.get_or_create(loan_application=application)
    if request.method == "GET":
        return Response(LoanAndPropertySerializer(instance).data)
    old_values = {attr: getattr(instance, attr, None) for attr in request.data.keys()}
    serializer = LoanAndPropertySerializer(instance, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    mark_manual_fill(application, None, "LoanAndProperty", list(request.data.keys()), instance=instance, old_values=old_values)

    response_data = dict(serializer.data)
    if _LOAN_OBJECT_FIELDS & set(request.data.keys()):
        push_result = _push_loan_object_update_best_effort(application)
        if push_result is not None:
            response_data["truv_push"] = {"ok": push_result.ok, "status_code": push_result.status_code, "data": push_result.data}
    return Response(response_data)


# --- Borrower ----------------------------------------------------------------

@api_view(["GET", "PATCH"])
def borrower_detail(request, application_id, borrower_id):
    borrower = get_object_or_404(Borrower, pk=borrower_id, loan_application_id=application_id)
    if request.method == "GET":
        return Response(BorrowerSerializer(borrower).data)
    old_values = {attr: getattr(borrower, attr, None) for attr in request.data.keys()}
    serializer = BorrowerSerializer(borrower, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    mark_manual_fill(borrower.loan_application, borrower, "Borrower", list(request.data.keys()), instance=borrower, old_values=old_values)
    return Response(serializer.data)


# --- Generic borrower-scoped section CRUD (employment/income/assets/liabilities/REO) ----

def _section_list_create(request, application_id, borrower_id, model, serializer_class, model_name):
    borrower = get_object_or_404(Borrower, pk=borrower_id, loan_application_id=application_id)
    if request.method == "GET":
        qs = model.objects.filter(borrower=borrower)
        return Response(serializer_class(qs, many=True).data)
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    instance = serializer.save(borrower=borrower)
    mark_manual_fill(borrower.loan_application, borrower, model_name, list(request.data.keys()))
    return Response(serializer_class(instance).data, status=201)


def _section_detail(request, application_id, borrower_id, item_id, model, serializer_class, model_name):
    borrower = get_object_or_404(Borrower, pk=borrower_id, loan_application_id=application_id)
    instance = get_object_or_404(model, pk=item_id, borrower=borrower)
    if request.method == "GET":
        return Response(serializer_class(instance).data)
    if request.method == "DELETE":
        instance.delete()
        return Response(status=204)
    old_values = {attr: getattr(instance, attr, None) for attr in request.data.keys()}
    serializer = serializer_class(instance, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    mark_manual_fill(borrower.loan_application, borrower, model_name, list(request.data.keys()), instance=instance, old_values=old_values)
    return Response(serializer_class(instance).data)


@api_view(["GET", "POST"])
def employment_list_create(request, application_id, borrower_id):
    return _section_list_create(request, application_id, borrower_id, EmploymentRecord, EmploymentRecordSerializer, "EmploymentRecord")


@api_view(["GET", "PATCH", "DELETE"])
def employment_detail(request, application_id, borrower_id, item_id):
    return _section_detail(request, application_id, borrower_id, item_id, EmploymentRecord, EmploymentRecordSerializer, "EmploymentRecord")


@api_view(["GET", "POST"])
def other_income_list_create(request, application_id, borrower_id):
    return _section_list_create(request, application_id, borrower_id, OtherIncomeSource, OtherIncomeSourceSerializer, "OtherIncomeSource")


@api_view(["GET", "PATCH", "DELETE"])
def other_income_detail(request, application_id, borrower_id, item_id):
    return _section_detail(request, application_id, borrower_id, item_id, OtherIncomeSource, OtherIncomeSourceSerializer, "OtherIncomeSource")


@api_view(["GET", "POST"])
def asset_list_create(request, application_id, borrower_id):
    return _section_list_create(request, application_id, borrower_id, Asset, AssetSerializer, "Asset")


@api_view(["GET", "PATCH", "DELETE"])
def asset_detail(request, application_id, borrower_id, item_id):
    return _section_detail(request, application_id, borrower_id, item_id, Asset, AssetSerializer, "Asset")


@api_view(["GET", "POST"])
def liability_list_create(request, application_id, borrower_id):
    return _section_list_create(request, application_id, borrower_id, Liability, LiabilitySerializer, "Liability")


@api_view(["GET", "PATCH", "DELETE"])
def liability_detail(request, application_id, borrower_id, item_id):
    return _section_detail(request, application_id, borrower_id, item_id, Liability, LiabilitySerializer, "Liability")


@api_view(["GET", "POST"])
def reo_list_create(request, application_id, borrower_id):
    return _section_list_create(request, application_id, borrower_id, RealEstateOwned, RealEstateOwnedSerializer, "RealEstateOwned")


@api_view(["GET", "PATCH", "DELETE"])
def reo_detail(request, application_id, borrower_id, item_id):
    return _section_detail(request, application_id, borrower_id, item_id, RealEstateOwned, RealEstateOwnedSerializer, "RealEstateOwned")


# --- Declarations / Demographics (one-to-one, get-or-create) ------------------

@api_view(["GET", "PATCH"])
def declaration_detail(request, application_id, borrower_id):
    borrower = get_object_or_404(Borrower, pk=borrower_id, loan_application_id=application_id)
    instance, _ = Declaration.objects.get_or_create(borrower=borrower)
    if request.method == "GET":
        return Response(DeclarationSerializer(instance).data)
    old_values = {attr: getattr(instance, attr, None) for attr in request.data.keys()}
    serializer = DeclarationSerializer(instance, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    mark_manual_fill(borrower.loan_application, borrower, "Declaration", list(request.data.keys()), instance=instance, old_values=old_values)
    return Response(serializer.data)


@api_view(["GET", "PATCH"])
def demographic_info_detail(request, application_id, borrower_id):
    borrower = get_object_or_404(Borrower, pk=borrower_id, loan_application_id=application_id)
    instance, _ = DemographicInfo.objects.get_or_create(borrower=borrower)
    if request.method == "GET":
        return Response(DemographicInfoSerializer(instance).data)
    old_values = {attr: getattr(instance, attr, None) for attr in request.data.keys()}
    serializer = DemographicInfoSerializer(instance, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    mark_manual_fill(borrower.loan_application, borrower, "DemographicInfo", list(request.data.keys()), instance=instance, old_values=old_values)
    return Response(serializer.data)


# --- Submit to LOS -----------------------------------------------------------

@api_view(["POST"])
def submit_to_los(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    # Flip status before pushing so the payload LOS receives already reflects
    # "submitted" — pushing first would ship a stale "draft" status across.
    application.status = LoanApplication.Status.SUBMITTED_TO_LOS
    application.save()

    try:
        result = push_to_los(application)
    except LosSyncError as exc:
        return Response({"error": str(exc)}, status=502)

    application.last_synced_at = timezone.now()
    application.save()
    return Response({
        "application": LoanApplicationDetailSerializer(application).data,
        "los_result": result,
    })
