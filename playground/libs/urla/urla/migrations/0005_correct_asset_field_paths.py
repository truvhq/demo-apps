from django.db import migrations

from urla.catalog import FIELD_DEFINITIONS


def update_field_definitions(apps, schema_editor):
    """Same re-seed pattern as 0004 — pushes catalog.py's corrected Assets
    field mappings (financial_accounts/provider.name/type/mask/balance,
    confirmed against a real sandbox order) onto already-seeded rows."""
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
        ("urla", "0004_correct_employment_field_paths"),
    ]

    operations = [
        migrations.RunPython(update_field_definitions, noop_reverse),
    ]
