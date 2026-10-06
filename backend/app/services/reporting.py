"""Reporting service (later milestone).

Generates the structured IncidentReport JSON from stored case records, then
renders it to PDF with ReportLab. Reports reference a specific
incident-state version and may only contain facts supported by stored
records (no fabricated evidence or unsupported claims).

Milestone 1 does not implement this.
"""
from __future__ import annotations


def generate_report(*args, **kwargs):
    raise NotImplementedError("reporting is implemented in a later milestone")
