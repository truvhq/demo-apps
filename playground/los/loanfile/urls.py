from django.urls import path

from verification.views import refresh_order

from . import views

urlpatterns = [
    path("", views.loan_file_list),
    path("<int:application_id>/", views.loan_file_detail),
    path("<int:application_id>/coverage/", views.loan_file_coverage),
    path("<int:application_id>/field-fill-states/", views.loan_file_field_fill_states),
    path("<int:application_id>/borrowers/<int:borrower_id>/", views.borrower_correction),
    path("<int:application_id>/loan-property/", views.loan_property_correction),
    path("<int:application_id>/refresh/", refresh_order),
]
