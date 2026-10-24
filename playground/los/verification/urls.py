from django.urls import path

from . import views

urlpatterns = [
    path("requests/", views.create_verification_request),
    path("requests/<int:request_id>/", views.verification_request_detail),
    path("requests/<int:request_id>/apply/", views.apply_verification_request),
    path("step-configs/", views.list_step_configs),
    path("step-configs/<str:step_key>/", views.step_config_detail),
    path("employers/search/", views.search_employers),
    path("providers/search/", views.search_providers),
]
