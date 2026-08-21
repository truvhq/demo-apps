import base64
import mimetypes
import uuid

import requests
from django.core.files.base import ContentFile
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from activity.services import log_activity
from truv_integration.client import TruvClient, TruvNotConfigured
from truv_integration.models import AimCheckConfig, AimCheckFlow, AimCheckOcrSource
from urla.models import LoanApplication
from verification.views import auto_sync_verification_documents

from .models import Document
from .serializers import DocumentSerializer

# A real Truv-published sample AIM/Freddie report PDF (confirmed live —
# docs.truv.com/developers/testing/gse-testing lists this voie_report_id
# under "Pre-generated income and employment report IDs ... for AIM-VOIE
# assessment"). Used as an honest stand-in for the not-yet-built Encompass
# ASO path — never a fabricated document.
AIM_CHECK_SAMPLE_PDF_URL = "https://truv.com/wp-content/uploads/2025/07/report-5abf3fddc6cd44a38038c0c6bfd4f26f.pdf"


@api_view(["GET"])
def document_list(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    qs = Document.objects.filter(loan_application=application)
    # Self-heals loan files submitted before auto-sync-on-receive existed (or
    # any other reason a Truv order was never synced to documents) — the
    # first time anyone opens the Documents tab for a loan that has a Truv
    # order but no documents yet, fetch and populate them on the spot instead
    # of requiring a manual "Refresh from Truv" click first.
    if not qs.exists() and application.last_truv_order_id:
        auto_sync_verification_documents(application)
        qs = Document.objects.filter(loan_application=application)
    return Response(DocumentSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET"])
def document_download(request, document_id):
    document = get_object_or_404(Document, pk=document_id)
    if document.file:
        return FileResponse(document.file.open("rb"), filename=document.file_name or document.file.name, as_attachment=True)
    if document.data is not None:
        return JsonResponse(document.data, safe=False)
    raise Http404("Document has no content")


@api_view(["GET"])
def document_pdf_proxy(request, document_id):
    """Single same-origin path for previewing ANY document's PDF in an
    iframe, whether it's stored locally (Document.file — VOA/VOIE reports,
    uploads) or a Truv-hosted URL (Document.data.pdf_report_url/.file —
    invoice, per-entry reports):

    - Truv's S3-hosted PDFs are served with `Content-Disposition: attachment`
      and no CORS headers, so pointing an iframe straight at the signed URL
      just triggers a download, and a client-side fetch()-to-blob workaround
      can't read the bytes either. Fetching it server-side (no CORS involved
      between two backends) and re-serving it same-origin with
      `Content-Disposition: inline` is what actually lets it preview.
    - Locally-stored files are already same-origin from Django's own view
      layer, but DocumentSerializer's `file_url` is an ABSOLUTE url built from
      whatever host Django itself sees the request as coming from (port 8001)
      — the frontend runs on a different port (5174, via Vite's dev proxy,
      which only proxies /api, not /media), so pointing an iframe straight at
      `file_url` is genuinely cross-origin and gets blocked. Serving it from
      here instead keeps it on the same /api-proxied path as everything else."""
    document = get_object_or_404(Document, pk=document_id)

    if document.file:
        response = FileResponse(document.file.open("rb"), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{document.file_name or f"document-{document.id}.pdf"}"'
        return response

    url = (document.data or {}).get("pdf_report_url") or (document.data or {}).get("file")
    if not url:
        raise Http404("Document has no PDF content")

    resp = requests.get(url, timeout=15)
    if not resp.ok:
        return Response({"error": f"Could not fetch PDF from Truv ({resp.status_code})"}, status=502)

    response = HttpResponse(resp.content, content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{document.file_name or f"document-{document.id}.pdf"}"'
    return response


@api_view(["POST"])
def fetch_invoice(request, application_id):
    """Pulls the real Truv order invoice (GET /v1/orders/{id}/invoice/) and
    stores it as a Document — this is genuine Truv billing data, not fabricated."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    if not application.last_truv_order_id:
        return Response({"error": "No Truv order associated with this loan file yet."}, status=400)
    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    resp = client.get_order_invoice(application.last_truv_order_id)
    # update_or_create, not create — refresh_order's auto-sync (_sync_documents
    # in verification/views.py) upserts the invoice by the same
    # (loan_application, category, truv_report_id) key. Using .create() here
    # let a manual click and an auto-refresh produce two rows for the same
    # invoice, which then broke that upsert once there were duplicates.
    document, _ = Document.objects.update_or_create(
        loan_application=application,
        category=Document.Category.INVOICE,
        truv_report_id=application.last_truv_order_id,
        defaults={
            "source": Document.Source.TRUV_REPORT,
            "data": resp.data,
            "status": "available" if resp.ok else "error",
        },
    )
    log_activity(application, "system", "Fetched Truv order invoice" if resp.ok else "Invoice fetch failed")
    return Response(DocumentSerializer(document, context={"request": request}).data, status=201 if resp.ok else 400)


@api_view(["POST"])
def generate_aim_check_report(request, application_id):
    """Generates an AIM Check-style income report, sourced per AimCheckConfig
    (see truv_integration.models.AimCheckConfig for the full rationale):

    - truv_document_upload: runs the real Truv Document Processing API
      (create collection -> upload -> finalize with product_type="income")
      against a manually-uploaded document already on this loan file. A
      genuine, live Truv call — not fabricated.
    - aim_check_ocr + sample_report: attaches a real Truv-published sample
      AIM/Freddie report PDF as an honest stand-in for the not-yet-built
      Encompass ASO path.
    - aim_check_ocr + encompass_edc: not implemented yet — returns a clear
      error instead of faking a result.
    """
    application = get_object_or_404(LoanApplication, pk=application_id)
    config = AimCheckConfig.get_solo()

    if config.flow == AimCheckFlow.AIM_CHECK_OCR:
        if config.ocr_source == AimCheckOcrSource.ENCOMPASS_EDC:
            return Response({
                "error": "Encompass EDC integration is not yet implemented. Switch the AIM Check source to "
                         "\"Sample Report\" in Configure Truv, or select the Truv Document Processing flow instead.",
            }, status=400)

        resp = requests.get(AIM_CHECK_SAMPLE_PDF_URL, timeout=15)
        if not resp.ok:
            return Response({"error": f"Could not fetch the sample AIM Check report ({resp.status_code})"}, status=502)
        document = Document.objects.create(
            loan_application=application,
            category=Document.Category.VERIFICATION_REPORT,
            source=Document.Source.SAMPLE_REPORT,
            truv_report_type="aim_check",
            file_name="AIM Check Report (Sample).pdf",
            status="available",
        )
        document.file.save("aim_check_sample_report.pdf", ContentFile(resp.content), save=True)
        log_activity(application, "user", "Generated AIM Check report from a Truv-published sample (Encompass EDC not yet wired up)")
        return Response(DocumentSerializer(document, context={"request": request}).data, status=201)

    # flow == truv_document_upload: real Truv Document Processing call
    # against a document the user already added via the manual Upload File
    # button — defaults to the most recently uploaded one if not specified.
    document_id = request.data.get("document_id")
    source_document = (
        get_object_or_404(Document, pk=document_id, loan_application=application) if document_id
        else Document.objects.filter(loan_application=application, source=Document.Source.UPLOADED).order_by("-created_at").first()
    )
    if source_document is None or not source_document.file:
        return Response({"error": "Upload a document first, then generate the AIM Check report from it."}, status=400)

    try:
        client = TruvClient.for_active()
    except TruvNotConfigured as exc:
        return Response({"error": str(exc)}, status=400)

    primary_borrower = application.borrowers.filter(borrower_type="primary").first()
    # external_user_id must be unique per Truv user (confirmed via a live
    # "incorrect_parameters" error on a second call with the same value) — a
    # fresh suffix per invocation means re-running this doesn't collide with
    # a user Truv already created for an earlier AIM Check attempt.
    user_resp = client.create_user(
        external_user_id=f"los-aimcheck-{application.loan_uuid}-{uuid.uuid4().hex[:8]}",
        first_name=(primary_borrower.first_name if primary_borrower else "") or "John",
        last_name=(primary_borrower.last_name if primary_borrower else "") or "Doe",
    )
    truv_user_id = user_resp.data.get("id") or user_resp.data.get("user_id")
    if not truv_user_id:
        return Response({"error": "Could not create a Truv user for document processing.", "detail": user_resp.data}, status=502)

    with source_document.file.open("rb") as f:
        content_b64 = base64.b64encode(f.read()).decode("ascii")
    mime_type = mimetypes.guess_type(source_document.file.name)[0] or "application/octet-stream"

    collection_resp = client.create_document_collection(documents=[{
        "mime_type": mime_type,
        "filename": source_document.file_name or source_document.file.name,
        "content": content_b64,
        "user_id": truv_user_id,
    }])
    # Confirmed via a live sandbox call — the create-collection response
    # keys the id as "collection_id", not "id".
    collection_id = collection_resp.data.get("collection_id", "")
    if not collection_id:
        return Response({"error": "Truv did not return a document collection id.", "detail": collection_resp.data}, status=502)

    client.finalize_collection(collection_id, product_type="income")
    # Document processing finalizes asynchronously (a task-status-updated
    # webhook fires when done) — fetch whatever's available right now rather
    # than blocking the request on a poll loop; sandbox data typically
    # resolves fast, but if it's not ready yet this honestly reflects that
    # instead of pretending a result exists.
    results_resp = client.get_finalization_results(collection_id)

    document, _ = Document.objects.update_or_create(
        loan_application=application,
        category=Document.Category.VERIFICATION_REPORT,
        truv_report_id=collection_id,
        defaults={
            "source": Document.Source.TRUV_OCR,
            "truv_report_type": "aim_check",
            "file_name": "AIM Check Report.json",
            "data": {
                "collection_id": collection_id,
                "source_document": source_document.file_name or source_document.file.name,
                "still_processing": not results_resp.ok,
                "result": results_resp.data,
            },
            "status": "available" if results_resp.ok else "processing",
        },
    )
    log_activity(application, "user", f"Generated AIM Check report via Truv Document Processing (collection {collection_id})")
    return Response(DocumentSerializer(document, context={"request": request}).data, status=201)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def upload_document(request, application_id):
    application = get_object_or_404(LoanApplication, pk=application_id)
    uploaded = request.FILES.get("file")
    if not uploaded:
        return Response({"error": "No file provided."}, status=400)
    document = Document.objects.create(
        loan_application=application,
        category=request.data.get("category", Document.Category.OTHER),
        source=Document.Source.UPLOADED,
        file=uploaded,
        file_name=uploaded.name,
        status="available",
    )
    log_activity(application, "user", f"Uploaded document: {uploaded.name}")
    return Response(DocumentSerializer(document, context={"request": request}).data, status=201)
