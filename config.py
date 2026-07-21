import os
from urllib.parse import urlparse

from dotenv import load_dotenv


load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")

    DEBUG = os.getenv(
        "FLASK_DEBUG",
        "False"
    ).lower() == "true"

    FIREBASE_CREDENTIALS_PATH = os.getenv(
        "FIREBASE_CREDENTIALS_PATH"
    )

    FIREBASE_DATABASE_URL = os.getenv(
        "FIREBASE_DATABASE_URL"
    )

    FIREBASE_API_KEY = os.getenv(
        "FIREBASE_API_KEY"
    )

    FIREBASE_AUTH_DOMAIN = os.getenv(
        "FIREBASE_AUTH_DOMAIN"
    )

    FIREBASE_PROJECT_ID = os.getenv(
        "FIREBASE_PROJECT_ID"
    )

    FIREBASE_STORAGE_BUCKET = os.getenv(
        "FIREBASE_STORAGE_BUCKET"
    )

    FIREBASE_MESSAGING_SENDER_ID = os.getenv(
        "FIREBASE_MESSAGING_SENDER_ID"
    )

    FIREBASE_APP_ID = os.getenv(
        "FIREBASE_APP_ID"
    )

    FIREBASE_MEASUREMENT_ID = os.getenv(
        "FIREBASE_MEASUREMENT_ID"
    )

    # -------------------------------
    # Security
    # -------------------------------

    SESSION_COOKIE_HTTPONLY = True

    SESSION_COOKIE_SECURE = True

    SESSION_COOKIE_SAMESITE = "Lax"

    REMEMBER_COOKIE_HTTPONLY = True

    REMEMBER_COOKIE_SECURE = True

    REMEMBER_COOKIE_SAMESITE = "Lax"

    WTF_CSRF_TIME_LIMIT = None

    WTF_CSRF_SSL_STRICT = True

    SESSION_REFRESH_EACH_REQUEST = False

    MAX_CONTENT_LENGTH = int(
        os.getenv("MAX_CONTENT_LENGTH_BYTES", "1048576")
    )

    APP_REQUIRE_CONFIG = os.getenv(
        "APP_REQUIRE_CONFIG",
        "True"
    ).lower() == "true"

    REQUIRED_ENV_VARS = (
        "SECRET_KEY",
        "FIREBASE_CREDENTIALS_PATH",
        "FIREBASE_DATABASE_URL",
        "FIREBASE_API_KEY",
        "FIREBASE_AUTH_DOMAIN",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_STORAGE_BUCKET",
        "FIREBASE_MESSAGING_SENDER_ID",
        "FIREBASE_APP_ID",
    )

    @classmethod
    def validate(cls):
        if not cls.APP_REQUIRE_CONFIG:
            return

        missing = [
            key
            for key in cls.REQUIRED_ENV_VARS
            if not getattr(cls, key)
        ]

        if missing:
            raise RuntimeError(
                "Missing required environment variables: "
                + ", ".join(missing)
            )

        if len(cls.SECRET_KEY) < 32:
            raise RuntimeError("SECRET_KEY must be at least 32 characters.")

        database_url = urlparse(cls.FIREBASE_DATABASE_URL)

        if database_url.scheme != "https" or not database_url.netloc:
            raise RuntimeError("FIREBASE_DATABASE_URL must be an HTTPS URL.")
