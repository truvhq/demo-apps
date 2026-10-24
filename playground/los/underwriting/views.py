from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from urla.models import Asset, EmploymentRecord, FieldFillState, FillSource, Liability, LoanApplication

from .models import UnderwritingDecision
from .serializers import UnderwritingDecisionSerializer


def _truv_verified_summary(application):
    """Builds the same {employment, income, assets, liabilities} shape
    summarize_for_underwriting used to produce, but sourced from the applied
    URLA record (EmploymentRecord/Asset/Liability) instead of a single raw
    VerificationSnapshot. That raw-snapshot approach silently went blank for
    any section verified only in POS and never independently re-pulled by a
    LOS-side refresh (LOS never stores a VerificationSnapshot for an order it
    didn't itself call get_order() on) — the ORM rows are the only place data
    from every order, POS-side or LOS-side, actually accumulates.

    FieldFillState is tracked per (borrower, field_key) — not per individual
    Asset/Liability row — so "is this borrower's asset data Truv-verified" is
    a borrower-level question: if any of a borrower's asset fields are
    currently truv_auto, every Asset row for that borrower is included.
    Gating on truv_auto specifically (not manual/los_override) is what keeps
    this honestly showing only what Truv currently backs — a value a
    processor has since hand-corrected no longer counts as "reported by Truv"."""
    def verified_borrower_ids(prefix):
        return set(
            FieldFillState.objects.filter(
                loan_application=application, fill_source=FillSource.TRUV_AUTO,
                field_definition__field_key__startswith=prefix,
            ).values_list("borrower_id", flat=True)
        )

    employment_ids = verified_borrower_ids("employment.")
    asset_ids = verified_borrower_ids("assets.")
    liability_ids = verified_borrower_ids("liability.")

    employment, income = [], []
    for e in EmploymentRecord.objects.filter(borrower__loan_application=application, borrower_id__in=employment_ids):
        employment.append({"employer_name": e.employer_name, "title": e.position_title, "start_date": e.start_date})
        income.append({
            "employer_name": e.employer_name, "base_pay": e.monthly_income_base,
            "overtime": e.monthly_income_overtime, "bonus": e.monthly_income_bonus,
            "commission": e.monthly_income_commission, "pay_frequency": "",
        })

    assets = [
        {
            "financial_institution_name": a.financial_institution_name, "account_type": a.account_type,
            "balance": a.cash_or_market_value, "account_number_masked": a.account_number_masked,
        }
        for a in Asset.objects.filter(borrower__loan_application=application, borrower_id__in=asset_ids)
    ]
    liabilities = [
        {
            "creditor_name": l.creditor_name, "liability_type": l.liability_type,
            "account_number_masked": l.account_number_masked, "monthly_payment": l.monthly_payment,
            "unpaid_balance": l.unpaid_balance, "credit_limit": l.credit_limit, "interest_rate": l.interest_rate,
        }
        for l in Liability.objects.filter(borrower__loan_application=application, borrower_id__in=liability_ids)
    ]

    latest_filled_at = FieldFillState.objects.filter(
        loan_application=application, fill_source=FillSource.TRUV_AUTO,
    ).order_by("-filled_at").values_list("filled_at", flat=True).first()

    return {"employment": employment, "income": income, "assets": assets, "liabilities": liabilities}, latest_filled_at


def _sum_decimal(values):
    total = Decimal("0")
    for v in values:
        if v is None:
            continue
        try:
            total += Decimal(str(v))
        except InvalidOperation:
            continue
    return total


def _monthly_pi_payment(loan_amount, note_rate, term_months):
    """Standard amortization formula. Returns None if any required input is
    missing, rather than pretending a $0/mo payment is meaningful."""
    if loan_amount is None or note_rate is None or not term_months:
        return None
    principal = Decimal(str(loan_amount))
    monthly_rate = Decimal(str(note_rate)) / Decimal("100") / Decimal("12")
    n = int(term_months)
    if monthly_rate == 0:
        return principal / n
    factor = (1 + monthly_rate) ** n
    return principal * monthly_rate * factor / (factor - 1)


@api_view(["GET"])
def underwriting_support(request, application_id):
    """Formats live from the applied URLA record's Truv-verified fields (see
    _truv_verified_summary) — never a separate summary table that could drift
    out of sync with the last refresh. If nothing has been Truv-verified yet,
    returns an honestly-empty structure rather than fabricating figures."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    summary, latest_filled_at = _truv_verified_summary(application)

    if not any(summary.values()):
        return Response({
            "income": [], "employment": [], "assets": [], "liabilities": [],
            "based_on_order_id": None, "generated_at": None,
            "note": "No Truv verification has been pulled for this loan file yet.",
        })

    return Response({
        **summary,
        "based_on_order_id": application.last_truv_order_id,
        "generated_at": latest_filled_at,
    })


@api_view(["GET"])
def underwriting_calculator(request, application_id):
    """DTI/LTV/payment for the LO/Processor. Gross monthly income and monthly
    debt are read from the applied URLA record (EmploymentRecord/Liability
    rows across all borrowers) rather than a single VerificationSnapshot: a
    loan file's employment and assets/liabilities are frequently verified via
    separate Truv orders (per-step verification), so the *latest* snapshot
    alone often reflects only one of those orders. The ORM rows accumulate
    across every order that's ever been applied, so they're the only reliable
    source for a DTI calc — and they also correctly reflect any manual/
    LOS-override correction a processor has since made, which is exactly what
    a DTI calc should use. This is intentionally NOT a full front-end ratio
    (no taxes/insurance/HOA data exists in this simulator), so it's labeled
    "P&I only" rather than implying a real front-end ratio."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    loan_property = getattr(application, "loan_property", None)

    loan_amount = loan_property.loan_amount if loan_property else None
    property_value = loan_property.estimated_property_value if loan_property else None
    note_rate = loan_property.note_rate if loan_property else None
    term_months = loan_property.loan_term_months if loan_property else None

    ltv = None
    if loan_amount is not None and property_value:
        ltv = float(Decimal(str(loan_amount)) / Decimal(str(property_value)) * 100)

    pi_payment = _monthly_pi_payment(loan_amount, note_rate, term_months)

    employment_records = EmploymentRecord.objects.filter(borrower__loan_application=application)
    gross_monthly_income = _sum_decimal(
        (e.monthly_income_base or 0) + (e.monthly_income_overtime or 0)
        + (e.monthly_income_bonus or 0) + (e.monthly_income_commission or 0)
        for e in employment_records
    )
    liabilities = Liability.objects.filter(borrower__loan_application=application, to_be_paid_at_closing=False)
    total_monthly_debt = _sum_decimal(l.monthly_payment for l in liabilities)

    front_end_dti = None
    back_end_dti = None
    if gross_monthly_income > 0 and pi_payment is not None:
        front_end_dti = float(pi_payment / gross_monthly_income * 100)
        back_end_dti = float((pi_payment + total_monthly_debt) / gross_monthly_income * 100)

    return Response({
        "loan_amount": loan_amount,
        "estimated_property_value": property_value,
        "note_rate": note_rate,
        "loan_term_months": term_months,
        "loan_program": loan_property.loan_program if loan_property else "",
        "ltv_pct": ltv,
        "monthly_pi_payment": pi_payment,
        "gross_monthly_income": gross_monthly_income,
        "total_monthly_debt": total_monthly_debt,
        "front_end_dti_pct": front_end_dti,
        "back_end_dti_pct": back_end_dti,
        "note": "Front/back ratios use P&I only — no taxes, insurance, or HOA data is modeled in this simulator.",
    })


@api_view(["GET", "POST"])
def underwriting_decision(request, application_id):
    """GET returns the current approve/reject call (or null if none yet).
    POST records a new one and freezes the current merged Truv summary as the
    baseline a later Closing-tab re-verification will diff against — approving
    again (e.g. after a refresh) simply overwrites the prior decision/baseline,
    same as a real underwriter re-signing off on updated data."""
    application = get_object_or_404(LoanApplication, pk=application_id)

    if request.method == "GET":
        decision = UnderwritingDecision.objects.filter(loan_application=application).first()
        if decision is None:
            return Response(None)
        return Response(UnderwritingDecisionSerializer(decision).data)

    choice = request.data.get("decision")
    if choice not in UnderwritingDecision.Decision.values:
        return Response({"error": f"decision must be one of {UnderwritingDecision.Decision.values}"}, status=400)

    summary, _ = _truv_verified_summary(application)

    decision, _ = UnderwritingDecision.objects.update_or_create(
        loan_application=application,
        defaults={
            "decision": choice,
            "notes": request.data.get("notes", ""),
            "decided_by": request.data.get("decided_by", ""),
            "approved_summary": summary,
        },
    )
    return Response(UnderwritingDecisionSerializer(decision).data)


_DIFF_FIELDS = {
    "employment": ["title", "start_date"],
    "income": ["base_pay", "overtime", "bonus", "commission", "pay_frequency"],
    "assets": ["account_type", "balance"],
    "liabilities": ["liability_type", "monthly_payment", "unpaid_balance", "credit_limit", "interest_rate"],
}


def _entry_key(category, item):
    if category in ("employment", "income"):
        return item.get("employer_name")
    return item.get("account_number_masked")


def _normalize(value):
    """approved_summary round-trips through a JSONField (Decimal -> string,
    date -> ISO string via DjangoJSONEncoder), while current_summary is built
    fresh from live ORM objects (Decimal, date) each request — without this,
    a numeric/date field that hasn't actually changed would still compare
    unequal purely due to type, and get flagged as a false mismatch."""
    if isinstance(value, (int, float, Decimal)):
        return round(float(value), 2)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, str):
        try:
            return round(float(value), 2)
        except ValueError:
            return value
    return value


def _diff_category(category, approved_list, current_list):
    approved_by_key = {_entry_key(category, i): i for i in approved_list}
    current_by_key = {_entry_key(category, i): i for i in current_list}
    entries = []
    for key in sorted(set(approved_by_key) | set(current_by_key), key=lambda k: (k is None, k)):
        approved, current = approved_by_key.get(key), current_by_key.get(key)
        if approved and not current:
            entries.append({"key": key, "status": "removed", "approved": approved, "current": None, "changed_fields": []})
        elif current and not approved:
            entries.append({"key": key, "status": "new", "approved": None, "current": current, "changed_fields": []})
        else:
            changed = [f for f in _DIFF_FIELDS[category] if _normalize(approved.get(f)) != _normalize(current.get(f))]
            entries.append({
                "key": key, "status": "changed" if changed else "match",
                "approved": approved, "current": current, "changed_fields": changed,
            })
    return entries


@api_view(["GET"])
def closing_verification(request, application_id):
    """The pre-close re-verification step: diffs the CURRENT merged Truv data
    against the frozen snapshot from underwriting approval, per employer/
    account/liability, so a processor can see at a glance whether anything
    a borrower was approved on has since changed (new job, drained account,
    new debt) before clear-to-close — the same purpose a real VOE/VOA
    "still holds at closing" recheck serves."""
    application = get_object_or_404(LoanApplication, pk=application_id)
    decision = UnderwritingDecision.objects.filter(loan_application=application).first()

    if decision is None or decision.decision != UnderwritingDecision.Decision.APPROVED:
        return Response({"error": "This loan file has not been approved on the Underwriting Support Data tab yet."}, status=400)

    current_summary, latest_filled_at = _truv_verified_summary(application)
    approved_summary = decision.approved_summary or {"employment": [], "income": [], "assets": [], "liabilities": []}

    diff = {category: _diff_category(category, approved_summary.get(category, []), current_summary.get(category, []))
            for category in _DIFF_FIELDS}
    overall_status = "match"
    for entries in diff.values():
        if any(e["status"] != "match" for e in entries):
            overall_status = "mismatch"
            break

    return Response({
        "diff": diff,
        "overall_status": overall_status,
        "approved_at": decision.decided_at,
        "current_based_on_order_id": application.last_truv_order_id,
        "current_generated_at": latest_filled_at,
    })
