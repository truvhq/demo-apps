from django.urls import path

from . import views

urlpatterns = [
    path("refresh-callback/", views.refresh_callback),
    path("<int:application_id>/status/", views.sync_status),
]
