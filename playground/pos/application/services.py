"""Whenever a human PATCHes a URLA field through the wizard (as opposed to
urla.mapping.apply_truv_data writing it from a Truv order), the touched field's
FieldFillState must flip to MANUAL — this is what lets the coverage screen
correctly count 'auto-filled' vs 'you had to type this yourself'."""
from django.utils import timezone

from urla.models import FieldFillState, FillSource, UrlaFieldDefinition


def mark_manual_fill(loan_application, borrower, model_name: str, changed_attrs: list[str], instance=None, old_values: dict = None):
    """`old_values` (captured from `instance` right before `serializer.save()`)
    lets this skip fields whose value didn't actually change — without it, any
    PATCH that merely re-submits a record's current values (e.g. clicking Save
    on a record after nothing but an unrelated field was touched) would
    silently downgrade every already-Truv-verified field on that record to
    MANUAL, discarding real fill-source provenance for a no-op edit. Pass both
    to get the comparison; omit them to always mark (used for brand-new rows,
    where there's no prior value to compare against)."""
    definitions = UrlaFieldDefinition.objects.filter(
        model_name=model_name,
        field_key__in=[f"{_prefix(model_name)}.{attr}" for attr in changed_attrs],
    )
    for definition in definitions:
        attr = definition.field_key.split(".", 1)[1]
        if instance is not None and old_values is not None and getattr(instance, attr, None) == old_values.get(attr):
            continue
        fill_state, _ = FieldFillState.objects.get_or_create(
            loan_application=loan_application, field_definition=definition, borrower=borrower,
        )
        # A borrower/loan-officer edit in POS always wins over a prior Truv
        # auto-fill. (LOS_OVERRIDE is reserved for the LOS underwriter-correction
        # flow, not used here.)
        fill_state.fill_source = FillSource.MANUAL
        fill_state.filled_at = timezone.now()
        fill_state.save()


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


def _prefix(model_name: str) -> str:
    return _MODEL_PREFIX.get(model_name, model_name.lower())
