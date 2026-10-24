from django.db import migrations

from urla.catalog import FIELD_DEFINITIONS


def update_field_definitions(apps, schema_editor):
    """Re-applies catalog.py's current values onto already-seeded rows —
    0002's seed only runs once, so correcting truv_source_path/truv_fillable
    in catalog.py needs a fresh migration to actually reach existing DBs.
    Same update_or_create as 0002, safe to run again.

    This one corrects employment.employer_name from a direct "company_name"
    path to "__computed__": some payroll providers (e.g. ADP, confirmed via a
    real combined income+assets order) leave the order's top-level
    employer.company_name null and only populate it nested under
    employments[].company.name. A direct path lookup returned None for that
    shape, which crashed apply_truv_data with a NOT NULL constraint failure on
    EmploymentRecord.employer_name — see urla.mapping._employer_name."""
    UrlaFieldDefinition = apps.get_model("urla", "UrlaFieldDefinition")
    for definition in FIELD_DEFINITIONS:
        UrlaFieldDefinition.objects.update_or_create(
            field_key=definition["field_key"],
            defaults={k: v for k, v in definition.items() if k != "field_key"},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("urla", "0008_loanandproperty_loan_program_and_more"),
    ]

    operations = [
        migrations.RunPython(update_field_definitions, noop_reverse),
    ]
