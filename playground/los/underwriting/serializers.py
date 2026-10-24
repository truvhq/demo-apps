from rest_framework import serializers

from .models import UnderwritingDecision


class UnderwritingDecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnderwritingDecision
        fields = ["id", "decision", "notes", "decided_by", "decided_at", "approved_summary"]
