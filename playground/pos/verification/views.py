import json

from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response

from truv_integration.client import TruvClient, TruvNotConfigured
from truv_integration.models import OrderDefaultsConfig
from truv_integration.product_rules import validate_products
from truv_integration.webhooks import record_webhook_event, verify_against_any_credential_set
from urla.mapping import apply_truv_data, coverage_summary
from urla.models import LoanApplication
from urla.truv_loan import build_loan_object

from .models import (
    IntegrationMethod, STEP_KEY_DEFAULT_FETCH_LIABILITIES, STEP_KEY_DEFAULT_PRODUCTS,
    StepKey, StepVerificationConfig, VerificationRequest,
)
from .serializers import StepVerificationConfigSerializer, VerificationRequestSerializer


def _primary_borrower(loan_application):
    return loan_application.borrowers.filter(borrower_type="primary").first()


def _attach_liabilities_data(client, order_response: dict):
    """Liabilities aren't part of an order response — GET /v1/links/{link_id}/liabilities/
    is a separate call per financial_accounts connection (confirmed via
    docs.truv.com/api-reference/liabilities/link_liabilities). Mutates
    order_response in place, attaching a `liabilities_data` key onto each
    financial_accounts[] entry that has a link_id, so urla.mapping's
    `_apply_liabilities` (which has no TruvClient access by design) can read
    it as if it were part of the original response."""
    for entry in order_response.get("financial_accounts") or []:
        link_id = entry.get("link_id")
        if not link_id:
            continue
        resp = client.get_link_liabilities(link_id)
        if resp.ok:
            entry["liabilities_data"] = resp.data


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
    # Liabilities requires a financial-account connection to get a link_id from —
    # force "assets" into the product list rather than silently doing nothing.
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

    order_number = f"pos-{application.loan_number}-{vr.id}"
    external_user_id = f"pos-{application.loan_uuid}"

    if integration_method == IntegrationMethod.DOCUMENT_UPLOAD:
        resp = client.create_document_collection(documents=[])
        vr.document_collection_id = resp.data.get("id", "")
        vr.status = resp.data.get("status", "created")
        vr.raw_response = resp.data
        vr.save()
        return Response(VerificationRequestSerializer(vr).data, status=201 if resp.ok else 400)

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

    # embedded_order and hosted_order both go through Orders API; hosted_order
    # additionally sets email/phone so Truv emails/texts a share_url and skips
    # returning a usable bridge_token for an in-page widget.
    order_kwargs = dict(
        order_number=order_number,
        external_user_id=external_user_id,
        first_name=borrower.first_name or "John",
        last_name=borrower.last_name or "Johnson",
        products=products,
        data_sources=data_sources or None,
        template_id=template_id or None,
        # Truv's `source` field is a closed enum of real named partner
        # platforms (encompass, simplenexus, blend, ...) — confirmed via
        # docs.truv.com/api-reference/orders/orders_create. "internal" is
        # the correct value for an in-house tool like this one; a made-up
        # string is rejected with `incorrect_parameters`.
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
def document_upload(request, request_id):
    """Uploads borrower-provided files into an existing document collection
    (AIM Check). Expects {"documents": [{"file_name": ..., "content_base64": ...}]}.
    NOTE: the exact per-document field names Truv's API expects for inline file
    bytes (vs. a pre-signed upload URL) are not confirmed against a live sandbox
    response — validate this shape against a real collection before relying on it."""
    vr = get_object_or_404(VerificationRequest, pk=request_id)
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    documents = [
        {"file_name": d.get("file_name", ""), "content": d.get("content_base64", "")}
        for d in request.data.get("documents", [])
    ]
    resp = client.upload_to_collection(vr.document_collection_id, documents)
    vr.raw_response = resp.data
    vr.save()
    return Response(resp.data, status=200 if resp.ok else 400)


@api_view(["POST"])
def document_finalize(request, request_id):
    vr = get_object_or_404(VerificationRequest, pk=request_id)
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    product_type = vr.products[0] if vr.products else "income"
    resp = client.finalize_collection(vr.document_collection_id, product_type=product_type)
    vr.status = resp.data.get("status", "finalizing")
    vr.raw_response = resp.data
    vr.save()
    return Response(resp.data, status=200 if resp.ok else 400)


@api_view(["GET"])
def document_results(request, request_id):
    vr = get_object_or_404(VerificationRequest, pk=request_id)
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    resp = client.get_finalization_results(vr.document_collection_id)
    return Response(resp.data, status=200 if resp.ok else 400)


@api_view(["POST"])
def apply_verification_request(request, request_id):
    """Pulls the latest order state from Truv and writes whatever it can onto
    the URLA record — this is what actually powers the coverage screen."""
    vr = get_object_or_404(VerificationRequest, pk=request_id)
    borrower = _primary_borrower(vr.loan_application)

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
        # Carried across the sync boundary so LOS can refresh this order later
        # without needing POS's (POS-only) VerificationRequest model.
        vr.loan_application.last_truv_order_id = vr.truv_order_id
        vr.loan_application.save()
    else:
        # Document Processing has no order_id — its finalize/results response
        # shape differs from an Orders API response, so urla.mapping's
        # employer/financial_institution extraction will likely find nothing
        # to apply yet. That shows up honestly as an empty "applied" list
        # rather than a crash; wiring a document-results-specific mapping is
        # a follow-up, not something to fake here.
        source_data = vr.raw_response or {}

    if vr.fetch_liabilities:
        _attach_liabilities_data(client, source_data)

    apply_summary = apply_truv_data(vr.loan_application, borrower, source_data, vr.truv_order_id)
    return Response({
        "verification_request": VerificationRequestSerializer(vr).data,
        "apply_summary": apply_summary,
        "coverage": coverage_summary(vr.loan_application),
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


@csrf_exempt
def truv_webhook_receiver(request):
    """POS's own webhook endpoint — mainly load-bearing for Hosted Orders,
    which has no in-page SDK callback to signal completion. Full ngrok
    automation (and LOS's relay into this endpoint) is wired up separately."""
    from django.http import HttpResponseNotAllowed, JsonResponse

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
    if is_valid and order_id:
        VerificationRequest.objects.filter(truv_order_id=order_id).update(status=payload.get("status", "updated"))

        # Auto-apply on completion — this is what makes Hosted Orders (no
        # in-page widget callback) actually finish without the operator
        # having to click "Check Status & Apply" themselves.
        if event_type in ("order-status-updated", "order-finalized"):
            vr = VerificationRequest.objects.filter(truv_order_id=order_id).first()
            if vr is not None:
                try:
                    client = TruvClient.for_active()
                    order_resp = client.get_order(order_id)
                    vr.raw_response = order_resp.data
                    vr.save()
                    borrower = _primary_borrower(vr.loan_application)
                    apply_truv_data(vr.loan_application, borrower, order_resp.data, order_id)
                    vr.loan_application.last_truv_order_id = order_id
                    vr.loan_application.save()
                except TruvNotConfigured:
                    pass

    return JsonResponse({"received": True, "signature_valid": is_valid})
