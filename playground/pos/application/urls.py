from django.urls import path

from . import views

urlpatterns = [
    path("", views.loan_application_list_create),
    path("<int:application_id>/", views.loan_application_detail),
    path("<int:application_id>/coverage/", views.loan_application_coverage),
    path("<int:application_id>/field-fill-states/", views.loan_application_field_fill_states),
    path("<int:application_id>/loan-property/", views.loan_property_detail),
    path("<int:application_id>/submit/", views.submit_to_los),

    path("<int:application_id>/borrowers/<int:borrower_id>/", views.borrower_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/employment/", views.employment_list_create),
    path("<int:application_id>/borrowers/<int:borrower_id>/employment/<int:item_id>/", views.employment_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/other-income/", views.other_income_list_create),
    path("<int:application_id>/borrowers/<int:borrower_id>/other-income/<int:item_id>/", views.other_income_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/assets/", views.asset_list_create),
    path("<int:application_id>/borrowers/<int:borrower_id>/assets/<int:item_id>/", views.asset_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/liabilities/", views.liability_list_create),
    path("<int:application_id>/borrowers/<int:borrower_id>/liabilities/<int:item_id>/", views.liability_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/reo/", views.reo_list_create),
    path("<int:application_id>/borrowers/<int:borrower_id>/reo/<int:item_id>/", views.reo_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/declarations/", views.declaration_detail),
    path("<int:application_id>/borrowers/<int:borrower_id>/demographics/", views.demographic_info_detail),
]
