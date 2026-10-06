"""Evidence ingestion service.

Pipeline for an uploaded file:

    validate type/size
    -> store original on local filesystem
    -> compute SHA-256 of the original bytes
    -> parse records (CSV rows / JSON array / TXT lines)
    -> normalize into evidence items with unique ids + source location
    -> persist evidence items to Firestore
    -> record an audit event
    -> trigger a new incident-state version

Raw files are kept on disk (Firestore docs cap at 1 MiB); Firestore holds
the path, SHA-256 and normalized fields only.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.database import repositories
from app.schemas.evidence import (
    EvidenceItem,
    EvidenceKind,
    EvidenceUploadResult,
    SourceLocation,
)
from app.services import audit_service, state_manager

_EXT_TO_KIND = {
    ".csv": EvidenceKind.CSV,
    ".json": EvidenceKind.JSON,
    ".txt": EvidenceKind.TXT,
}


class IngestionError(ValueError):
    """Raised for malformed or unsupported uploads."""


def _kind_for(filename: str) -> EvidenceKind:
    ext = Path(filename).suffix.lower()
    if ext not in _EXT_TO_KIND:
        raise IngestionError(
            f"unsupported file type '{ext}'. Allowed: .csv, .json, .txt"
        )
    return _EXT_TO_KIND[ext]


def _new_evidence_id() -> str:
    return f"EV-{uuid.uuid4().hex[:12]}"


def _parse_event_time(value: Any) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).isoformat()
    except ValueError:
        return None


def _normalize_record(record: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    """Return (fields, event_time_iso) from a loosely-typed record.

    Common field aliases are mapped so the state manager can find host /
    account / event_type without the uploader using exact column names.
    """
    lowered = {str(k).lower(): v for k, v in record.items()}

    def pick(*names: str) -> Any:
        for n in names:
            if n in lowered and lowered[n] not in (None, ""):
                return lowered[n]
        return None

    event_time = _parse_event_time(
        pick("event_time", "timestamp", "time", "datetime", "date")
    )
    fields = dict(record)
    host = pick("host", "hostname", "machine", "workstation")
    account = pick("account", "user", "username", "user_id")
    event_type = pick("event_type", "action", "type", "event")
    if host is not None:
        fields["host"] = host
    if account is not None:
        fields["account"] = account
    if event_type is not None:
        fields["event_type"] = event_type
    return fields, event_time


def _records_from_bytes(
    raw: bytes, kind: EvidenceKind, filename: str
) -> list[tuple[dict[str, Any], SourceLocation]]:
    text = raw.decode("utf-8", errors="replace")
    out: list[tuple[dict[str, Any], SourceLocation]] = []

    if kind is EvidenceKind.CSV:
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            raise IngestionError("CSV file has no header row")
        for i, row in enumerate(reader):
            out.append((dict(row), SourceLocation(file=filename, row=i)))

    elif kind is EvidenceKind.JSON:
        try:
            doc = json.loads(text)
        except json.JSONDecodeError as exc:
            raise IngestionError(f"invalid JSON: {exc}") from exc
        if isinstance(doc, list):
            for i, item in enumerate(doc):
                rec = item if isinstance(item, dict) else {"value": item}
                out.append((rec, SourceLocation(file=filename, row=i)))
        elif isinstance(doc, dict):
            out.append((doc, SourceLocation(file=filename, row=0)))
        else:
            raise IngestionError("JSON must be an object or array")

    elif kind is EvidenceKind.TXT:
        for i, line in enumerate(text.splitlines()):
            stripped = line.strip()
            if stripped:
                out.append(
                    ({"note": stripped}, SourceLocation(file=filename, line=i))
                )

    if not out:
        raise IngestionError("no records found in uploaded file")
    return out


def ingest(case_id: str, filename: str, raw: bytes) -> EvidenceUploadResult:
    """Ingest one uploaded file into a case and version the incident state."""
    if not repositories.case_exists(case_id):
        raise IngestionError(f"case not found: {case_id}")

    settings = get_settings()
    if len(raw) > settings.max_upload_bytes:
        raise IngestionError(
            f"file exceeds max size of {settings.max_upload_bytes} bytes"
        )

    kind = _kind_for(filename)
    sha256 = hashlib.sha256(raw).hexdigest()

    # Store the original file: uploads/<case_id>/<sha-prefix>-<filename>
    case_dir = settings.upload_path / case_id
    case_dir.mkdir(parents=True, exist_ok=True)
    stored_path = case_dir / f"{sha256[:12]}-{Path(filename).name}"
    stored_path.write_bytes(raw)

    records = _records_from_bytes(raw, kind, filename)

    evidence_ids: list[str] = []
    ingestion_time = datetime.now(timezone.utc)
    for record, location in records:
        fields, event_time = _normalize_record(record)
        ev_id = _new_evidence_id()
        item = EvidenceItem(
            evidence_id=ev_id,
            case_id=case_id,
            source_file=filename,
            source_location=location,
            sha256=sha256,
            kind=kind,
            event_time=event_time,
            ingestion_time=ingestion_time,
            fields=fields,
        )
        repositories.add_evidence(case_id, ev_id, item.model_dump(mode="json"))
        evidence_ids.append(ev_id)

    audit_service.record(
        case_id,
        "evidence_uploaded",
        {
            "source_file": filename,
            "sha256": sha256,
            "kind": kind.value,
            "item_count": len(evidence_ids),
            "stored_path": str(stored_path),
        },
    )

    new_state = state_manager.rebuild_and_version(case_id)

    return EvidenceUploadResult(
        source_file=filename,
        sha256=sha256,
        kind=kind,
        item_count=len(evidence_ids),
        evidence_ids=evidence_ids,
        new_state_version=new_state.version,
    )


def list_items(case_id: str) -> list[dict[str, Any]]:
    return repositories.list_evidence(case_id)
