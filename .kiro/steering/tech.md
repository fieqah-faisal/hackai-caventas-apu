# Technology Stack

Programming language:
Python 3.9+ (developed and tested on 3.9; 3.12 preferred where available)
Code uses `from __future__ import annotations`, so new-style builtin
generics (list[...], dict[...]) work on 3.9. Avoid runtime-evaluated
`X | None` unions in Pydantic models — use typing.Optional instead so the
backend stays importable on 3.9.

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
