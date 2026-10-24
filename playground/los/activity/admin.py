from django.contrib import admin

from .models import ActivityLogEntry


@admin.register(ActivityLogEntry)
class ActivityLogEntryAdmin(admin.ModelAdmin):
    list_display = ("loan_application", "actor", "message", "created_at")
    list_filter = ("actor",)
