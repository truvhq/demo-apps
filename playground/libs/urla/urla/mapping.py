"""The single place a Truv order/report JSON payload becomes URLA field writes.
Used by POS's initial 'apply verification result' step and LOS's refresh step —
there is exactly one mapping implementation to keep correct.
"""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from .models import Asset, EmploymentRecord, FieldFillState, FillSource, Liability, UrlaFieldDefinition

_COMPUTED = "__computed__"


def _extract(source: dict | list, path: str):
    """Walk a dotted path (numeric segments index into lists) into a nested
    dict/list. Returns None on any missing key/index instead of raising —
    an unconfirmed truv_source_path should leave a field unfilled, not crash
    the apply step."""
    current = source
    for segment in path.split("."):
        if current is None:
            return None
        if segment.isdigit():
            index = int(segment)
            if not isinstance(current, list) or index >= len(current):
                return None
            current = current[index]
        else:
            if not isinstance(current, dict) or segment not in current:
                return None
            current = current[segment]
    return current


def _first_employer(order_response: dict) -> dict | None:
    employers = order_response.get("employers") or []
    return employers[0] if employers else None


def _first_employment(employer: dict | None) -> dict | None:
    if not employer:
        return None
    employments = employer.get("employments") or []
    return employments[0] if employments else None


def _to_decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


# Truv's `income_unit` on employments[].income — factor to convert to monthly.
# Confirmed against a real sandbox response: {"income": "56269.25", "income_unit": "YEARLY"}.
# HOURLY isn't convertible without a reliable hours/week figure, so it's left out (fails soft).
_INCOME_UNIT_MONTHLY_FACTOR = {
    "YEARLY": Decimal("1") / 12,
    "ANNUALLY": Decimal("1") / 12,
    "MONTHLY": Decimal("1"),
    "SEMIMONTHLY": Decimal("2"),
    "BIWEEKLY": Decimal("26") / 12,
    "WEEKLY": Decimal("52") / 12,
}

# Truv's `pay_frequency` on employments[] and per-statement figures — confirmed
# "BW" (biweekly) against a real sandbox response; other codes are Truv's
# documented conventions, not yet individually confirmed.
_PAY_FREQUENCY_MONTHLY_FACTOR = {
    "BW": Decimal("26") / 12,
    "BIWEEKLY": Decimal("26") / 12,
    "W": Decimal("52") / 12,
    "WEEKLY": Decimal("52") / 12,
    "SM": Decimal("2"),
    "SEMIMONTHLY": Decimal("2"),
    "M": Decimal("1"),
    "MONTHLY": Decimal("1"),
    "Y": Decimal("1") / 12,
    "YEARLY": Decimal("1") / 12,
    "ANNUALLY": Decimal("1") / 12,
}


def _compute_monthly_base(employer: dict, employment: dict | None):
    if not employment:
        return None
    income = _to_decimal(employment.get("income"))
    unit = (employment.get("income_unit") or "").upper()
    factor = _INCOME_UNIT_MONTHLY_FACTOR.get(unit)
    if income is not None and factor is not None:
        return round(income * factor, 2)

    pay_rate = _to_decimal(employment.get("pay_rate"))
    freq = (employment.get("pay_frequency") or "").upper()
    factor = _PAY_FREQUENCY_MONTHLY_FACTOR.get(freq)
    if pay_rate is not None and factor is not None:
        return round(pay_rate * factor, 2)
    return None


def _latest_statement(employment: dict | None) -> dict | None:
    if not employment:
        return None
    statements = employment.get("statements") or []
    if not statements:
        return None
    return sorted(statements, key=lambda s: s.get("pay_date") or "", reverse=True)[0]


def _compute_monthly_statement_amount(employer: dict, employment: dict | None, statement_field: str):
    """Overtime/bonus/commission live per-paystub in employments[].statements[],
    not on the employment object — confirmed against a real sandbox response
    (statements[].overtime was populated; employments[].income had no such
    breakdown at all). Monthlyized off the most recent statement using the
    employment's pay_frequency."""
    statement = _latest_statement(employment)
    if statement is None:
        return None
    value = _to_decimal(statement.get(statement_field))
    if value is None:
        return None
    freq = (employment.get("pay_frequency") or "").upper()
    factor = _PAY_FREQUENCY_MONTHLY_FACTOR.get(freq)
    return round(value * factor, 2) if factor is not None else None


def _employer_name(employer: dict, employment: dict | None) -> str | None:
    """Some payroll providers (e.g. ADP, confirmed via a real combined
    income+assets order) leave the order's top-level employer.company_name
    null and only populate the company name nested under
    employments[].company.name — the same shape variance
    _compute_employer_address already falls back for. Without this fallback,
    apply_truv_data would try to create an EmploymentRecord with
    employer_name=None, which violates the DB's NOT NULL constraint on that
    column and crashes the apply step after Truv verification succeeds.
    Returns None (not "") when neither source has a name, so this can double
    as a _COMPUTED_EXTRACTORS entry — the definition loop's `unmatched`
    bookkeeping depends on None meaning "nothing found"."""
    if employer.get("company_name"):
        return employer["company_name"]
    company = (employment or {}).get("company") or {}
    return company.get("name") or None


def _compute_employer_address(employer: dict, employment: dict | None):
    if employer.get("company_address"):
        return employer["company_address"]
    company = (employment or {}).get("company") or {}
    address = company.get("address") or {}
    parts = [address.get("street"), address.get("city"), address.get("state"), address.get("zip")]
    joined = ", ".join(p for p in parts if p)
    return joined or None


# field_key -> function(employer_source, employment_source) -> value | None
_COMPUTED_EXTRACTORS = {
    "employment.employer_name": _employer_name,
    "employment.employer_address": _compute_employer_address,
    "employment.monthly_income_base": _compute_monthly_base,
    "employment.monthly_income_overtime": lambda e, emp: _compute_monthly_statement_amount(e, emp, "overtime"),
    "employment.monthly_income_bonus": lambda e, emp: _compute_monthly_statement_amount(e, emp, "bonus"),
    "employment.monthly_income_commission": lambda e, emp: _compute_monthly_statement_amount(e, emp, "commission"),
}


# Truv's assets `type` per account (confirmed against a real sandbox response:
# CHECKING/SAVINGS/INVESTMENT) — our model's choices are checking/savings/
# retirement/other. INVESTMENT could be a brokerage or a retirement account;
# Truv doesn't disambiguate in `type` (a `subtype` field exists but was null
# in the confirmed response), so it lands in "other" rather than guessing.
_ACCOUNT_TYPE_MAP = {
    "CHECKING": "checking",
    "SAVINGS": "savings",
    "MONEY_MARKET": "savings",
    "CD": "savings",
    "RETIREMENT": "retirement",
    "INVESTMENT": "other",
    "LOAN": "other",
    "CREDIT_CARD": "other",
}


def _map_account_type(raw_type: str | None) -> str:
    return _ACCOUNT_TYPE_MAP.get((raw_type or "").upper(), "other")


def _apply_assets(loan_application, borrower, financial_accounts: list, truv_order_id: str, force: bool) -> dict:
    """Assets don't fit the generic single-record-per-borrower loop below:
    Truv's real response (confirmed against a live sandbox order) nests
    multiple accounts under a single connected institution — one order
    returned checking + investment + savings all under one Chase Bank
    connection — so this creates one Asset row per account, across every
    connected institution, instead of collapsing everything into one record."""
    applied, skipped_manual, unmatched = [], [], []
    definitions = {d.field_key: d for d in UrlaFieldDefinition.objects.filter(truv_fillable=True, model_name="Asset")}

    accounts_seen = False
    for institution in financial_accounts or []:
        institution_name = (institution.get("provider") or {}).get("name", "")
        for account in institution.get("accounts") or []:
            accounts_seen = True
            mask = account.get("mask", "")
            # Not a plain get_or_create: nothing enforces uniqueness on this
            # tuple at the DB level, and a webhook delivery racing the
            # explicit "apply" call for the same order can create more than
            # one matching row — get_or_create's SELECT-then-INSERT isn't
            # atomic without a backing constraint, and get() throws
            # MultipleObjectsReturned the moment a duplicate exists. Take the
            # oldest match instead so a pre-existing duplicate never turns a
            # routine apply into a 500.
            asset_record = Asset.objects.filter(
                borrower=borrower, financial_institution_name=institution_name, account_number_masked=mask,
            ).order_by("id").first()
            if asset_record is None:
                asset_record = Asset(
                    borrower=borrower, financial_institution_name=institution_name, account_number_masked=mask,
                )
            values = {
                "financial_institution_name": institution_name,
                "account_number_masked": mask,
                "account_type": _map_account_type(account.get("type")),
                "cash_or_market_value": _to_decimal(account.get("balance")),
            }
            for field_key, definition in definitions.items():
                attr = field_key.split(".", 1)[1]
                value = values.get(attr)
                if value is None:
                    if field_key not in unmatched:
                        unmatched.append(field_key)
                    continue
                fill_state, _ = FieldFillState.objects.get_or_create(
                    loan_application=loan_application, field_definition=definition, borrower=borrower,
                )
                if fill_state.fill_source in (FillSource.MANUAL, FillSource.LOS_OVERRIDE) and not force:
                    if field_key not in skipped_manual:
                        skipped_manual.append(field_key)
                    continue
                setattr(asset_record, attr, value)
                fill_state.fill_source = FillSource.TRUV_AUTO
                fill_state.filled_at = datetime.now(timezone.utc)
                fill_state.truv_order_id = truv_order_id
                fill_state.save()
                if field_key not in applied:
                    applied.append(field_key)
            asset_record.save()

    if not accounts_seen:
        unmatched.extend(definitions.keys())

    return {"applied": applied, "skipped_manual": skipped_manual, "unmatched": unmatched}


# Truv's liabilities `accounts[].type` (+ `.subtype` for LOAN) -> our
# revolving/installment/mortgage/heloc/other. Confirmed enum values via
# docs.truv.com/api-reference/liabilities/link_liabilities.
def _map_liability_type(account_type: str | None, subtype: str | None) -> str:
    account_type = (account_type or "").upper()
    subtype = (subtype or "").upper() if subtype else ""
    if account_type in ("CREDIT_CARD", "LINE_OF_CREDIT"):
        return "revolving"
    if account_type == "MORTGAGE":
        return "mortgage"
    if account_type == "CHECKING_LINE_OF_CREDIT":
        return "heloc"
    if account_type == "LOAN":
        return "heloc" if subtype in ("HELOC", "HOME_EQUITY") else "installment"
    return "other"


def _iter_liability_values(financial_accounts: list):
    """Shared walk of every liability entry across every connected
    institution — used by both `_apply_liabilities` (writes to the DB) and
    `summarize_for_underwriting` (read-only display), so the two can never
    drift apart on what counts as a liability or how it's valued.

    Yields one values dict per liability entry: creditor_name, liability_type,
    account_number_masked, monthly_payment, unpaid_balance, credit_limit,
    interest_rate (the last two are naturally None for the "wrong" kind —
    credit cards don't have an interest_rate here, loans don't have a
    credit_limit). Truv doesn't expose a card/loan issuer name distinct from
    the connected institution, so creditor_name falls back to the
    connection's own provider name (e.g. "Chase Bank") when the account has
    no `nickname`."""
    for institution in financial_accounts or []:
        liabilities_data = institution.get("liabilities_data")
        if not liabilities_data:
            continue
        institution_name = (institution.get("provider") or {}).get("name", "")
        accounts_by_id = {a.get("id"): a for a in liabilities_data.get("accounts") or []}
        liabilities = liabilities_data.get("liabilities") or {}

        combined_entries = [(entry, "credit") for entry in liabilities.get("credit") or []]
        combined_entries += [(entry, "loan") for entry in liabilities.get("loans") or []]

        for entry, kind in combined_entries:
            account = accounts_by_id.get(entry.get("account_id")) or {}
            mask = account.get("mask", "")
            creditor_name = account.get("nickname") or institution_name
            liability_type = _map_liability_type(account.get("type"), account.get("subtype"))
            if kind == "credit":
                yield {
                    "creditor_name": creditor_name,
                    "liability_type": liability_type,
                    "account_number_masked": mask,
                    "monthly_payment": _to_decimal(entry.get("minimum_payment_amount") or entry.get("next_payment_amount")),
                    "unpaid_balance": _to_decimal(entry.get("current_balance")),
                    "credit_limit": _to_decimal(entry.get("credit_line")),
                    "interest_rate": None,
                }
            else:
                yield {
                    "creditor_name": creditor_name,
                    "liability_type": liability_type,
                    "account_number_masked": mask,
                    "monthly_payment": _to_decimal(entry.get("next_payment_amount") or entry.get("last_payment_amount")),
                    "unpaid_balance": _to_decimal(entry.get("principal_balance")),
                    "credit_limit": None,
                    "interest_rate": _to_decimal(entry.get("interest_rate")),
                }


def _apply_liabilities(loan_application, borrower, financial_accounts: list, truv_order_id: str, force: bool) -> dict:
    """Liabilities aren't a standalone Orders product — each entry in
    `financial_accounts` may carry a `liabilities_data` key (attached by the
    caller after a separate `GET /v1/links/{link_id}/liabilities/` call, see
    pos/verification/views.py). See `_iter_liability_values` for the actual
    cross-referencing of accounts[] against liabilities.credit[]/loans[]."""
    applied, skipped_manual, unmatched = [], [], []
    definitions = {d.field_key: d for d in UrlaFieldDefinition.objects.filter(truv_fillable=True, model_name="Liability")}

    entries_seen = False
    for values in _iter_liability_values(financial_accounts):
        entries_seen = True
        # Same non-atomic-lookup hazard as _apply_assets above — take the
        # oldest match rather than get_or_create, so an existing duplicate
        # can't turn this apply into a crash.
        liability_record = Liability.objects.filter(
            borrower=borrower, creditor_name=values["creditor_name"],
            account_number_masked=values["account_number_masked"],
        ).order_by("id").first()
        if liability_record is None:
            liability_record = Liability(
                borrower=borrower, creditor_name=values["creditor_name"],
                account_number_masked=values["account_number_masked"],
            )
        for field_key, definition in definitions.items():
            attr = field_key.split(".", 1)[1]
            value = values.get(attr)
            if value is None:
                if field_key not in unmatched:
                    unmatched.append(field_key)
                continue
            fill_state, _ = FieldFillState.objects.get_or_create(
                loan_application=loan_application, field_definition=definition, borrower=borrower,
            )
            if fill_state.fill_source in (FillSource.MANUAL, FillSource.LOS_OVERRIDE) and not force:
                if field_key not in skipped_manual:
                    skipped_manual.append(field_key)
                continue
            setattr(liability_record, attr, value)
            fill_state.fill_source = FillSource.TRUV_AUTO
            fill_state.filled_at = datetime.now(timezone.utc)
            fill_state.truv_order_id = truv_order_id
            fill_state.save()
            if field_key not in applied:
                applied.append(field_key)
        liability_record.save()

    if not entries_seen:
        unmatched.extend(definitions.keys())

    return {"applied": applied, "skipped_manual": skipped_manual, "unmatched": unmatched}


def apply_truv_data(loan_application, borrower, order_response: dict, truv_order_id: str, force: bool = False) -> dict:
    """Writes every truv_fillable UrlaFieldDefinition it can extract a value
    for from `order_response` onto `borrower`'s URLA records, and upserts the
    matching FieldFillState. Never overwrites a MANUAL/LOS_OVERRIDE field
    unless force=True. Returns a summary dict for the caller to surface in
    the API response.

    Employment fits a simple single-record-per-borrower loop (one employer,
    one current employment). Assets and Liabilities do not — see
    `_apply_assets` and `_apply_liabilities`. Liabilities only populates
    anything if the caller has already attached a `liabilities_data` key onto
    the relevant `financial_accounts[]` entries (see pos/verification/views.py) —
    it's a separate API call Truv requires per link_id, not part of this response."""

    employer_source = _first_employer(order_response)
    employment_source = _first_employment(employer_source)

    employment_record = None
    applied, skipped_manual, unmatched = [], [], []

    for definition in UrlaFieldDefinition.objects.filter(truv_fillable=True, model_name="EmploymentRecord"):
        if employer_source is None:
            unmatched.append(definition.field_key)
            continue

        if definition.truv_source_path == _COMPUTED:
            extractor = _COMPUTED_EXTRACTORS.get(definition.field_key)
            value = extractor(employer_source, employment_source) if extractor else None
        else:
            value = _extract(employer_source, definition.truv_source_path)
        if value is None:
            unmatched.append(definition.field_key)
            continue

        fill_state, _ = FieldFillState.objects.get_or_create(
            loan_application=loan_application, field_definition=definition, borrower=borrower,
        )
        if fill_state.fill_source in (FillSource.MANUAL, FillSource.LOS_OVERRIDE) and not force:
            skipped_manual.append(definition.field_key)
            continue

        if employment_record is None:
            employment_record, _ = EmploymentRecord.objects.get_or_create(
                borrower=borrower, employer_name=_employer_name(employer_source, employment_source) or "",
            )
        attr = definition.field_key.split(".", 1)[1]
        setattr(employment_record, attr, value)

        fill_state.fill_source = FillSource.TRUV_AUTO
        fill_state.filled_at = datetime.now(timezone.utc)
        fill_state.truv_order_id = truv_order_id
        fill_state.save()
        applied.append(definition.field_key)

    if employment_record is not None:
        employment_record.save()

    financial_accounts = order_response.get("financial_accounts") or []

    asset_summary = _apply_assets(loan_application, borrower, financial_accounts, truv_order_id, force)
    applied += asset_summary["applied"]
    skipped_manual += asset_summary["skipped_manual"]
    unmatched += asset_summary["unmatched"]

    liability_summary = _apply_liabilities(loan_application, borrower, financial_accounts, truv_order_id, force)
    applied += liability_summary["applied"]
    skipped_manual += liability_summary["skipped_manual"]
    unmatched += liability_summary["unmatched"]

    return {
        "applied": applied,
        "skipped_manual": skipped_manual,
        "unmatched": unmatched,
        "truv_order_id": truv_order_id,
    }


def summarize_for_underwriting(order_response: dict) -> dict:
    """Read-only presentational summary of a Truv order response — this is
    what LOS's underwriting-support view should call instead of re-deriving
    its own extraction logic (a prior version of that view hand-rolled its
    own field paths and drifted out of sync with reality; this reuses the
    exact same helpers apply_truv_data uses, so the two can't disagree again).

    Unlike apply_truv_data (which only touches the first employer/institution
    to match our single-employer URLA model), this summarizes every employer
    and institution in the response — more informative for underwriting review."""
    employment, income, assets = [], [], []

    for employer in order_response.get("employers") or []:
        for emp in employer.get("employments") or []:
            employer_name = _employer_name(employer, emp) or ""
            employment.append({
                "employer_name": employer_name,
                "title": emp.get("job_title", ""),
                "start_date": emp.get("start_date"),
            })
            income.append({
                "employer_name": employer_name,
                "base_pay": _compute_monthly_base(employer, emp),
                "overtime": _compute_monthly_statement_amount(employer, emp, "overtime"),
                "bonus": _compute_monthly_statement_amount(employer, emp, "bonus"),
                "commission": _compute_monthly_statement_amount(employer, emp, "commission"),
                "pay_frequency": emp.get("pay_frequency", ""),
            })

    for institution in order_response.get("financial_accounts") or []:
        institution_name = (institution.get("provider") or {}).get("name", "")
        for account in institution.get("accounts") or []:
            assets.append({
                "financial_institution_name": institution_name,
                "account_type": _map_account_type(account.get("type")),
                "balance": _to_decimal(account.get("balance")),
                "account_number_masked": account.get("mask", ""),
            })

    financial_accounts = order_response.get("financial_accounts") or []
    liabilities = list(_iter_liability_values(financial_accounts))

    return {"employment": employment, "income": income, "assets": assets, "liabilities": liabilities}


def coverage_summary(loan_application) -> dict:
    total_fillable = UrlaFieldDefinition.objects.filter(truv_fillable=True).count()
    total_fields = UrlaFieldDefinition.objects.count()
    auto_filled = FieldFillState.objects.filter(
        loan_application=loan_application, fill_source=FillSource.TRUV_AUTO,
    ).values("field_definition_id").distinct().count()
    manual_filled = FieldFillState.objects.filter(
        loan_application=loan_application,
    ).exclude(fill_source=FillSource.UNFILLED).values("field_definition_id").distinct().count()

    by_section = {}
    for definition in UrlaFieldDefinition.objects.all():
        bucket = by_section.setdefault(definition.section, {"total": 0, "truv_fillable": 0, "auto_filled": 0})
        bucket["total"] += 1
        if definition.truv_fillable:
            bucket["truv_fillable"] += 1

    for state in FieldFillState.objects.filter(loan_application=loan_application, fill_source=FillSource.TRUV_AUTO):
        by_section[state.field_definition.section]["auto_filled"] += 1

    return {
        "total_fields": total_fields,
        "total_fillable_by_truv": total_fillable,
        "auto_filled_count": auto_filled,
        "manual_or_overridden_count": manual_filled,
        "by_section": by_section,
    }
