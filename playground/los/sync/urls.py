from django.urls import path

from . import views

urlpatterns = [
    path("loan-files/", views.receive_loan_file),
    path("loan-files/<int:application_id>/snapshot/", views.loan_file_snapshot),
]
