"""Pytest fixtures: wire the repositories layer to an in-memory fake Firestore.

The fake persists for the lifetime of a test module, so "restart" semantics
(create -> read back) are exercised against the same store, which is what
Milestone 1 cares about: data survives beyond the request that created it.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.fake_firestore import FakeFirestore


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeFirestore()
    # repositories calls get_db() per operation; always hand back the same fake.
    monkeypatch.setattr("app.database.repositories.get_db", lambda: db)
    return db


@pytest.fixture
def client(fake_db):
    from app.main import app

    return TestClient(app)
