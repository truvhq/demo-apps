from django.db import models

from urla.models import LoanApplication


class IntegrationMethod(models.TextChoices):
    EMBEDDED_ORDER = "embedded_order", "Embedded Orders"
    HOSTED_ORDER = "hosted_order", "Hosted Orders"
    BRIDGE_TOKEN = "bridge_token", "Bridge Token"


class VerificationRequest(models.Model):
    """LOS's own copy of POS's model of the same name — a loan officer or
    processor can trigger a brand-new Truv verification directly from LOS
    (not just refresh an order POS already created), e.g. to re-verify or
    pull an additional product without looping back through POS. Captures the
    exact Orders-API parameter surface used, so the request-preview panel and
    this record always agree — same shape as pos/verification/models.py by
    design, kept in LOS's own app/table since it's LOS-side-initiated data."""

    loan_application = models.ForeignKey(LoanApplication, related_name="los_verification_requests", on_delete=models.CASCADE)
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
    """A saved, reusable Truv request configuration per profile — what
    "Run Verification Now" sends for a given step_key in LOS's Configure Truv
    console. Same concept as POS's StepVerificationConfig (kept in LOS's own
    app/table, since LOS's saved presets are independent of POS's — a
    processor tuning LOS's defaults shouldn't silently change what the
    borrower's POS wizard uses, and vice versa). One row per step_key, global
    across all loan files."""

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


class VerificationSnapshot(models.Model):
    """One row per refresh — the raw order state as of that pull, kept around
    so underwriting_support (task 10) can always format from the latest
    snapshot without re-hitting Truv."""

    loan_application = models.ForeignKey(LoanApplication, related_name="verification_snapshots", on_delete=models.CASCADE)
    truv_order_id = models.CharField(max_length=64)
    raw_order_response = models.JSONField()
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fetched_at"]

    def __str__(self):
        return f"{self.loan_application.loan_number} @ {self.fetched_at}"
