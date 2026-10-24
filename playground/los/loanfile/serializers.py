from rest_framework import serializers

from urla.models import LoanApplication
from urla.serializers import BorrowerFullSerializer, LoanAndPropertySerializer


class LoanFileListSerializer(serializers.ModelSerializer):
    borrower_name = serializers.SerializerMethodField()

    class Meta:
        model = LoanApplication
        fields = ["id", "loan_uuid", "loan_number", "application_number", "status", "last_truv_order_id",
                  "borrower_name", "created_at", "updated_at", "last_synced_at"]

    def get_borrower_name(self, obj):
        primary = obj.borrowers.filter(borrower_type="primary").first()
        if not primary:
            return ""
        return f"{primary.first_name} {primary.last_name}".strip()


class LoanFileDetailSerializer(serializers.ModelSerializer):
    borrowers = BorrowerFullSerializer(many=True, read_only=True)
    loan_property = LoanAndPropertySerializer(read_only=True)

    class Meta:
        model = LoanApplication
        fields = ["id", "loan_uuid", "loan_number", "application_number", "status",
                  "borrowers", "loan_property", "created_at", "updated_at", "last_synced_at"]
