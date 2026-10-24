from rest_framework import serializers

from .models import AimCheckConfig, ApiCallLog, OrderDefaultsConfig, TruvCredentialSet, WebhookEvent


class TruvCredentialSetSerializer(serializers.ModelSerializer):
    secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    secret_set = serializers.SerializerMethodField()

    class Meta:
        model = TruvCredentialSet
        fields = [
            "id", "name", "environment", "client_id", "base_url",
            "is_active", "secret", "secret_set", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_active", "created_at", "updated_at"]

    def get_secret_set(self, obj) -> bool:
        return bool(obj.encrypted_secret)

    def create(self, validated_data):
        secret = validated_data.pop("secret", "")
        instance = TruvCredentialSet(**validated_data)
        instance.secret = secret
        instance.save()
        return instance

    def update(self, instance, validated_data):
        secret = validated_data.pop("secret", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if secret:
            instance.secret = secret
        instance.save()
        return instance


class AimCheckConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AimCheckConfig
        fields = ["flow", "ocr_source", "updated_at"]
        read_only_fields = ["updated_at"]


class OrderDefaultsConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderDefaultsConfig
        fields = ["order_manager_email", "updated_at"]
        read_only_fields = ["updated_at"]


class ApiCallLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApiCallLog
        fields = "__all__"


class WebhookEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookEvent
        fields = "__all__"
