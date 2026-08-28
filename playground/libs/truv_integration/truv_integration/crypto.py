from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def get_fernet() -> Fernet:
    key = getattr(settings, "TRUV_CREDENTIAL_ENCRYPTION_KEY", None)
    if not key:
        raise ImproperlyConfigured(
            "Set TRUV_CREDENTIAL_ENCRYPTION_KEY in your .env. "
            "Generate one with: python manage.py generate_truv_key"
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> bytes:
    return get_fernet().encrypt(plaintext.encode())


def decrypt_secret(token: bytes) -> str:
    try:
        return get_fernet().decrypt(bytes(token)).decode()
    except InvalidToken as exc:
        raise ImproperlyConfigured(
            "Could not decrypt stored Truv secret — TRUV_CREDENTIAL_ENCRYPTION_KEY "
            "may have changed since it was saved."
        ) from exc
