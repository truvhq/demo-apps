"""The URLA field catalog: every field this simulator models, labeled with its
section and whether Truv's mortgage products can fill it.

`truv_source_path` values for Employment/Income were validated against a real
completed sandbox order (`GET /v1/orders/{id}/`, employer=Home Depot via
Workday) and corrected to match — the real shape differs from what was
originally guessed: employer-level fields sit directly on the `employers[]`
entry (`company_name`, not `name`); employment-level fields use `job_title`
(not `title`) and `job_type` (a full/part-time code, not our W2/self-employed/
military/other classification — so employment_type is NOT marked fillable,
that was a semantic mismatch, not just a wrong path); income figures are
`income`+`income_unit` (annualized) or `pay_rate`+`pay_frequency` (periodic),
never a flat `income.base_pay`; overtime/bonus/commission live per-paystub in
`employments[].statements[]`, not on the employment object itself. Fields
needing this kind of computation (not a plain path lookup) use the sentinel
`truv_source_path="__computed__"` — see the matching function in
`mapping.py`'s `_COMPUTED_EXTRACTORS`.

Assets fields were likewise validated against a real completed sandbox order
(Chase Bank, 3 accounts under one connection) and corrected — see the note on
the Section 2a fields below for specifics. `mapping.py._extract()` still fails
soft (returns None) on a path that doesn't match for any field not marked
`__computed__`, so an unconfirmed guess elsewhere in this catalog leaves a
field unfilled rather than crashing.

Sections 3/4/8 (property, loan terms, declarations, demographics) are seeded
truv_fillable=False across the board — Truv has no product that supplies this
data, and by regulation demographic info must be borrower-self-reported. This
is what makes the POS coverage screen's "0% here" claim true rather than a UI
choice.
"""

from .models import UrlaSection

FIELD_DEFINITIONS = [
    # --- Section 1a: Borrower Information (not Truv-fillable — identity/contact
    #     info is what borrowers use to START a Truv verification, not something
    #     Truv supplies back) ---
    dict(field_key="borrower.first_name", label="First Name", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False, required=True),
    dict(field_key="borrower.last_name", label="Last Name", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False, required=True),
    dict(field_key="borrower.ssn", label="Social Security Number", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False, required=True),
    dict(field_key="borrower.date_of_birth", label="Date of Birth", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False, required=True),
    dict(field_key="borrower.marital_status", label="Marital Status", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False),
    dict(field_key="borrower.email", label="Email", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False, required=True),
    dict(field_key="borrower.phone", label="Phone", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False, required=True),
    dict(field_key="borrower.citizenship_type", label="Citizenship", section=UrlaSection.BORROWER_INFO,
         model_name="Borrower", truv_fillable=False),

    # --- Section 1e: Employment & Income (Truv-fillable via income/employment products) ---
    dict(field_key="employment.employer_name", label="Employer Name", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="FE0102", required=True),
    dict(field_key="employment.employer_address", label="Employer Address", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="FE0105"),
    dict(field_key="employment.position_title", label="Position / Title", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="employments.0.job_title",
         encompass_field_id="FE0110"),
    dict(field_key="employment.start_date", label="Start Date", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="employments.0.start_date",
         encompass_field_id="FE0151"),
    # Truv's job_type ("F"/"P" — full/part-time) isn't the same classification
    # as our w2/self_employed/military/other — not a path bug, a genuine
    # semantic mismatch, so this is intentionally not truv_fillable.
    dict(field_key="employment.employment_type", label="Employment Type", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=False),
    dict(field_key="employment.monthly_income_base", label="Base Monthly Income", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="FE0119", required=True),
    dict(field_key="employment.monthly_income_overtime", label="Overtime", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="FE0120"),
    dict(field_key="employment.monthly_income_bonus", label="Bonus", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="FE0121"),
    dict(field_key="employment.monthly_income_commission", label="Commission", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="EmploymentRecord", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="FE0122"),
    dict(field_key="employment.other_income", label="Other Income Sources", section=UrlaSection.EMPLOYMENT_INCOME,
         model_name="OtherIncomeSource", truv_fillable=False),

    # --- Section 2a: Assets (Truv-fillable via the assets/VOA product) ---
    # Validated against a real completed sandbox order (Chase Bank, 3 accounts
    # under one connection): the real top-level key is `financial_accounts`,
    # not `financial_institutions`; institution name sits at `provider.name`,
    # not a flat `name`; per-account fields are `type`/`mask`/`balance`, not
    # `account_type`/`account_number_masked`. A single connection can carry
    # multiple accounts, so Assets bypasses the generic per-field path lookup
    # entirely — `truv_source_path="__computed__"` here is handled by
    # `mapping.py`'s `_apply_assets`, which iterates every account across
    # every connected institution and creates one Asset row each.
    dict(field_key="assets.financial_institution_name", label="Financial Institution", section=UrlaSection.ASSETS,
         model_name="Asset", truv_fillable=True, truv_source_path="__computed__", encompass_field_id="DD0102",
         required=True),
    dict(field_key="assets.account_type", label="Account Type", section=UrlaSection.ASSETS,
         model_name="Asset", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="DD0108"),
    dict(field_key="assets.account_number_masked", label="Account Number", section=UrlaSection.ASSETS,
         model_name="Asset", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="assets.cash_or_market_value", label="Cash / Market Value", section=UrlaSection.ASSETS,
         model_name="Asset", truv_fillable=True, truv_source_path="__computed__",
         encompass_field_id="DD0151", required=True),

    # --- Section 2c: Liabilities ---
    # Truv-fillable, but NOT via a standalone Orders product — confirmed via
    # docs.truv.com/api-reference/liabilities/link_liabilities: liabilities
    # are retrieved with GET /v1/links/{link_id}/liabilities/ against the
    # link_id from an existing assets/financial-account connection. Every
    # field here is handled by mapping.py's `_apply_liabilities`, which
    # cross-references that response's `accounts[]` (type/mask) against
    # `liabilities.credit[]`/`liabilities.loans[]` (payment/balance/rate) by
    # shared account_id — not a plain path lookup, hence __computed__.
    dict(field_key="liability.creditor_name", label="Creditor Name", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="liability.liability_type", label="Liability Type", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="liability.account_number_masked", label="Account Number", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="liability.monthly_payment", label="Monthly Payment", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="liability.unpaid_balance", label="Unpaid Balance", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="liability.credit_limit", label="Credit Limit", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),
    dict(field_key="liability.interest_rate", label="Interest Rate", section=UrlaSection.LIABILITIES,
         model_name="Liability", truv_fillable=True, truv_source_path="__computed__"),

    # --- Section 4: Real Estate Owned (not Truv-fillable) ---
    dict(field_key="reo.address", label="Property Address", section=UrlaSection.REO,
         model_name="RealEstateOwned", truv_fillable=False),
    dict(field_key="reo.market_value", label="Market Value", section=UrlaSection.REO,
         model_name="RealEstateOwned", truv_fillable=False),
    dict(field_key="reo.mortgage_balance", label="Mortgage Balance", section=UrlaSection.REO,
         model_name="RealEstateOwned", truv_fillable=False),

    # --- Section 4: Loan & Property (not Truv-fillable) ---
    dict(field_key="loan_property.loan_amount", label="Loan Amount", section=UrlaSection.LOAN_PROPERTY,
         model_name="LoanAndProperty", truv_fillable=False, required=True),
    dict(field_key="loan_property.loan_purpose", label="Loan Purpose", section=UrlaSection.LOAN_PROPERTY,
         model_name="LoanAndProperty", truv_fillable=False, required=True),
    dict(field_key="loan_property.property_address", label="Property Address", section=UrlaSection.LOAN_PROPERTY,
         model_name="LoanAndProperty", truv_fillable=False, required=True),
    dict(field_key="loan_property.occupancy_type", label="Occupancy Type", section=UrlaSection.LOAN_PROPERTY,
         model_name="LoanAndProperty", truv_fillable=False, required=True),
    dict(field_key="loan_property.estimated_property_value", label="Estimated Property Value",
         section=UrlaSection.LOAN_PROPERTY, model_name="LoanAndProperty", truv_fillable=False, required=True),

    # --- Declarations (not Truv-fillable) ---
    dict(field_key="declaration.intent_to_occupy_primary", label="Intent to Occupy as Primary Residence",
         section=UrlaSection.DECLARATIONS, model_name="Declaration", truv_fillable=False, required=True),
    dict(field_key="declaration.outstanding_judgments", label="Outstanding Judgments",
         section=UrlaSection.DECLARATIONS, model_name="Declaration", truv_fillable=False, required=True),
    dict(field_key="declaration.bankruptcy_last_7_years", label="Bankruptcy in Last 7 Years",
         section=UrlaSection.DECLARATIONS, model_name="Declaration", truv_fillable=False, required=True),
    dict(field_key="declaration.foreclosure_last_7_years", label="Foreclosure in Last 7 Years",
         section=UrlaSection.DECLARATIONS, model_name="Declaration", truv_fillable=False, required=True),

    # --- Section 8: Demographic Information (not Truv-fillable, by regulation) ---
    dict(field_key="demographic.ethnicity", label="Ethnicity", section=UrlaSection.DEMOGRAPHICS,
         model_name="DemographicInfo", truv_fillable=False, required=True),
    dict(field_key="demographic.race", label="Race", section=UrlaSection.DEMOGRAPHICS,
         model_name="DemographicInfo", truv_fillable=False, required=True),
    dict(field_key="demographic.sex", label="Sex", section=UrlaSection.DEMOGRAPHICS,
         model_name="DemographicInfo", truv_fillable=False, required=True),
]
