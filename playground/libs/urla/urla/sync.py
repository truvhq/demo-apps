"""Ingests the LoanFilePayloadSerializer-shaped dict sent across the POS<->LOS
sync boundary (POS -> LOS on submit, LOS -> POS on refresh push-back — same
shape, same ingest logic, both directions). Deliberately NOT a DRF nested-
writable-serializer — matching a deeply nested graph across two independent
databases with their own primary keys is simpler as plain upsert code than
fighting DRF's nested-write machinery.

Borrowers are matched across systems by `borrower_type` (primary/co_borrower),
the one identity that's stable whether you're looking at POS's copy or LOS's
copy of the same loan — see the borrower_type field on FieldFillStateSerializer.
"""
import logging

from django.db import transaction
from django.utils import timezone

from .models import (
    Asset, Borrower, Declaration, DemographicInfo, EmploymentRecord, FieldFillState,
    Liability, LoanAndProperty, LoanApplication, OtherIncomeSource, RealEstateOwned,
    UrlaFieldDefinition,
)

logger = logging.getLogger(__name__)

_SIMPLE_SECTION_MODELS = {
    "employment_records": EmploymentRecord,
    "other_income": OtherIncomeSource,
    "assets": Asset,
    "liabilities": Liability,
    "real_estate_owned": RealEstateOwned,
}

_STRIP_KEYS = {"id", "borrower", "loan_application"}


def _clean(data: dict) -> dict:
    return {k: v for k, v in data.items() if k not in _STRIP_KEYS}


@transaction.atomic
def ingest_loan_file(payload: dict) -> LoanApplication:
    application, _ = LoanApplication.objects.update_or_create(
        loan_uuid=payload["loan_uuid"],
        defaults={
            "loan_number": payload["loan_number"],
            "application_number": payload.get("application_number", ""),
            "status": payload.get("status", "submitted_to_los"),
            "last_truv_order_id": payload.get("last_truv_order_id", ""),
            "last_synced_at": timezone.now(),
        },
    )

    loan_property_data = payload.get("loan_property") or {}
    if loan_property_data:
        LoanAndProperty.objects.update_or_create(
            loan_application=application, defaults=_clean(loan_property_data),
        )

    borrower_by_type = {}
    for b_data in payload.get("borrowers", []):
        borrower_fields = {k: v for k, v in b_data.items() if k not in _SIMPLE_SECTION_MODELS and k not in ("id", "declaration", "demographic_info")}
        borrower, _ = Borrower.objects.update_or_create(
            loan_application=application,
            borrower_type=b_data["borrower_type"],
            defaults=_clean(borrower_fields),
        )
        borrower_by_type[b_data["borrower_type"]] = borrower

        # Replace-all for list sections — simplest correct approach when the
        # sender's row identities don't (and shouldn't need to) mean anything here.
        for section_key, model in _SIMPLE_SECTION_MODELS.items():
            model.objects.filter(borrower=borrower).delete()
            for row in b_data.get(section_key, []):
                model.objects.create(borrower=borrower, **_clean(row))

        if b_data.get("declaration"):
            Declaration.objects.update_or_create(borrower=borrower, defaults=_clean(b_data["declaration"]))
        if b_data.get("demographic_info"):
            DemographicInfo.objects.update_or_create(borrower=borrower, defaults=_clean(b_data["demographic_info"]))

    for fs_data in payload.get("field_fill_states", []):
        field_definition = UrlaFieldDefinition.objects.filter(field_key=fs_data["field_key"]).first()
        if field_definition is None:
            continue
        borrower = borrower_by_type.get(fs_data.get("borrower_type")) if fs_data.get("borrower_type") else None
        FieldFillState.objects.update_or_create(
            loan_application=application, field_definition=field_definition, borrower=borrower,
            defaults={
                "fill_source": fs_data.get("fill_source", "unfilled"),
                "filled_at": fs_data.get("filled_at"),
                "truv_order_id": fs_data.get("truv_order_id", ""),
            },
        )

    logger.info("Ingested loan file %s (%s) from sync push", application.loan_number, application.loan_uuid)
    return application
