from cryptography.fernet import Fernet
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a Fernet key for TRUV_CREDENTIAL_ENCRYPTION_KEY in .env"

    def handle(self, *args, **options):
        key = Fernet.generate_key().decode()
        self.stdout.write(self.style.SUCCESS(key))
        self.stdout.write(
            "Copy this into TRUV_CREDENTIAL_ENCRYPTION_KEY in your .env file "
            "(shared by both pos/ and los/)."
        )
