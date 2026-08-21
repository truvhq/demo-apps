from django.db import models

from urla.models import LoanApplication


class Document(models.Model):
    class Category(models.TextChoices):
        VERIFICATION_REPORT = "verification_report", "Verification Report"
        OCR_PAYSTUB = "ocr_paystub", "OCR Paystub"
        OCR_W2 = "ocr_w2", "OCR W-2"
        INVOICE = "invoice", "Invoice"
        OTHER = "other", "Other"

    class Source(models.TextChoices):
        TRUV_REPORT = "truv_report", "Truv Report"
        TRUV_OCR = "truv_ocr", "Truv Document Processing"
        UPLOADED = "uploaded", "Uploaded"
        SAMPLE_REPORT = "sample_report", "Truv-Published Sample Report"

    loan_application = models.ForeignKey(LoanApplication, related_name="documents", on_delete=models.CASCADE)
    category = models.CharField(max_length=30, choices=Category.choices)
    source = models.CharField(max_length=20, choices=Source.choices)
    truv_report_type = models.CharField(max_length=30, blank=True, help_text="voie, voa, income_insights, pll, assets")
    truv_report_id = models.CharField(max_length=64, blank=True)
    # Structured content (raw order/report JSON, AIM Check document-processing
    # results) lives in `data`; genuine binary files (uploads, VOA/VOIE report
    # PDFs, the sample AIM Check PDF) live in `file`. The original plan
    # sketched a single FileField — that doesn't fit JSON-shaped report
    # content, so this is a deliberate refinement made during implementation.
    data = models.JSONField(null=True, blank=True)
    file = models.FileField(upload_to="documents/", null=True, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="available")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_category_display()} — {self.loan_application.loan_number}"
