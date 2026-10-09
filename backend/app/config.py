"""Application configuration loaded from environment variables.

Secrets and credentials are never hardcoded. Copy ``.env.example`` to
``.env`` and fill in values for local development.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (two levels up from this file: app/config.py -> app -> backend)
BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime settings. Values come from the environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Firestore / Firebase ---
    google_application_credentials: Optional[str] = None
    firebase_project_id: str = "ir-planner-dev"
    firestore_emulator_host: Optional[str] = None

    # --- AI planner: OpenCode Go (optional; backend works without it) ---
    opencode_go_api_key: Optional[str] = None
    opencode_go_model: str = "deepseek-v4.1-flash"
    opencode_go_endpoint: str = (
        "https://opencode.ai/zen/go/v1/chat/completions"
    )
    opencode_go_max_tokens: int = 32000
    opencode_go_temperature: float = 0.2
    opencode_go_timeout_seconds: float = 300.0

    # --- Action simulator: "demo" (injected CRM fault) or "clean" ---
    simulator_profile: str = "demo"

    # --- Local storage ---
    upload_dir: str = str(BACKEND_DIR / "uploads")
    report_dir: str = str(BACKEND_DIR / "reports")

    # --- Evidence ingestion limits ---
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MiB

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def report_path(self) -> Path:
        p = Path(self.report_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def use_emulator(self) -> bool:
        return bool(self.firestore_emulator_host)


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
