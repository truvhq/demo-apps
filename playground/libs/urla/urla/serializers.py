from rest_framework import serializers

from .models import (
    Asset, Borrower, Declaration, DemographicInfo, EmploymentRecord, FieldFillState,
    Liability, LoanAndProperty, LoanApplication, OtherIncomeSource, RealEstateOwned,
    UrlaFieldDefinition,
)


class UrlaFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UrlaFieldDefinition
        fields = "__all__"


class FieldFillStateSerializer(serializers.ModelSerializer):
    field_key = serializers.CharField(source="field_definition.field_key", read_only=True)
    # borrower_type (not the raw POS-side borrower PK) is what's portable across
    # systems — POS and LOS each assign their own primary keys, so "borrower": 7
    # would mean nothing once this crosses into LOS's database. sync.services
    # on the receiving end matches on this instead.
    borrower_type = serializers.CharField(source="borrower.borrower_type", read_only=True, default=None)

    class Meta:
        model = FieldFillState
        fields = ["id", "loan_application", "field_definition", "field_key", "borrower", "borrower_type", "fill_source", "filled_at", "truv_order_id"]


class EmploymentRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmploymentRecord
        fields = "__all__"
        read_only_fields = ["borrower"]


class OtherIncomeSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = OtherIncomeSource
        fields = "__all__"
        read_only_fields = ["borrower"]


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = "__all__"
        read_only_fields = ["borrower"]


class LiabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Liability
        fields = "__all__"
        read_only_fields = ["borrower"]


class RealEstateOwnedSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealEstateOwned
        fields = "__all__"
        read_only_fields = ["borrower"]


class DeclarationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Declaration
        fields = "__all__"
        read_only_fields = ["borrower"]


class DemographicInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemographicInfo
        fields = "__all__"
        read_only_fields = ["borrower"]


class BorrowerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Borrower
        fields = "__all__"
        read_only_fields = ["loan_application"]


class LoanAndPropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanAndProperty
        fields = "__all__"
        read_only_fields = ["loan_application"]


class BorrowerFullSerializer(serializers.ModelSerializer):
    """Read-oriented, fully nested borrower — used to build the sync payload
    (POS -> LOS submit, LOS -> POS refresh-callback). Not used for CRUD."""

    employment_records = EmploymentRecordSerializer(many=True, read_only=True)
    other_income = OtherIncomeSourceSerializer(many=True, read_only=True)
    assets = AssetSerializer(many=True, read_only=True)
    liabilities = LiabilitySerializer(many=True, read_only=True)
    real_estate_owned = RealEstateOwnedSerializer(many=True, read_only=True)
    declaration = DeclarationSerializer(read_only=True)
    demographic_info = DemographicInfoSerializer(read_only=True)

    class Meta:
        model = Borrower
        fields = [
            "id", "borrower_type", "first_name", "last_name", "ssn", "date_of_birth",
            "marital_status", "email", "phone", "citizenship_type",
            "employment_records", "other_income", "assets", "liabilities",
            "real_estate_owned", "declaration", "demographic_info",
        ]


class LoanFilePayloadSerializer(serializers.ModelSerializer):
    """The single shape both sync directions (POS->LOS submit, LOS->POS
    refresh-callback) send over the wire. Read-oriented (nested writes for a
    graph this deep are more trouble than they're worth) — the receiving
    project's `sync` app parses this dict and upserts its own rows by
    loan_uuid / borrower ordering rather than relying on DRF nested writes."""

    borrowers = BorrowerFullSerializer(many=True, read_only=True)
    loan_property = LoanAndPropertySerializer(read_only=True)
    field_fill_states = FieldFillStateSerializer(many=True, read_only=True)

    class Meta:
        model = LoanApplication
        fields = [
            "loan_uuid", "loan_number", "application_number", "status", "last_truv_order_id",
            "borrowers", "loan_property", "field_fill_states",
        ]
