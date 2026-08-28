from django.db import models
from django.db.models import Q

from .crypto import decrypt_secret, encrypt_secret


class Environment(models.TextChoices):
    SANDBOX = "sandbox", "Sandbox"
    PRODUCTION = "production", "Production"


# Per Truv's docs (docs.truv.com/api-reference/authentication#environments):
# sandbox and production use the identical base URL — which environment a
# request hits is determined entirely by the Access Secret's prefix
# (`sandbox-...` vs `prod-...`), not by the host. base_url is kept as an
# editable field only for edge cases (e.g. a future mTLS/custom-domain setup),
# not because sandbox/production actually differ.
TRUV_DEFAULT_BASE_URL = "https://prod.truv.com/v1/"


class TruvCredentialSet(models.Model):
    """One row per named Truv API credential (e.g. 'Sandbox', 'Production').
    Exactly one row may be is_active=True at a time — that is the credential
    set TruvClient.for_active() uses for every outbound call, app-wide.
    """

    name = models.CharField(max_length=100)
    environment = models.CharField(max_length=20, choices=Environment.choices)
    client_id = models.CharField(max_length=200)
    encrypted_secret = models.BinaryField()
    base_url = models.URLField(default=TRUV_DEFAULT_BASE_URL, blank=True,
                                help_text="Same for sandbox and production — only change this for a custom/mTLS endpoint.")
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=Q(is_active=True),
                name="%(app_label)s_only_one_active_credential_set",
            )
        ]
        ordering = ["-is_active", "name"]

    def __str__(self):
        return f"{self.name} ({self.environment}){' [active]' if self.is_active else ''}"

    @property
    def secret(self) -> str:
        return decrypt_secret(self.encrypted_secret)

    @secret.setter
    def secret(self, plaintext: str):
        self.encrypted_secret = encrypt_secret(plaintext)


class ApiCallLog(models.Model):
    """Every TruvClient._request() call writes one of these — powers the
    Activity panel in both POS and LOS without any extra instrumentation."""

    truv_user_id = models.CharField(max_length=64, blank=True, db_index=True)
    method = models.CharField(max_length=10)
    endpoint = models.CharField(max_length=255)
    request_body = models.JSONField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    status_code = models.IntegerField(null=True)
    duration_ms = models.FloatField(null=True)
    environment = models.CharField(max_length=20, choices=Environment.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.method} {self.endpoint} -> {self.status_code}"


class AimCheckFlow(models.TextChoices):
    TRUV_DOCUMENT_UPLOAD = "truv_document_upload", "Truv Document Processing"
    AIM_CHECK_OCR = "aim_check_ocr", "AIM Check via OCR"


class AimCheckOcrSource(models.TextChoices):
    SAMPLE_REPORT = "sample_report", "Sample Report"
    ENCOMPASS_EDC = "encompass_edc", "Encompass EDC (ASO)"


class AimCheckConfig(models.Model):
    """Controls what a "Generate AIM Check Report" button does — one row per
    project (POS and LOS each maintain their own, same pattern as
    TruvCredentialSet). Truv's own product distinguishes two real document-
    based income paths (docs.truv.com/mortgage/products/aim-check,
    docs.truv.com/mortgage/integration/ice-encompass/aim-check):

    - `truv_document_upload`: call Truv's real Document Processing API
      directly against a manually-uploaded document (create collection ->
      upload -> finalize with product_type=income -> retrieve report). Live,
      not fabricated.
    - `aim_check_ocr`: AIM Check ordered via Encompass's Automated Service
      Ordering (ASO) instead of calling Truv directly — not wired up yet.
      `ocr_source` picks what happens in the meantime: `sample_report`
      attaches a real Truv-published sample AIM/Freddie report PDF as an
      honest stand-in (never a fabricated one); `encompass_edc` reports
      "not yet implemented" until that integration exists."""

    flow = models.CharField(max_length=30, choices=AimCheckFlow.choices, default=AimCheckFlow.TRUV_DOCUMENT_UPLOAD)
    ocr_source = models.CharField(max_length=20, choices=AimCheckOcrSource.choices, default=AimCheckOcrSource.SAMPLE_REPORT)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls) -> "AimCheckConfig":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class OrderDefaultsConfig(models.Model):
    """Account-level defaults applied to every new Truv order this project
    creates — one row per project, same pattern as TruvCredentialSet/
    AimCheckConfig. `order_manager_email`, if set, is included in the order's
    `cc_emails` (confirmed real field: docs.truv.com/api-reference/orders/
    object#attributes — "Email addresses for CC on order status updates")
    so that address gets status-update notifications for every order, the
    same role Truv's dashboard "Order Manager" concept plays for
    dashboard-created orders."""

    order_manager_email = models.EmailField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls) -> "OrderDefaultsConfig":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class WebhookEvent(models.Model):
    """A received Truv webhook, post signature-verification."""

    truv_user_id = models.CharField(max_length=64, blank=True, db_index=True)
    truv_order_id = models.CharField(max_length=64, blank=True, db_index=True)
    event_type = models.CharField(max_length=64)
    payload = models.JSONField()
    signature_valid = models.BooleanField(default=False)
    matched_environment = models.CharField(max_length=20, blank=True)
    processed = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.event_type} ({self.truv_order_id or self.truv_user_id})"
