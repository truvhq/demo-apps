from django.db import migrations

from urla.catalog import FIELD_DEFINITIONS


def seed_field_definitions(apps, schema_editor):
    UrlaFieldDefinition = apps.get_model("urla", "UrlaFieldDefinition")
    for definition in FIELD_DEFINITIONS:
        UrlaFieldDefinition.objects.update_or_create(
            field_key=definition["field_key"],
            defaults={k: v for k, v in definition.items() if k != "field_key"},
        )


def unseed_field_definitions(apps, schema_editor):
    UrlaFieldDefinition = apps.get_model("urla", "UrlaFieldDefinition")
    keys = [d["field_key"] for d in FIELD_DEFINITIONS]
    UrlaFieldDefinition.objects.filter(field_key__in=keys).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("urla", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_field_definitions, unseed_field_definitions),
    ]
