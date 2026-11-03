"""Submitting a dataset for training. Job status is retrieved separately: vertex.get_job()."""
import uuid
from datetime import datetime, timezone

from app import vertex
from app.config import get_settings
from app.converter import ConvertError, dataset_format, inspect_dataset


class TrainingError(ValueError):
    pass


def new_run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]


def _check_params(epochs, adapter_size, lr):
    if epochs is not None and not 1 <= epochs <= 100:
        raise TrainingError("epochs: must be between 1 and 100")
    if adapter_size is not None and adapter_size not in vertex.ADAPTER_SIZES:
        raise TrainingError("adapter_size: must be one of 1, 2, 4, 8, 16, 32")
    if lr is not None and not 0 < lr <= 10:
        raise TrainingError("learning_rate_multiplier: must be greater than 0 and at most 10")


def submit_dataset(jsonl_text: str, *, base_model: str | None = None, epochs: int | None = None,
                   adapter_size: int | None = None, learning_rate_multiplier: float | None = None,
                   display_name: str | None = None, check_images: bool = True) -> dict:
    """Validate the dataset, upload it to Cloud Storage, and start tuning."""
    _check_params(epochs, adapter_size, learning_rate_multiplier)
    try:
        count, uris = inspect_dataset(jsonl_text)
        fmt = dataset_format(jsonl_text)
    except ConvertError as e:
        raise TrainingError(str(e)) from e

    if check_images:
        missing = [u for u in uris if not vertex.gcs_exists(u)]
        if missing:
            shown = ", ".join(missing[:5]) + (" ..." if len(missing) > 5 else "")
            raise TrainingError(f"{len(missing)} photos from the dataset are missing in Cloud Storage: {shown}")

    run_id = new_run_id()
    dataset_uri = vertex.gcs_upload(f"datasets/{run_id}/dataset.jsonl", jsonl_text, "application/x-ndjson")
    job = vertex.start_tuning(
        dataset_uri, base_model=base_model, epochs=epochs, adapter_size=adapter_size,
        learning_rate_multiplier=learning_rate_multiplier,
        display_name=display_name or f"food-recognition-{run_id}" + ("-kbzhu" if fmt == "nutrition" else ""),
    )
    warnings = []
    if count < 100:
        warnings.append(f"dataset contains {count} examples: typically at least 100 are needed for noticeable improvement")
    return {
        "job_id": job["job_id"], "status": job["status"], "state": job["state"],
        "status_url": f"/training/jobs/{job['job_id']}",
        "dataset_uri": dataset_uri, "examples": count, "format": fmt, "bucket": get_settings().bucket,
        "warnings": warnings,
    }