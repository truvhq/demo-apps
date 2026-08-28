from django.db import models

from urla.models import LoanApplication


class ActivityLogEntry(models.Model):
    class Actor(models.TextChoices):
        SYSTEM = "system", "System"
        TRUV = "truv", "Truv"
        USER = "user", "User"

    loan_application = models.ForeignKey(LoanApplication, related_name="activity_log_entries", on_delete=models.CASCADE)
    actor = models.CharField(max_length=20, choices=Actor.choices, default=Actor.SYSTEM)
    message = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.actor}] {self.message}"
