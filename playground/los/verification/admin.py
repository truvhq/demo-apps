from django.contrib import admin

from .models import VerificationSnapshot


@admin.register(VerificationSnapshot)
class VerificationSnapshotAdmin(admin.ModelAdmin):
    list_display = ("loan_application", "truv_order_id", "fetched_at")
