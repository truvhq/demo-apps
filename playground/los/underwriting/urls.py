from django.urls import path

from . import views

# Mounted at the top-level "api/loan-files/" prefix's parent — see los/urls.py.
urlpatterns = [
    path("<int:application_id>/underwriting-support/", views.underwriting_support),
    path("<int:application_id>/underwriting-calc/", views.underwriting_calculator),
    path("<int:application_id>/underwriting-decision/", views.underwriting_decision),
    path("<int:application_id>/closing-verification/", views.closing_verification),
]
