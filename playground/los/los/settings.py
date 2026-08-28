"""
Django settings for the LOS (Loan Origination System) project — the
back-office loan file / underwriting-support / document manager app in the
Truv mortgage POS/LOS simulator. LOS is the only side ngrok tunnels to,
since it's the longer-lived system of record for webhooks.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
load_dotenv(REPO_ROOT / ".env")

SECRET_KEY = os.environ.get("LOS_DJANGO_SECRET_KEY", "dev-los-secret-change-me")
DEBUG = True
# Wildcard subdomain entries (leading dot) let Django accept whatever ngrok
# hostname scripts/dev.sh allocates on each run, without editing this file.
ALLOWED_HOSTS = ["localhost", "127.0.0.1", ".ngrok-free.app", ".ngrok-free.dev", ".ngrok.io", ".ngrok.app"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    # Shared libs
    "truv_integration",
    "urla",
    # LOS apps
    "loanfile",
    "underwriting",
    "documents",
    "verification",
    "sync",
    "activity",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "los.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "los.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Document previews (PDF proxy, locally-stored report/upload files) render
# inline via iframe in the frontend — Django's DENY default blocks that even
# for same-origin requests. SAMEORIGIN keeps real clickjacking protection
# against other sites while allowing our own frontend to embed them.
X_FRAME_OPTIONS = "SAMEORIGIN"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

CORS_ALLOWED_ORIGINS = [
    f"http://localhost:{os.environ.get('LOS_FRONTEND_PORT', '5174')}",
]

TRUV_CREDENTIAL_ENCRYPTION_KEY = os.environ.get("TRUV_CREDENTIAL_ENCRYPTION_KEY", "")
INTERNAL_SYNC_API_KEY = os.environ.get("INTERNAL_SYNC_API_KEY", "")
POS_BASE_URL = os.environ.get("POS_BASE_URL", "http://localhost:8000")
LOS_BASE_URL = os.environ.get("LOS_BASE_URL", "http://localhost:8001")
NGROK_URL = os.environ.get("NGROK_URL", "")
