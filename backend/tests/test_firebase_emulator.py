"""Emulator credential handling (BL-004).

firebase-admin 7.x resolves credentials even with FIRESTORE_EMULATOR_HOST
set, so the emulator path must initialize the app with an anonymous
credential explicitly.
"""
from __future__ import annotations

from types import SimpleNamespace

from google.auth.credentials import AnonymousCredentials

from app.database import firebase


def test_get_db_uses_anonymous_credentials_for_emulator(monkeypatch):
    firebase.get_db.cache_clear()
    captured: dict = {}

    import firebase_admin
    from firebase_admin import firestore as fb_firestore

    monkeypatch.setattr(firebase_admin, "_apps", {})
    monkeypatch.setattr(
        firebase_admin,
        "initialize_app",
        lambda cred=None, options=None: captured.update(cred=cred, options=options),
    )
    monkeypatch.setattr(fb_firestore, "client", lambda: "DB")
    monkeypatch.setattr(
        "app.database.firebase.get_settings",
        lambda: SimpleNamespace(
            firestore_emulator_host="127.0.0.1:8080",
            use_emulator=True,
            google_application_credentials="./secrets/serviceAccount.json",
            firebase_project_id="ir-planner-dev",
        ),
    )

    assert firebase.get_db() == "DB"
    cred = captured["cred"]
    assert cred is not None, "emulator path must not fall back to ADC"
    google_cred = cred.get_credential()
    assert isinstance(google_cred, AnonymousCredentials)
    assert captured["options"]["projectId"] == "ir-planner-dev"

    firebase.get_db.cache_clear()
