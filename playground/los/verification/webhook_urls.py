from django.urls import path

from . import webhooks

urlpatterns = [
    path("truv/", webhooks.truv_webhook_receiver),
    path("truv/pos-relay/", webhooks.pos_relay),
]
