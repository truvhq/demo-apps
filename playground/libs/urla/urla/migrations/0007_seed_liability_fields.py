from django.db import migrations

from urla.catalog import FIELD_DEFINITIONS


def update_field_definitions(apps, schema_editor):
    """Same re-seed pattern as 0004/0005 — pushes catalog.py's new
    Liabilities field mappings (GET /v1/links/{link_id}/liabilities/,
    confirmed against real docs) onto already-seeded rows."""
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
        ("urla", "0006_liability_account_number_masked_and_more"),
    ]

    operations = [
        migrations.RunPython(update_field_definitions, noop_reverse),
    ]
