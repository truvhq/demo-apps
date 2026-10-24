from django.db import transaction

from .models import TruvCredentialSet


def activate_credential_set(pk: int) -> TruvCredentialSet:
    with transaction.atomic():
        TruvCredentialSet.objects.filter(is_active=True).update(is_active=False)
        TruvCredentialSet.objects.filter(pk=pk).update(is_active=True)
        return TruvCredentialSet.objects.get(pk=pk)


def get_active_credential_set() -> TruvCredentialSet | None:
    return TruvCredentialSet.objects.filter(is_active=True).first()
