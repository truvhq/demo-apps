from django.db import models

from urla.models import LoanApplication


class IntegrationMethod(models.TextChoices):
    EMBEDDED_ORDER = "embedded_order", "Embedded Orders"
    HOSTED_ORDER = "hosted_order", "Hosted Orders"
    BRIDGE_TOKEN = "bridge_token", "Bridge Token"
    DOCUMENT_UPLOAD = "document_upload", "Document Processing"


class VerificationRequest(models.Model):
    """One row per Truv verification the borrower/loan officer kicks off from
    the POS. Captures the exact Orders-API parameter surface used, so the
    request-preview panel and this record always agree."""

    loan_application = models.ForeignKey(LoanApplication, related_name="verification_requests", on_delete=models.CASCADE)
    integration_method = models.CharField(max_length=20, choices=IntegrationMethod.choices)
    products = models.JSONField(default=list)
    data_sources = models.JSONField(default=list)
    template_id = models.CharField(max_length=100, blank=True)
    employer_name = models.CharField(max_length=200, blank=True)
    company_mapping_id = models.CharField(max_length=100, blank=True)
    provider_id = models.CharField(max_length=100, blank=True)

    # Liabilities aren't a standalone Orders product — they're a follow-up
    # GET /v1/links/{link_id}/liabilities/ call against an assets connection
    # this same request already made. This flag tells apply_verification_request
    # to make that extra call per financial_accounts link_id before mapping.
    fetch_liabilities = models.BooleanField(default=False)

    truv_order_id = models.CharField(max_length=64, blank=True)
    truv_user_id = models.CharField(max_length=64, blank=True)
    bridge_token = models.CharField(max_length=500, blank=True)
    share_url = models.URLField(blank=True)
    document_collection_id = models.CharField(max_length=64, blank=True)

    status = models.CharField(max_length=30, default="created")
    raw_response = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.integration_method} for {self.loan_application.loan_number}"


class StepKey(models.TextChoices):
    EMPLOYMENT = "employment", "Employment & Income"
    ASSETS = "assets", "Assets"
    LIABILITIES = "liabilities", "Liabilities"
    COMBINED = "combined", "Combined Income & Assets"


# Sensible starting point per step, used the first time a profile is loaded
# before anyone has saved anything — not stored anywhere until saved.
# Liabilities defaults to the "assets" product since that's what actually
# produces the link_id its follow-up liabilities call needs.
STEP_KEY_DEFAULT_PRODUCTS = {
    StepKey.EMPLOYMENT: ["income"],
    StepKey.ASSETS: ["assets"],
    StepKey.LIABILITIES: ["assets"],
    StepKey.COMBINED: ["income", "assets"],
}
STEP_KEY_DEFAULT_FETCH_LIABILITIES = {
    StepKey.LIABILITIES: True,
}


class StepVerificationConfig(models.Model):
    """A saved, reusable Truv request configuration per application step —
    what "Verify with Truv" actually sends when a borrower clicks it on the
    Employment, Assets, Liabilities, or Combined-VOI/A entry point. Configured
    and saved from the "Configure Truv" developer console; one row per
    step_key, global across all loan applications (this is app-level
    integration config, not per-loan data)."""

    step_key = models.CharField(max_length=20, choices=StepKey.choices, unique=True)
    integration_method = models.CharField(max_length=20, choices=IntegrationMethod.choices, default=IntegrationMethod.EMBEDDED_ORDER)
    products = models.JSONField(default=list)
    data_sources = models.JSONField(default=list)
    template_id = models.CharField(max_length=100, blank=True)
    employer_name = models.CharField(max_length=200, blank=True)
    company_mapping_id = models.CharField(max_length=100, blank=True)
    provider_id = models.CharField(max_length=100, blank=True)
    fetch_liabilities = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Step config: {self.step_key}"
