from django.urls import path

from . import views

# Mounted at the top-level "api/" prefix in los/urls.py (not under
# "api/loan-files/") since it needs both loan-file-scoped paths and a plain
# "api/documents/{id}/download/" path.
urlpatterns = [
    path("loan-files/<int:application_id>/documents/", views.document_list),
    path("loan-files/<int:application_id>/documents/upload/", views.upload_document),
    path("loan-files/<int:application_id>/documents/fetch-invoice/", views.fetch_invoice),
    path("loan-files/<int:application_id>/documents/generate-aim-check-report/", views.generate_aim_check_report),
    path("documents/<int:document_id>/download/", views.document_download),
    path("documents/<int:document_id>/pdf/", views.document_pdf_proxy),
]
