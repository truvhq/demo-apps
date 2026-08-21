from django.db import migrations

from urla.catalog import FIELD_DEFINITIONS


def update_field_definitions(apps, schema_editor):
    """Re-applies catalog.py's current values onto already-seeded rows —
    0002's seed only runs once, so correcting truv_source_path/truv_fillable
    in catalog.py needs a fresh migration to actually reach existing DBs.
    Same update_or_create as 0002, safe to run again."""
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
        ("urla", "0003_loanapplication_last_truv_order_id"),
    ]

    operations = [
        migrations.RunPython(update_field_definitions, noop_reverse),
    ]
