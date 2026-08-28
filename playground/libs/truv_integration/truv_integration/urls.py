from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ApiCallLogViewSet, TruvCredentialSetViewSet, WebhookEventViewSet,
    aim_check_config_detail, order_defaults_config_detail,
)

router = DefaultRouter()
router.register("credential-sets", TruvCredentialSetViewSet, basename="credential-set")
router.register("api-logs", ApiCallLogViewSet, basename="api-log")
router.register("webhook-events", WebhookEventViewSet, basename="webhook-event")

urlpatterns = router.urls + [
    path("aim-check-config/", aim_check_config_detail),
    path("order-defaults-config/", order_defaults_config_detail),
]
