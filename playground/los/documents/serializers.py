from rest_framework import serializers

from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = ["id", "loan_application", "category", "source", "truv_report_type",
                  "truv_report_id", "data", "file_url", "file_name", "status", "created_at"]

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            url = obj.file.url
            return request.build_absolute_uri(url) if request else url
        return None
