from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .client import TruvClient
from .models import AimCheckConfig, ApiCallLog, OrderDefaultsConfig, TruvCredentialSet, WebhookEvent
from .serializers import (
    AimCheckConfigSerializer, ApiCallLogSerializer, OrderDefaultsConfigSerializer,
    TruvCredentialSetSerializer, WebhookEventSerializer,
)
from .services import activate_credential_set, get_active_credential_set


@api_view(["GET", "PATCH"])
def aim_check_config_detail(request):
    config = AimCheckConfig.get_solo()
    if request.method == "GET":
        return Response(AimCheckConfigSerializer(config).data)

    serializer = AimCheckConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "PATCH"])
def order_defaults_config_detail(request):
    config = OrderDefaultsConfig.get_solo()
    if request.method == "GET":
        return Response(OrderDefaultsConfigSerializer(config).data)

    serializer = OrderDefaultsConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


class TruvCredentialSetViewSet(viewsets.ModelViewSet):
    queryset = TruvCredentialSet.objects.all()
    serializer_class = TruvCredentialSetSerializer

    @action(detail=False, methods=["get"])
    def active(self, request):
        cred = get_active_credential_set()
        if cred is None:
            return Response(None)
        return Response(self.get_serializer(cred).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        cred = activate_credential_set(pk)
        return Response(self.get_serializer(cred).data)

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        cred = self.get_object()
        client = TruvClient(cred.client_id, cred.secret, cred.base_url, environment=cred.environment)
        result = client.list_webhooks()
        return Response({"ok": result.ok, "status_code": result.status_code, "data": result.data})


class ApiCallLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ApiCallLog.objects.all()[:200]
    serializer_class = ApiCallLogSerializer


class WebhookEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WebhookEvent.objects.all()[:200]
    serializer_class = WebhookEventSerializer
