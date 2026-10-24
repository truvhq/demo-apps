from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from activity.services import log_activity
from documents.models import Document
from sync.services import PosSyncError, push_to_pos
from truv_integration.client import TruvClient, TruvNotConfigured
from truv_integration.models import OrderDefaultsConfig
from truv_integration.product_rules import validate_products
from urla.mapping import apply_truv_data, coverage_summary
from urla.models import LoanApplication
from urla.truv_loan import build_loan_object

from .models import (
    IntegrationMethod, STEP_KEY_DEFAULT_FETCH_LIABILITIES, STEP_KEY_DEFAULT_PRODUCTS,
    StepKey, StepVerificationConfig, VerificationRequest, VerificationSnapshot,
)
from .serializers import StepVerificationConfigSerializer, VerificationRequestSerializer


def _sync_report_pdf(client, application, *, report_kind: str, user_id: str, report_id: str):
    """Fetches the real Truv verification report PDF (VOA or VOIE) via the
    dedicated Reports endpoints and stores it as a local file upload — unlike
    the invoice/order-JSON documents (which link out to a Truv-hosted URL),
    this is genuine PDF content, so it's saved to Document.file the same way
    a manually-uploaded document would be, which is also what lets it preview
    inline without the S3 Content-Disposition/CORS issues those signed URLs have."""
    status_code, content = (
        client.get_assets_report_pdf(user_id, report_id) if report_kind == "voa"
        else client.get_voie_report_pdf(user_id, report_id)
    )
    if status_code != 200 or not content:
        return
    report_label = {"voa": "Verification of Assets Report", "voie": "Verification of Income & Employment Report"}[report_kind]
    document, _ = Document.objects.update_or_create(
        loan_application=application,
        category=Document.Category.VERIFICATION_REPORT,
        truv_report_id=f"{report_kind}:{report_id}",
        defaults={
            "source": Document.Source.TRUV_REPORT,
            "truv_report_type": report_kind,
            "file_name": f"{report_label}.pdf",
            "status": "available",
        },
    )
    document.file.save(f"{report_kind}_report_{report_id}.pdf", ContentFile(content), save=True)


def _attach_liabilities_data(client, order_response: dict):
    """Liabilities aren't part of an order response — GET /v1/links/{link_id}/liabilities/
    is a separate call per financial_accounts connection (confirmed via
    docs.truv.com/api-reference/liabilities/link_liabilities). LOS has no
    per-loan "fetch_liabilities" flag the way POS's saved step configs do, so
    it just always attempts this — one cheap read-only call per connected
    institution, harmless if there's nothing there. Mutates order_response in
    place so urla.mapping's `_apply_liabilities`/`summarize_for_underwriting`
    can read it as if it were part of the original response."""
    for entry in order_response.get("financial_accounts") or []:
        link_id = entry.get("link_id")
        if not link_id:
            continue
        resp = client.get_link_liabilities(link_id)
        if resp.ok:
            entry["liabilities_data"] = resp.data


def _sync_documents(client, application, order_resp_data: dict):
    """Auto-populates the document manager with everything Truv already
    returns for this order, instead of requiring a manual click per document:
    - one verification_report Document (JSON) for the whole order, as before
    - the real VOA/VOIE verification report PDF(s), via the dedicated Reports
      endpoints keyed off `voa_report_id`/`voie_report_id` + `user_id` on the
      order response (see _sync_report_pdf — `financial_accounts[].pdf_report`
      / `employers[].pdf_report` are consistently null for standard Orders
      products in sandbox, so they're kept only as a harmless no-op fallback
      below in case some order type does populate them)
    - the order invoice, fetched the same way the manual "Fetch Invoice"
      button already does, just automatically on every refresh
    """
    truv_order_id = application.last_truv_order_id
    products = order_resp_data.get("products") or []

    Document.objects.update_or_create(
        loan_application=application,
        category=Document.Category.VERIFICATION_REPORT,
        truv_report_id=truv_order_id,
        defaults={
            "source": Document.Source.TRUV_REPORT,
            "truv_report_type": ",".join(products),
            "data": order_resp_data,
            "status": order_resp_data.get("status", "available"),
        },
    )

    user_id = order_resp_data.get("user_id")
    if user_id and order_resp_data.get("voa_report_id"):
        _sync_report_pdf(client, application, report_kind="voa", user_id=user_id, report_id=order_resp_data["voa_report_id"])
    if user_id and order_resp_data.get("voie_report_id"):
        _sync_report_pdf(client, application, report_kind="voie", user_id=user_id, report_id=order_resp_data["voie_report_id"])

    for entry in (order_resp_data.get("employers") or []) + (order_resp_data.get("financial_accounts") or []):
        pdf_url = entry.get("pdf_report")
        if not pdf_url:
            continue
        entry_id = entry.get("id", "")
        Document.objects.update_or_create(
            loan_application=application,
            category=Document.Category.VERIFICATION_REPORT,
            truv_report_id=f"{truv_order_id}:{entry_id}",
            defaults={
                "source": Document.Source.TRUV_REPORT,
                "truv_report_type": entry.get("product_type", ""),
                "data": {"pdf_report_url": pdf_url, "provider": entry.get("provider")},
                "status": "available",
            },
        )

    invoice_resp = client.get_order_invoice(truv_order_id)
    if invoice_resp.ok:
        Document.objects.update_or_create(
            loan_application=application,
            category=Document.Category.INVOICE,
            truv_report_id=truv_order_id,
            defaults={
                "source": Document.Source.TRUV_REPORT,
                "data": invoice_resp.data,
                "status": "available",
            },
        )


def auto_sync_verification_documents(application):
    """POS already ran whatever Truv verification the borrower completed
    before clicking "Submit to LOS" — without this, the Documents tab would
    show nothing until someone thought to click "Refresh from Truv" first,
    even though the underlying order (and its documents) already exists on
    Truv's side. Runs the same fetch+sync logic refresh_order uses, just
    automatically the moment the loan file lands in LOS (see
    sync/views.py::receive_loan_file), so verification reports are there by
    default the first time anyone opens the Documents tab.

    Deliberately does NOT call apply_truv_data — ingest_loan_file (the
    POS->LOS submit receiver) already copied over the EmploymentRecord/Asset/
    Liability rows exactly as POS had them, since POS is what originally ran
    apply_truv_data when the borrower completed verification. Re-applying here
    would just be redundant. Swallows all errors: this is a best-effort
    enhancement on top of the submission, not something that should ever fail
    the actual loan-file ingest."""
    if not application.last_truv_order_id:
        return
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured:
        return

    try:
        order_resp = client.get_order(application.last_truv_order_id)
        if not order_resp.ok:
            return
        _attach_liabilities_data(client, order_resp.data)
        # VerificationSnapshot has no unique constraint on (loan_application,
        # truv_order_id) — refresh_order itself just appends a new row on
        # every refresh, so repeated refreshes already leave multiple rows
        # per order. get_or_create's implicit .get() breaks the moment more
        # than one exists; check-then-create avoids that without changing the
        # append-only behavior elsewhere.
        if not VerificationSnapshot.objects.filter(
            loan_application=application, truv_order_id=application.last_truv_order_id,
        ).exists():
            VerificationSnapshot.objects.create(
                loan_application=application, truv_order_id=application.last_truv_order_id,
                raw_order_response=order_resp.data,
            )
        _sync_documents(client, application, order_resp.data)
        log_activity(application, "system", f"Auto-synced verification documents from POS submission (order {application.last_truv_order_id})")
    except Exception as exc:
        log_activity(application, "system", f"Auto document sync on submission failed (non-fatal): {exc}")


@api_view(["POST"])
def refresh_order(request, application_id):
    """The LOS half of the refresh loop: pull the latest state for this
    loan's Truv order, re-apply it onto the URLA record (never clobbering a
    MANUAL/LOS_OVERRIDE field), then push the updated snapshot straight back
    to POS so both sides reflect the refresh without the operator doing
    anything else."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    if not application.last_truv_order_id:
        return Response({"error": "No Truv order associated with this loan file yet — it must go through "
                                   "verification in POS first."}, status=400)

    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    # NOTE: Truv's refresh is asynchronous (there's an order-refresh-failed
    # webhook event for a reason) — fetching get_order() immediately after
    # triggering it may still return the pre-refresh snapshot. A production
    # integration would wait for the completion webhook before re-applying;
    # for this demo we pull whatever's current, which is enough for sandbox
    # data that typically resolves fast. The webhook receiver (task 9) is
    # what closes this gap for real.
    client.refresh_order(application.last_truv_order_id)
    order_resp = client.get_order(application.last_truv_order_id)

    _attach_liabilities_data(client, order_resp.data)

    VerificationSnapshot.objects.create(
        loan_application=application,
        truv_order_id=application.last_truv_order_id,
        raw_order_response=order_resp.data,
    )

    _sync_documents(client, application, order_resp.data)

    borrower = application.borrowers.filter(borrower_type="primary").first()
    apply_summary = apply_truv_data(application, borrower, order_resp.data, application.last_truv_order_id)

    application.last_synced_at = timezone.now()
    application.save()

    log_activity(application, "truv", f"Order {application.last_truv_order_id} refreshed — "
                                        f"{len(apply_summary['applied'])} field(s) updated")

    try:
        push_result = push_to_pos(application)
    except PosSyncError as exc:
        log_activity(application, "system", f"Refresh applied but push-back to POS failed: {exc}")
        return Response({
            "apply_summary": apply_summary,
            "coverage": coverage_summary(application),
            "push_back_error": str(exc),
        }, status=207)

    log_activity(application, "system", "Refreshed data pushed back to POS")
    return Response({
        "apply_summary": apply_summary,
        "coverage": coverage_summary(application),
        "push_back": push_result,
    })


# --- LOS's own "Configure Truv" console — create brand-new verification
# requests directly from LOS, not just refresh orders POS already created.
# Mirrors pos/verification/views.py's equivalent functions exactly; kept as
# LOS's own copy (own VerificationRequest/StepVerificationConfig rows) so a
# processor tuning LOS's defaults doesn't silently change what POS's borrower
# wizard uses, and vice versa. ---------------------------------------------

def _primary_borrower(loan_application):
    return loan_application.borrowers.filter(borrower_type="primary").first()


def _get_or_default_step_config(step_key):
    config, _ = StepVerificationConfig.objects.get_or_create(
        step_key=step_key,
        defaults={
            "products": STEP_KEY_DEFAULT_PRODUCTS.get(step_key, []),
            "fetch_liabilities": STEP_KEY_DEFAULT_FETCH_LIABILITIES.get(step_key, False),
        },
    )
    return config


@api_view(["GET"])
def list_step_configs(request):
    configs = [_get_or_default_step_config(key) for key, _ in StepKey.choices]
    return Response(StepVerificationConfigSerializer(configs, many=True).data)


@api_view(["GET", "PUT"])
def step_config_detail(request, step_key):
    if step_key not in StepKey.values:
        return Response({"error": f"Unknown step_key '{step_key}'. Must be one of {StepKey.values}."}, status=400)

    config = _get_or_default_step_config(step_key)
    if request.method == "GET":
        return Response(StepVerificationConfigSerializer(config).data)

    serializer = StepVerificationConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
def create_verification_request(request):
    application = get_object_or_404(LoanApplication, pk=request.data.get("loan_application"))
    borrower = _primary_borrower(application)
    integration_method = request.data.get("integration_method")
    products = request.data.get("products") or ["income"]
    data_sources = request.data.get("data_sources") or []
    template_id = request.data.get("template_id", "")
    employer_name = request.data.get("employer_name", "")
    company_mapping_id = request.data.get("company_mapping_id", "")
    provider_id = request.data.get("provider_id", "")
    fetch_liabilities = bool(request.data.get("fetch_liabilities", False))
    if fetch_liabilities and "assets" not in products:
        products = [*products, "assets"]

    # Server-side backstop for the same rules the Configure Truv console
    # enforces client-side — catches direct API callers and any stale
    # frontend build with a clear message instead of a raw Truv 400.
    validation_error = validate_products(integration_method, products)
    if validation_error:
        vr = VerificationRequest.objects.create(
            loan_application=application, integration_method=integration_method,
            products=products, data_sources=data_sources, status="error",
            raw_response={"error": {"message": validation_error}},
        )
        return Response(VerificationRequestSerializer(vr).data, status=400)

    vr = VerificationRequest.objects.create(
        loan_application=application,
        integration_method=integration_method,
        products=products,
        data_sources=data_sources,
        template_id=template_id,
        employer_name=employer_name,
        company_mapping_id=company_mapping_id,
        provider_id=provider_id,
        fetch_liabilities=fetch_liabilities,
    )

    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        vr.status = "error"
        vr.raw_response = {"error": str(exc)}
        vr.save()
        return Response(VerificationRequestSerializer(vr).data, status=400)

    order_number = f"los-{application.loan_number}-{vr.id}"
    external_user_id = f"los-{application.loan_uuid}"

    if integration_method == IntegrationMethod.BRIDGE_TOKEN:
        user_resp = client.create_user(
            external_user_id=external_user_id,
            first_name=borrower.first_name or "John",
            last_name=borrower.last_name or "Johnson",
            email=borrower.email or "borrower@example.com",
        )
        truv_user_id = user_resp.data.get("id") or user_resp.data.get("user_id") or ""
        vr.truv_user_id = truv_user_id
        token_resp = client.create_user_bridge_token(
            truv_user_id, products[0],
            data_sources=data_sources or None,
            company_mapping_id=company_mapping_id or None,
            provider_id=provider_id or None,
        )
        vr.bridge_token = token_resp.data.get("bridge_token", "")
        vr.status = token_resp.data.get("status", "created")
        vr.raw_response = token_resp.data
        vr.save()
        return Response(VerificationRequestSerializer(vr).data, status=201 if token_resp.ok else 400)

    order_kwargs = dict(
        order_number=order_number,
        external_user_id=external_user_id,
        first_name=borrower.first_name or "John",
        last_name=borrower.last_name or "Johnson",
        products=products,
        data_sources=data_sources or None,
        template_id=template_id or None,
        source="internal",
    )
    if company_mapping_id:
        order_kwargs["company_mapping_id"] = company_mapping_id
    elif employer_name:
        order_kwargs["employer_name"] = employer_name
    if provider_id:
        order_kwargs["provider_id"] = provider_id
    if integration_method == IntegrationMethod.HOSTED_ORDER:
        order_kwargs["email"] = borrower.email
        order_kwargs["phone"] = borrower.phone

    loan = build_loan_object(application)
    if loan:
        order_kwargs["loan"] = loan
    order_manager_email = OrderDefaultsConfig.get_solo().order_manager_email
    if order_manager_email:
        order_kwargs["cc_emails"] = [order_manager_email]

    resp = client.create_order(**order_kwargs)
    vr.truv_order_id = resp.data.get("id", "")
    vr.truv_user_id = resp.data.get("external_user_id", external_user_id)
    vr.bridge_token = resp.data.get("bridge_token", "")
    vr.share_url = resp.data.get("share_url") or resp.data.get("short_share_url", "")
    vr.status = resp.data.get("status", "created")
    vr.raw_response = resp.data
    vr.save()
    return Response(VerificationRequestSerializer(vr).data, status=201 if resp.ok else 400)


@api_view(["GET"])
def verification_request_detail(request, request_id):
    vr = get_object_or_404(VerificationRequest, pk=request_id)
    return Response(VerificationRequestSerializer(vr).data)


@api_view(["POST"])
def apply_verification_request(request, request_id):
    """Pulls the latest order state from Truv and writes whatever it can onto
    the URLA record, then pushes the result back to POS — LOS is authoritative
    post-submission, same as refresh_order above, so any loan already synced
    to POS should see this new data too."""
    vr = get_object_or_404(VerificationRequest, pk=request_id)
    application = vr.loan_application
    borrower = _primary_borrower(application)

    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    if vr.truv_order_id:
        order_resp = client.get_order(vr.truv_order_id)
        vr.raw_response = order_resp.data
        vr.status = order_resp.data.get("status", vr.status)
        vr.save()
        source_data = order_resp.data
        application.last_truv_order_id = vr.truv_order_id
        application.save()
    else:
        # No order_id (e.g. a Bridge Token request whose bridge_token
        # response has no order attached yet) — same honest-empty-applied
        # behavior as POS's version rather than faking a mapping.
        source_data = vr.raw_response or {}

    if vr.fetch_liabilities:
        _attach_liabilities_data(client, source_data)

    apply_summary = apply_truv_data(application, borrower, source_data, vr.truv_order_id)
    application.last_synced_at = timezone.now()
    application.save()
    log_activity(application, "truv", f"LOS-initiated verification applied — {len(apply_summary['applied'])} field(s) updated")

    try:
        push_result = push_to_pos(application)
    except PosSyncError as exc:
        log_activity(application, "system", f"Verification applied but push-back to POS failed: {exc}")
        return Response({
            "verification_request": VerificationRequestSerializer(vr).data,
            "apply_summary": apply_summary,
            "coverage": coverage_summary(application),
            "push_back_error": str(exc),
        }, status=207)

    log_activity(application, "system", "Verification data pushed to POS")
    return Response({
        "verification_request": VerificationRequestSerializer(vr).data,
        "apply_summary": apply_summary,
        "coverage": coverage_summary(application),
        "push_back": push_result,
    })


@api_view(["GET"])
def search_employers(request):
    query = request.GET.get("q", "")
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)
    resp = client.search_companies(query)
    return Response(resp.data)


@api_view(["GET"])
def search_providers(request):
    query = request.GET.get("q", "")
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)
    resp = client.search_providers(query)
    return Response(resp.data)
