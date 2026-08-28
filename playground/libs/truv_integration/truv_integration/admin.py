from django.contrib import admin

from .models import ApiCallLog, TruvCredentialSet, WebhookEvent


@admin.register(TruvCredentialSet)
class TruvCredentialSetAdmin(admin.ModelAdmin):
    list_display = ("name", "environment", "client_id", "is_active", "updated_at")
    list_filter = ("environment", "is_active")


@admin.register(ApiCallLog)
class ApiCallLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "method", "endpoint", "status_code", "duration_ms", "environment")
    list_filter = ("method", "environment", "status_code")
    ordering = ("-created_at",)


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ("received_at", "event_type", "truv_order_id", "signature_valid", "matched_environment")
    list_filter = ("event_type", "signature_valid")
    ordering = ("-received_at",)
