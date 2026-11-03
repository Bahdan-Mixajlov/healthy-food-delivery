import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    project: str
    location: str
    bucket: str
    base_model: str
    api_key: str | None
    tuned_endpoint: str | None
    tuned_with_nutrition: bool


def get_settings() -> Settings:
    return Settings(
        project=os.getenv("GCP_PROJECT", ""),
        location=os.getenv("GCP_LOCATION", "us-central1"),
        bucket=os.getenv("GCS_BUCKET", "food-recognition-bucket"),
        base_model=os.getenv("BASE_MODEL", "gemini-3.1-flash-lite"),
        api_key=os.getenv("API_KEY") or None,
        tuned_endpoint=os.getenv("TUNED_ENDPOINT") or None,
        tuned_with_nutrition=os.getenv("TUNED_WITH_NUTRITION", "").lower() in ("1", "true", "yes"),
    )