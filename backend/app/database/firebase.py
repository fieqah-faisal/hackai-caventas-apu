"""Firestore client bootstrap using the Firebase Admin SDK.

The Admin SDK runs server-side with privileged access and bypasses client
Security Rules, so the backend's own validation is the security boundary.

For local development set ``FIRESTORE_EMULATOR_HOST`` (e.g. ``localhost:8080``)
so the Admin SDK talks to the local emulator instead of the cloud database.
"""
from __future__ import annotations

import os
from functools import lru_cache

from app.config import get_settings


@lru_cache
def get_db():
    """Return a cached Firestore client.

    Lazily imports firebase_admin so that importing this module (and running
    non-Firestore unit tests) does not require the SDK to be installed or
    credentials to be present.
    """
    import firebase_admin
    from firebase_admin import credentials, firestore

    settings = get_settings()

    # Point the Admin SDK at the emulator when configured.
    if settings.firestore_emulator_host:
        os.environ["FIRESTORE_EMULATOR_HOST"] = settings.firestore_emulator_host

    if not firebase_admin._apps:
        cred = None
        if settings.google_application_credentials and not settings.use_emulator:
            cred = credentials.Certificate(settings.google_application_credentials)
        # With the emulator (or ambient GOOGLE_APPLICATION_CREDENTIALS) the
        # SDK can initialize without an explicit certificate.
        firebase_admin.initialize_app(
            cred,
            {"projectId": settings.firebase_project_id},
        )

    return firestore.client()
