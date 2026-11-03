"""Google Cloud access: Cloud Storage, tuning job start and status, and model calls.

Google libraries are imported inside functions, so the service starts and the tests
run without credentials or network access; the cloud is contacted only when needed.
"""
import json
import re
from functools import lru_cache

from app.config import get_settings
from app.converter import prompts


class ConfigError(RuntimeError):
    """Required configuration (for example GCP_PROJECT) is missing."""


class VertexError(RuntimeError):
    """A Google Cloud call failed or received invalid input."""


class JobNotFound(VertexError):
    """The requested tuning job does not exist."""


ADAPTER_SIZES = {1: "ADAPTER_SIZE_ONE", 2: "ADAPTER_SIZE_TWO", 4: "ADAPTER_SIZE_FOUR",
                 8: "ADAPTER_SIZE_EIGHT", 16: "ADAPTER_SIZE_SIXTEEN", 32: "ADAPTER_SIZE_THIRTY_TWO"}

STATUS_MAP = {
    "JOB_STATE_QUEUED": "pending", "JOB_STATE_PENDING": "pending", "JOB_STATE_UPDATING": "running",
    "JOB_STATE_RUNNING": "running", "JOB_STATE_SUCCEEDED": "succeeded",
    "JOB_STATE_PARTIALLY_SUCCEEDED": "succeeded", "JOB_STATE_FAILED": "failed",
    "JOB_STATE_EXPIRED": "failed", "JOB_STATE_CANCELLING": "cancelled", "JOB_STATE_CANCELLED": "cancelled",
}


def _project() -> str:
    """Return the configured Google Cloud project, or raise ConfigError if it is not set."""
    project = get_settings().project
    if not project:
        raise ConfigError("GCP_PROJECT environment variable is not set")
    return project


@lru_cache(maxsize=None)
def _genai(location: str):
    """Create (once per location) and cache a Vertex AI client.

    The client must stay referenced: a temporary client gets garbage collected in the
    middle of a request and fails with "Cannot send a request, as the client has been closed".
    """
    from google import genai
    return genai.Client(vertexai=True, project=_project(), location=location)


@lru_cache(maxsize=1)
def _storage():
    """Create (once) and cache a Cloud Storage client."""
    from google.cloud import storage
    return storage.Client(project=_project())


def split_gs(uri: str) -> tuple[str, str]:
    """Split a gs://bucket/path URI into (bucket, path)."""
    m = re.match(r"gs://([^/]+)/(.+)$", uri)
    if not m:
        raise VertexError(f"invalid Cloud Storage URI: {uri}")
    return m.group(1), m.group(2)


def gcs_exists(uri: str) -> bool:
    """Return True if an object exists at the given gs:// URI."""
    bucket, path = split_gs(uri)
    return _storage().bucket(bucket).blob(path).exists()


def gcs_upload(path: str, data: bytes | str, content_type: str) -> str:
    """Upload data to the configured bucket and return the gs:// URI of the new object."""
    bucket = get_settings().bucket
    _storage().bucket(bucket).blob(path).upload_from_string(data, content_type=content_type)
    return f"gs://{bucket}/{path}"


def _state_name(state) -> str:
    """Return a job state as a plain string such as JOB_STATE_RUNNING."""
    return getattr(state, "name", None) or str(state or "JOB_STATE_UNSPECIFIED")


def _iso(t) -> str | None:
    """Format a datetime as an ISO 8601 string, or return None."""
    return t.isoformat() if t else None


def start_tuning(dataset_uri: str, base_model: str | None = None, epochs: int | None = None,
                 adapter_size: int | None = None, learning_rate_multiplier: float | None = None,
                 display_name: str | None = None) -> dict:
    """Start a supervised tuning job on a dataset stored in Cloud Storage.

    Parameters left as None use the Vertex AI defaults (base_model falls back to the
    BASE_MODEL setting). Returns the job id, the raw state and a simplified status.
    """
    from google.genai import types
    s = get_settings()
    cfg: dict = {}
    if epochs:
        cfg["epoch_count"] = epochs
    if adapter_size:
        cfg["adapter_size"] = getattr(types.AdapterSize, ADAPTER_SIZES[adapter_size])
    if learning_rate_multiplier:
        cfg["learning_rate_multiplier"] = learning_rate_multiplier
    if display_name:
        cfg["tuned_model_display_name"] = display_name
    try:
        client = _genai(s.location)
        job = client.tunings.tune(
            base_model=base_model or s.base_model,
            training_dataset=types.TuningDataset(gcs_uri=dataset_uri),
            config=types.CreateTuningJobConfig(**cfg) if cfg else None,
        )
    except ConfigError:
        raise
    except Exception as e:
        raise VertexError(f"Vertex AI rejected the job: {e}") from e
    state = _state_name(job.state)
    return {"job_id": job.name.rsplit("/", 1)[-1], "state": state, "status": STATUS_MAP.get(state, "pending")}


def get_job(job_id: str) -> dict:
    """Return the status of a tuning job.

    Once the job has succeeded, the result also contains the tuned model name and the
    endpoint to call it. Raises JobNotFound if the job does not exist in the configured region.
    """
    if not re.fullmatch(r"\d{5,25}", job_id):
        raise VertexError("job_id must consist of digits (the number at the end of the job name)")
    s = get_settings()
    name = f"projects/{_project()}/locations/{s.location}/tuningJobs/{job_id}"
    try:
        client = _genai(s.location)
        job = client.tunings.get(name=name)
    except ConfigError:
        raise
    except Exception as e:
        if getattr(e, "code", None) == 404:
            raise JobNotFound(f"job {job_id} not found (region {s.location})") from e
        raise VertexError(f"failed to retrieve status: {e}") from e
    state = _state_name(job.state)
    tuned = job.tuned_model
    return {
        "job_id": job_id,
        "status": STATUS_MAP.get(state, "running"),
        "state": state,
        "created_at": _iso(job.create_time),
        "started_at": _iso(job.start_time),
        "finished_at": _iso(job.end_time),
        "base_model": job.base_model,
        "display_name": job.tuned_model_display_name,
        "model": tuned.model if tuned else None,
        "endpoint": tuned.endpoint if tuned else None,
        "error": (job.error.message if job.error else None),
    }


def parse_model_output(raw: str) -> tuple[list[dict] | None, str | None]:
    """Parse a model answer into a list of dish items.

    Accepts a bare JSON array or an object with an "items" key, with or without a
    ```json fence. Returns (items, None) on success and (None, error message) otherwise.
    """
    clean = re.sub(r"```[a-zA-Z0-9]*", "", raw or "").strip()
    try:
        data = json.loads(clean)
    except ValueError as e:
        return None, f"response is not valid JSON: {e}"
    items = data if isinstance(data, list) else (data.get("items") if isinstance(data, dict) else None)
    if not isinstance(items, list):
        return None, "response does not contain a list of dishes"
    return [i for i in items if isinstance(i, dict)], None


def recognize(image: bytes, mime: str, model: str, with_nutrition: bool = False) -> dict:
    """Send a photo to a model and return its parsed answer.

    model is either the endpoint of a tuned model (projects/.../endpoints/<id>) or the
    name of a base Gemini model. with_nutrition selects the prompt and must match the
    format the model was trained on. The raw answer is always returned together with
    a parse error, if there was one, so malformed output can be inspected.
    """
    from google.genai import types
    system, user_text = prompts(with_nutrition)
    endpoint = re.fullmatch(r"projects/[^/]+/locations/([^/]+)/endpoints/\d+", model)
    if endpoint:
        location = endpoint.group(1)
    elif re.fullmatch(r"gemini-[\w.\-]+", model):
        location = "global"
    else:
        raise VertexError("model: expected an endpoint like projects/.../locations/.../endpoints/<digits> or a gemini-... model name")
    try:
        client = _genai(location)
        resp = client.models.generate_content(
            model=model,
            contents=[types.Content(role="user", parts=[
                types.Part.from_bytes(data=image, mime_type=mime),
                types.Part.from_text(text=user_text),
            ])],
            config=types.GenerateContentConfig(system_instruction=system, temperature=0,
                                               max_output_tokens=2048),
        )
    except ConfigError:
        raise
    except Exception as e:
        raise VertexError(f"model failed to respond: {e}") from e
    raw = resp.text or ""
    items, error = parse_model_output(raw)
    return {"model": model, "with_nutrition": with_nutrition, "items": items, "raw_response": raw, "parse_error": error}