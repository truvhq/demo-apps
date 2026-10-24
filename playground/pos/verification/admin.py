from django.contrib import admin

from .models import StepVerificationConfig, VerificationRequest


@admin.register(VerificationRequest)
class VerificationRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "loan_application", "integration_method", "status", "truv_order_id", "created_at")
    list_filter = ("integration_method", "status")


@admin.register(StepVerificationConfig)
class StepVerificationConfigAdmin(admin.ModelAdmin):
    list_display = ("step_key", "integration_method", "products", "updated_at")
