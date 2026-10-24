from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/truv/", include("truv_integration.urls")),
    path("api/applications/", include("application.urls")),
    path("api/verification/", include("verification.urls")),
    path("api/sync/", include("sync.urls")),
]
