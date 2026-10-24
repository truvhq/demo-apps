import hashlib
import hmac

from .models import WebhookEvent
from .services import get_active_credential_set

SIGNATURE_PREFIX = "v1="


def generate_webhook_sign(raw_body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return f"{SIGNATURE_PREFIX}{digest}"


def verify_webhook_signature(raw_body: bytes, secret: str, header_sig: str) -> bool:
    if not header_sig:
        return False
    expected = generate_webhook_sign(raw_body, secret)
    return hmac.compare_digest(expected, header_sig)


def verify_against_any_credential_set(raw_body: bytes, header_sig: str):
    """Truv doesn't tell us which credential set produced a given webhook, so
    try the active one first (the common case), then fall back to every
    stored set. Returns (is_valid, matched_environment)."""
    from .models import TruvCredentialSet  # local import avoids a circular import at module load

    active = get_active_credential_set()
    if active and verify_webhook_signature(raw_body, active.secret, header_sig):
        return True, active.environment

    for cred in TruvCredentialSet.objects.exclude(pk=getattr(active, "pk", None)):
        if verify_webhook_signature(raw_body, cred.secret, header_sig):
            return True, cred.environment

    return False, ""


def record_webhook_event(payload: dict, signature_valid: bool, matched_environment: str) -> WebhookEvent:
    return WebhookEvent.objects.create(
        truv_user_id=payload.get("user_id", ""),
        truv_order_id=payload.get("order_id") or payload.get("id", ""),
        event_type=payload.get("event_type", ""),
        payload=payload,
        signature_valid=signature_valid,
        matched_environment=matched_environment,
    )
