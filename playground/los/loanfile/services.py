from django.utils import timezone

from urla.models import FieldFillState, UrlaFieldDefinition

_MODEL_PREFIX = {
    "Borrower": "borrower",
    "EmploymentRecord": "employment",
    "OtherIncomeSource": "employment",
    "Asset": "assets",
    "Liability": "liability",
    "RealEstateOwned": "reo",
    "LoanAndProperty": "loan_property",
    "Declaration": "declaration",
    "DemographicInfo": "demographic",
}


def mark_los_override(loan_application, borrower, model_name: str, changed_attrs: list[str]):
    """LOS's counterpart to pos/application/services.py::mark_manual_fill —
    an underwriter correction in LOS always lands as LOS_OVERRIDE, distinct
    from a POS borrower/loan-officer edit (MANUAL), so the coverage screen
    can tell the two apart."""
    prefix = _MODEL_PREFIX.get(model_name, model_name.lower())
    definitions = UrlaFieldDefinition.objects.filter(
        model_name=model_name,
        field_key__in=[f"{prefix}.{attr}" for attr in changed_attrs],
    )
    for definition in definitions:
        fill_state, _ = FieldFillState.objects.get_or_create(
            loan_application=loan_application, field_definition=definition, borrower=borrower,
        )
        fill_state.fill_source = "los_override"
        fill_state.filled_at = timezone.now()
        fill_state.save()
