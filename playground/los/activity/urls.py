from django.urls import path

from . import views

# Mounted at "api/loan-files/" in los/urls.py.
urlpatterns = [
    path("<int:application_id>/activity/", views.activity_log),
]
