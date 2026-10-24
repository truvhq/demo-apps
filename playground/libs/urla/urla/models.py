from uuid import uuid4

from django.db import models


class LoanApplication(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED_TO_LOS = "submitted_to_los", "Submitted to LOS"
        IN_UNDERWRITING = "in_underwriting", "In Underwriting"

    loan_uuid = models.UUIDField(default=uuid4, unique=True, editable=False)
    loan_number = models.CharField(max_length=30, unique=True)
    application_number = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    # Set by POS when a verification result is applied; carried across the
    # sync boundary so LOS knows what order to refresh without needing POS's
    # (POS-only) VerificationRequest model.
    last_truv_order_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.loan_number


class Borrower(models.Model):
    class BorrowerType(models.TextChoices):
        PRIMARY = "primary", "Primary"
        CO_BORROWER = "co_borrower", "Co-Borrower"

    loan_application = models.ForeignKey(LoanApplication, related_name="borrowers", on_delete=models.CASCADE)
    borrower_type = models.CharField(max_length=20, choices=BorrowerType.choices, default=BorrowerType.PRIMARY)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    ssn = models.CharField(max_length=11, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    marital_status = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    citizenship_type = models.CharField(max_length=30, blank=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip() or f"Borrower {self.pk}"


class EmploymentRecord(models.Model):
    """URLA Section 1e — Employment & Income."""

    class EmploymentType(models.TextChoices):
        W2 = "w2", "W-2"
        SELF_EMPLOYED = "self_employed", "Self-Employed"
        MILITARY = "military", "Military"
        OTHER = "other", "Other"

    borrower = models.ForeignKey(Borrower, related_name="employment_records", on_delete=models.CASCADE)
    employer_name = models.CharField(max_length=200, blank=True)
    employer_address = models.CharField(max_length=300, blank=True)
    position_title = models.CharField(max_length=150, blank=True)
    is_current = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices, default=EmploymentType.W2)
    monthly_income_base = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    monthly_income_overtime = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    monthly_income_bonus = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    monthly_income_commission = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ownership_share_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.employer_name or 'Employer'} — {self.borrower}"


class OtherIncomeSource(models.Model):
    """Rest of Section 1e — non-employment income."""

    borrower = models.ForeignKey(Borrower, related_name="other_income", on_delete=models.CASCADE)
    source_type = models.CharField(max_length=50)
    monthly_amount = models.DecimalField(max_digits=10, decimal_places=2)


class Asset(models.Model):
    """URLA Section 2a — Assets."""

    ACCOUNT_TYPES = [
        ("checking", "Checking"), ("savings", "Savings"),
        ("retirement", "Retirement"), ("other", "Other"),
    ]

    borrower = models.ForeignKey(Borrower, related_name="assets", on_delete=models.CASCADE)
    account_type = models.CharField(max_length=30, choices=ACCOUNT_TYPES, default="checking")
    financial_institution_name = models.CharField(max_length=200, blank=True)
    account_number_masked = models.CharField(max_length=30, blank=True)
    cash_or_market_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.financial_institution_name or 'Account'} — {self.borrower}"


class Liability(models.Model):
    """URLA Section 2c — Liabilities. Truv-fillable via GET /v1/links/{link_id}/liabilities/
    — a follow-up call against an existing assets/financial-account connection,
    not a standalone Orders product (see urla.mapping._apply_liabilities)."""

    LIABILITY_TYPES = [
        ("revolving", "Revolving"), ("installment", "Installment"),
        ("mortgage", "Mortgage"), ("heloc", "HELOC"), ("other", "Other"),
    ]

    borrower = models.ForeignKey(Borrower, related_name="liabilities", on_delete=models.CASCADE)
    liability_type = models.CharField(max_length=30, choices=LIABILITY_TYPES, default="revolving")
    creditor_name = models.CharField(max_length=200, blank=True)
    account_number_masked = models.CharField(max_length=30, blank=True)
    monthly_payment = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    unpaid_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    # Truv-specific extras beyond the base URLA fields — populated only when
    # Truv-sourced (credit_limit for revolving accounts, interest_rate for loans).
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    interest_rate = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
    to_be_paid_at_closing = models.BooleanField(default=False)


class RealEstateOwned(models.Model):
    """URLA Section 4 — Real Estate Owned. Not Truv-fillable in this simulator."""

    STATUS_CHOICES = [("retained", "Retained"), ("sold", "Sold"), ("pending", "Pending")]

    borrower = models.ForeignKey(Borrower, related_name="real_estate_owned", on_delete=models.CASCADE)
    address = models.CharField(max_length=300, blank=True)
    property_type = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="retained")
    market_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    monthly_rental_income = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    mortgage_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)


class LoanAndProperty(models.Model):
    """URLA Section 4 — loan-level (not per-borrower). Not Truv-fillable in this simulator."""

    OCCUPANCY_CHOICES = [
        ("primary", "Primary Residence"), ("second_home", "Second Home"), ("investment", "Investment"),
    ]
    PURPOSE_CHOICES = [("purchase", "Purchase"), ("refinance", "Refinance")]
    LOAN_PROGRAM_CHOICES = [
        ("conventional", "Conventional"), ("fha", "FHA"), ("va", "VA"), ("usda", "USDA"),
        ("jumbo", "Jumbo"), ("other", "Other"),
    ]

    loan_application = models.OneToOneField(LoanApplication, related_name="loan_property", on_delete=models.CASCADE)
    loan_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    loan_purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default="purchase")
    property_address = models.CharField(max_length=300, blank=True)
    property_type = models.CharField(max_length=50, blank=True)
    occupancy_type = models.CharField(max_length=20, choices=OCCUPANCY_CHOICES, default="primary")
    estimated_property_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    loan_program = models.CharField(max_length=20, choices=LOAN_PROGRAM_CHOICES, blank=True)
    note_rate = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
    loan_term_months = models.PositiveIntegerField(null=True, blank=True, default=360)

    # Mapped 1:1 onto Truv's real Orders API `loan` sub-object (confirmed via
    # docs.truv.com/api-reference/orders/object#loan-object): originator_name/
    # email is Truv's name for "loan officer" (assigned in POS at intake),
    # loan_processor_name/email is "processor" (assigned in LOS after
    # submission), funding_date is set once via the LOS "Fund Loan" action.
    # These get embedded in the `loan` object on every new order this loan
    # creates, and pushed as an update to any already-existing orders via
    # PATCH /v1/orders/{id}/ when assigned/changed after the fact.
    originator_name = models.CharField(max_length=200, blank=True)
    originator_email = models.EmailField(blank=True)
    loan_processor_name = models.CharField(max_length=200, blank=True)
    loan_processor_email = models.EmailField(blank=True)
    funding_date = models.DateField(null=True, blank=True)


class Declaration(models.Model):
    """URLA Declarations section. Not Truv-fillable in this simulator."""

    borrower = models.OneToOneField(Borrower, related_name="declaration", on_delete=models.CASCADE)
    intent_to_occupy_primary = models.BooleanField(null=True)
    ownership_interest_last_3_years = models.BooleanField(null=True)
    outstanding_judgments = models.BooleanField(null=True)
    bankruptcy_last_7_years = models.BooleanField(null=True)
    foreclosure_last_7_years = models.BooleanField(null=True)
    party_to_lawsuit = models.BooleanField(null=True)
    delinquent_federal_debt = models.BooleanField(null=True)


class DemographicInfo(models.Model):
    """URLA Section 8 — Demographic Information. Not Truv-fillable; regulation
    requires this be self-reported by the borrower, never auto-populated."""

    borrower = models.OneToOneField(Borrower, related_name="demographic_info", on_delete=models.CASCADE)
    ethnicity = models.CharField(max_length=50, blank=True)
    race = models.CharField(max_length=50, blank=True)
    sex = models.CharField(max_length=30, blank=True)
    application_taken_method = models.CharField(max_length=30, blank=True)
    info_provided_by_observation = models.BooleanField(null=True)


# --- Fillability catalog + provenance ---------------------------------------

class UrlaSection(models.TextChoices):
    BORROWER_INFO = "borrower_info", "Section 1a — Borrower Information"
    EMPLOYMENT_INCOME = "employment_income", "Section 1e — Employment & Income"
    ASSETS = "assets", "Section 2a — Assets"
    LIABILITIES = "liabilities", "Section 2c — Liabilities"
    REO = "reo", "Section 4 — Real Estate Owned"
    LOAN_PROPERTY = "loan_property", "Section 4 — Loan & Property"
    DECLARATIONS = "declarations", "Declarations"
    DEMOGRAPHICS = "demographics", "Section 8 — Demographic Information"


class UrlaFieldDefinition(models.Model):
    """The taxonomy of every URLA field this simulator models, and whether Truv
    can fill it. Seeded via a data migration (see catalog.py) — fillability is
    an editorial fact about Truv's product surface, not something derived from
    the model schema."""

    field_key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=200)
    section = models.CharField(max_length=30, choices=UrlaSection.choices)
    model_name = models.CharField(max_length=50)
    truv_fillable = models.BooleanField(default=False)
    truv_source_path = models.CharField(
        max_length=200, blank=True,
        help_text="Dotted path (with numeric indices for list items) into an order's "
                   "employer/financial_institution entry, e.g. 'employments.0.income.pay_rate'.",
    )
    encompass_field_id = models.CharField(max_length=10, blank=True, help_text="e.g. FE0102, DD0108")
    required = models.BooleanField(default=False)

    class Meta:
        ordering = ["section", "field_key"]

    def __str__(self):
        return self.field_key


class FillSource(models.TextChoices):
    UNFILLED = "unfilled", "Not yet filled"
    TRUV_AUTO = "truv_auto", "Auto-filled from Truv"
    MANUAL = "manual", "Manually entered"
    LOS_OVERRIDE = "los_override", "Corrected by underwriter"


class FieldFillState(models.Model):
    """One row per (loan, field, borrower) — drives the coverage % and the
    per-field 'Auto-filled by Truv' badge in the POS wizard."""

    loan_application = models.ForeignKey(LoanApplication, related_name="field_fill_states", on_delete=models.CASCADE)
    field_definition = models.ForeignKey(UrlaFieldDefinition, on_delete=models.PROTECT)
    borrower = models.ForeignKey(Borrower, null=True, blank=True, on_delete=models.CASCADE)
    fill_source = models.CharField(max_length=20, choices=FillSource.choices, default=FillSource.UNFILLED)
    filled_at = models.DateTimeField(null=True, blank=True)
    truv_order_id = models.CharField(max_length=64, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["loan_application", "field_definition", "borrower"],
                name="%(app_label)s_one_fill_state_per_field_per_borrower",
            )
        ]

    def __str__(self):
        return f"{self.field_definition_id} ({self.fill_source})"
