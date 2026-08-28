"""Registers (or re-registers) the two webhook endpoints this demo needs with
Truv, pointed at the current ngrok tunnel: LOS's own receiver and the
POS-relay. Run by scripts/dev.sh after ngrok starts and NGROK_URL is written
to .env — safe to re-run any time the tunnel URL changes.

Request shape confirmed against docs.truv.com/api-reference/webhooks/webhooks_create:
POST /v1/webhooks/ requires name, webhook_url, env_type (sandbox|dev|prod), and
accepts an optional events[] enum list and enabled bool.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from truv_integration.client import TruvClient, TruvNotConfigured
from truv_integration.services import get_active_credential_set

WEBHOOK_EVENTS = [
    "order-created", "order-status-updated", "order-refresh-failed", "order-finalized",
    "certification-completed", "task-status-updated",
    "bank-accounts-created", "bank-accounts-updated",
    "link-connected", "link-disconnected", "link-deleted",
    "employment-created", "employment-updated",
    "profile-created", "profile-updated",
    "statements-created", "statements-updated",
    "shifts-created", "shifts-updated",
]

# Truv's env_type enum (sandbox|dev|prod) doesn't exactly match our
# TruvCredentialSet.environment choices (sandbox|production) — map explicitly.
ENV_TYPE_MAP = {"sandbox": "sandbox", "production": "prod"}

REGISTRATIONS = [
    ("los-mortgage-demo", "/api/webhooks/truv/"),
    ("pos-mortgage-demo-relay", "/api/webhooks/truv/pos-relay/"),
]


class Command(BaseCommand):
    help = "Register this demo's webhook endpoints with Truv, pointed at the current ngrok tunnel."

    def handle(self, *args, **options):
        ngrok_url = settings.NGROK_URL
        if not ngrok_url:
            raise CommandError("NGROK_URL is not set in .env — start ngrok first (see scripts/dev.sh).")

        credential = get_active_credential_set()
        if credential is None:
            raise CommandError("No active Truv credential set. Add one and activate it from Settings.")
        env_type = ENV_TYPE_MAP.get(credential.environment, "sandbox")
        try:
            client = TruvClient.for_active()
        except TruvNotConfigured as exc:
            raise CommandError(str(exc))

        existing = client.list_webhooks()
        if not existing.ok:
            raise CommandError(f"Could not list existing webhooks: {existing.status_code} {existing.data}")

        existing_by_name = {w.get("name"): w for w in existing.data.get("results", existing.data if isinstance(existing.data, list) else [])}

        for name, path in REGISTRATIONS:
            stale = existing_by_name.get(name)
            if stale and stale.get("id"):
                client.delete_webhook(stale["id"])
                self.stdout.write(f"Removed stale webhook '{name}' ({stale['id']})")

            url = ngrok_url.rstrip("/") + path
            resp = client.create_webhook(name=name, webhook_url=url, env_type=env_type, events=WEBHOOK_EVENTS, enabled=True)
            if resp.ok:
                self.stdout.write(self.style.SUCCESS(f"Registered '{name}' -> {url}"))
            else:
                self.stdout.write(self.style.ERROR(f"Failed to register '{name}' -> {url}: {resp.status_code} {resp.data}"))
