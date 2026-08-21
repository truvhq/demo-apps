from rest_framework import serializers

from .models import StepVerificationConfig, VerificationRequest


class VerificationRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationRequest
        fields = "__all__"
        read_only_fields = [
            "truv_order_id", "truv_user_id", "bridge_token", "share_url",
            "document_collection_id", "status", "raw_response", "created_at", "updated_at",
        ]


class StepVerificationConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = StepVerificationConfig
        fields = [
            "step_key", "integration_method", "products", "data_sources",
            "template_id", "employer_name", "company_mapping_id", "provider_id",
            "fetch_liabilities", "updated_at",
        ]
        read_only_fields = ["step_key", "updated_at"]
