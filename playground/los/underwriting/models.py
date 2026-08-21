from django.core.serializers.json import DjangoJSONEncoder
from django.db import models

from urla.models import LoanApplication


class UnderwritingDecision(models.Model):
    """A processor's approve/reject call on the Truv-verified data, made from
    the Underwriting Support Data tab. Freezes the summarized Truv data at
    decision time (`approved_summary`) so a later pre-close re-verification
    (the Closing tab) has a fixed baseline to diff the re-pulled data against
    — mirroring a real-world VOE/VOA "still holds at closing" recheck."""

    class Decision(models.TextChoices):
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    loan_application = models.OneToOneField(LoanApplication, related_name="underwriting_decision", on_delete=models.CASCADE)
    decision = models.CharField(max_length=20, choices=Decision.choices)
    notes = models.TextField(blank=True)
    decided_by = models.CharField(max_length=150, blank=True)
    decided_at = models.DateTimeField(auto_now=True)
    approved_summary = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
