from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/truv/", include("truv_integration.urls")),
    path("api/loan-files/", include("loanfile.urls")),
    path("api/loan-files/", include("underwriting.urls")),
    path("api/loan-files/", include("activity.urls")),
    path("api/verification/", include("verification.urls")),
    path("api/sync/", include("sync.urls")),
    path("api/webhooks/", include("verification.webhook_urls")),
    path("api/", include("documents.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
