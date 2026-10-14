# Technology Stack

Programming language:
Python 3.10+ (3.12 recommended and used for development; LangGraph
requires >=3.10 and Python 3.9 is EOL — see DEC-004)
Code uses `from __future__ import annotations`; new-style builtin generics
(list[...], dict[...]) and runtime `X | None` unions both work on 3.10+.
Existing models use typing.Optional — either style is fine; stay consistent
within a file.

Backend:
FastAPI
Uvicorn

Validation:
Pydantic

Main Database:
Google Cloud Firestore

Firestore Integration:
Firebase Admin SDK for Python

Incident State:
Versioned JSON documents stored in Firestore

Incident Graph:
JSON entities and relationships
Optional NetworkX where graph traversal is useful

Frontend graph renderer:
@xyflow/react (read-only, deterministic local type-grouped layout; no graph DB)

Evidence:
CSV
JSON
TXT
FastAPI UploadFile

Original uploaded files:
Local filesystem for MVP

Optional future file storage:
Firebase Cloud Storage

AI:
PlannerAdapter
DeepSeek V4.1 Flash
Model: deepseek-v4.1-flash

Agent orchestration:
LangGraph, owned by AI team member

Knowledge retrieval:
Firestore metadata queries
Optional Python ranking

Reports:
ReportLab
JSON exports
CSV exports where needed

Testing:
pytest
FastAPI TestClient
Firestore Emulator

Do not introduce:
SQLite
SQLModel
PostgreSQL
Neo4j
Redis
Kafka
microservices

unless explicitly requested.
