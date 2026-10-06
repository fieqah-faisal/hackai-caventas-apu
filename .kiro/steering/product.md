# IR Planner

## Purpose

IR Planner is a human-in-the-loop agentic cybersecurity incident-response
planning system.

It accepts synthetic incident evidence such as logs, alerts and analyst
notes, maintains a structured evolving incident state, allows an AI planner
to recommend incident-response actions, requires analyst approval before
simulated execution, records resulting effects, supports replanning and
produces a structured incident report.

## Primary User

Security Operations Center analyst.

## Main Objective

The primary product deliverable is a structured, complete and traceable
incident-response report.

The product is not designed to autonomously attack, scan or modify real
systems.

## Workflow

Evidence
→ Evidence Normalization
→ Incident State
→ AI Analysis
→ Response Proposal
→ Human Approval
→ Simulated Action
→ Effect Validation
→ Incident State Update
→ Replanning
→ Incident Report

## Raaj's Scope

Raaj owns:

- FastAPI backend
- Firestore integration
- evidence ingestion
- incident-state storage
- incident-state versioning
- plans and actions storage
- analyst approvals
- simulator integration
- action results
- audit trail
- report generation
- backend integration interfaces

AI prompting and LangGraph orchestration are owned by another team member
and must remain behind a PlannerAdapter interface.
