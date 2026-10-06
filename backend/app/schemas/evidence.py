"""Pydantic schemas for evidence and normalized evidence records."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EvidenceKind(str, Enum):
    CSV = "csv"
    JSON = "json"
    TXT = "txt"


class SourceLocation(BaseModel):
    """Where inside the original file this record came from."""

    file: str
    row: Optional[int] = None  # for CSV / JSON array index
    line: Optional[int] = None  # for TXT notes


class EvidenceItem(BaseModel):
    """A single normalized evidence record stored in Firestore.

    One uploaded file may produce many evidence items (e.g. CSV rows).
    Every item is traceable back to its source file + location and the
    SHA-256 of the original upload.
    """

    evidence_id: str
    case_id: str
    source_file: str
    source_location: SourceLocation
    sha256: str
    kind: EvidenceKind
    event_time: Optional[datetime] = None
    ingestion_time: datetime = Field(default_factory=_now)
    # Normalized fields parsed from the record. Kept open for the MVP;
    # the state manager interprets these into entities/relationships.
    fields: dict[str, Any] = Field(default_factory=dict)


class EvidenceUploadResult(BaseModel):
    """Summary returned after an upload is ingested."""

    source_file: str
    sha256: str
    kind: EvidenceKind
    item_count: int
    evidence_ids: list[str]
    new_state_version: Optional[int] = None
