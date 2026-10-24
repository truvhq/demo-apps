from .models import ActivityLogEntry


def log_activity(loan_application, actor: str, message: str) -> ActivityLogEntry:
    return ActivityLogEntry.objects.create(loan_application=loan_application, actor=actor, message=message)
