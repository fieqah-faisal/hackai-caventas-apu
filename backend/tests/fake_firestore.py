"""A minimal in-memory stand-in for the Firestore client.

Implements only the surface the repositories layer uses: collection ->
document -> {set, update, get, stream} and nested subcollections. Lets the
Milestone 1 flow be tested without the emulator or a cloud project.

This is a test helper, not production code.
"""
from __future__ import annotations

import copy
from typing import Any


class _Snapshot:
    def __init__(self, data: dict[str, Any] | None):
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._data) if self._data is not None else None


class _Document:
    def __init__(self):
        self.data: dict[str, Any] | None = None
        self.collections: dict[str, "_Collection"] = {}

    def collection(self, name: str) -> "_Collection":
        return self.collections.setdefault(name, _Collection())

    def set(self, data: dict[str, Any]) -> None:
        self.data = copy.deepcopy(data)

    def update(self, data: dict[str, Any]) -> None:
        if self.data is None:
            self.data = {}
        self.data.update(copy.deepcopy(data))

    def get(self) -> _Snapshot:
        return _Snapshot(self.data)


class _Collection:
    def __init__(self):
        self.docs: dict[str, _Document] = {}

    def document(self, doc_id: str) -> _Document:
        return self.docs.setdefault(doc_id, _Document())

    def stream(self):
        return [d.get() for d in self.docs.values() if d.data is not None]


class FakeFirestore:
    def __init__(self):
        self.collections: dict[str, _Collection] = {}

    def collection(self, name: str) -> _Collection:
        return self.collections.setdefault(name, _Collection())
