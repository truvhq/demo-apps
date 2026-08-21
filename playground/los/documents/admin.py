from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("loan_application", "category", "source", "status", "created_at")
    list_filter = ("category", "source", "status")
