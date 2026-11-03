import json
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app import augment, pipeline, training, vertex
from app.config import get_settings
from app.converter import ConvertError, clean_name, convert_export, load_nutrition_table, mime_for

app = FastAPI(
    title="Food Recognition Tuning API",
    version="1.0.0",
    description="Service for automating Gemini fine-tuning on food recognition tasks, including dataset preparation, training orchestration, synthetic augmentation, and inference."
)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="API key configured on the server")


def require_key(api_key: str | None = Depends(api_key_header)):
    key = get_settings().api_key
    if key and api_key != key:
        raise HTTPException(401, "Invalid or missing X-API-Key header")


router = APIRouter(dependencies=[Depends(require_key)])


@app.exception_handler(ConvertError)
@app.exception_handler(training.TrainingError)
@app.exception_handler(augment.AugmentError)
async def bad_request(request: Request, exc: Exception):
    return JSONResponse({"error": str(exc)}, status_code=400)


@app.exception_handler(vertex.JobNotFound)
async def not_found(request: Request, exc: Exception):
    return JSONResponse({"error": str(exc)}, status_code=404)


@app.exception_handler(vertex.ConfigError)
async def misconfigured(request: Request, exc: Exception):
    return JSONResponse({"error": str(exc)}, status_code=500)


@app.exception_handler(vertex.VertexError)
async def upstream(request: Request, exc: Exception):
    return JSONResponse({"error": str(exc)}, status_code=502)


async def _read_json_file(f: UploadFile, what: str):
    try:
        return json.loads((await f.read()).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, f"{what} file is not valid JSON") from None


async def _read_table(f: UploadFile | None):
    if f is None:
        return None
    return load_nutrition_table(await _read_json_file(f, "nutrition_table"))


def _photo_mime(f: UploadFile) -> str:
    mime = mime_for(f.filename or "")
    if mime is None:
        raise HTTPException(400, "Supported photo formats are webp, jpg, and png")
    return mime


class ConvertResponse(BaseModel):
    nutrition: bool
    examples: int
    images: list[str]
    warnings: list[str]
    jsonl: str


class JobCreated(BaseModel):
    job_id: str
    status: str
    state: str
    status_url: str
    dataset_uri: str
    examples: int
    format: Literal["basic", "nutrition"]
    bucket: str
    warnings: list[str]


class PipelineResponse(JobCreated):
    images_uploaded: int
    augmented_variants: int
    images_folder: str


class JobStatus(BaseModel):
    job_id: str
    status: Literal["pending", "running", "succeeded", "failed", "cancelled"]
    state: str
    created_at: str | None
    started_at: str | None
    finished_at: str | None
    base_model: str | None
    display_name: str | None
    model: str | None
    endpoint: str | None
    error: str | None


class RecognizeResponse(BaseModel):
    model: str
    with_nutrition: bool
    items: list[dict] | None
    raw_response: str
    parse_error: str | None


@router.post("/convert", response_model=ConvertResponse, tags=["Dataset Conversion"],
             summary="Convert Label Studio export into a fine-tuning dataset")
async def convert(annotations: UploadFile = File(..., description="Exported JSON file from Label Studio"),
                  nutrition_table: UploadFile | None = File(None, description="Optional nutrition table per 100g by dish name"),
                  include_nutrition: bool = Form(True, description="Include portion calories and macronutrients in training targets"),
                  images_uri: str | None = Form(None, description="Cloud Storage URI containing images, defaults to the project bucket"),
                  download: bool = Form(False, description="Download the result as a dataset.jsonl file attachment")):
    export = await _read_json_file(annotations, "annotations")
    result = convert_export(export, images_uri or f"gs://{get_settings().bucket}",
                            await _read_table(nutrition_table), include_nutrition)
    if download:
        return Response(result.jsonl, media_type="application/x-ndjson",
                        headers={"Content-Disposition": 'attachment; filename="dataset.jsonl"'})
    return ConvertResponse(nutrition=result.nutrition, examples=len(result.examples), images=result.images,
                           warnings=result.warnings, jsonl=result.jsonl)


@router.post("/training/jobs", response_model=JobCreated, tags=["Model Training"],
             summary="Submit dataset to Vertex AI for supervised tuning")
async def create_job(dataset: UploadFile = File(..., description="JSONL dataset file produced by conversion"),
                     base_model: str | None = Form(None, description="Base Gemini model to fine-tune, defaults to server setting"),
                     epochs: int | None = Form(None, description="Number of training epochs between 1 and 100"),
                     adapter_size: int | None = Form(None, description="LoRA adapter size (1, 2, 4, 8, 16, or 32)"),
                     learning_rate_multiplier: float | None = Form(None, description="Learning rate multiplier between 0 and 10"),
                     display_name: str | None = Form(None, description="Custom name for the tuned model in Vertex AI"),
                     check_images: bool = Form(True, description="Verify that referenced images exist in Cloud Storage")):
    try:
        text = (await dataset.read()).decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Dataset file must be UTF-8 encoded") from None
    return training.submit_dataset(text, base_model=base_model, epochs=epochs, adapter_size=adapter_size,
                                   learning_rate_multiplier=learning_rate_multiplier,
                                   display_name=display_name, check_images=check_images)


@router.get("/training/jobs/{job_id}", response_model=JobStatus, tags=["Model Training"],
            summary="Retrieve status and endpoint for a tuning job")
def job_status(job_id: str):
    return vertex.get_job(job_id)


@router.post("/pipeline/train", response_model=PipelineResponse, tags=["Training Pipeline"],
             summary="Run full workflow from raw photos and annotations to model training")
async def pipeline_train(annotations: UploadFile = File(..., description="Exported JSON file from Label Studio"),
                         photos: list[UploadFile] = File(..., description="Image files matching filenames in the annotation export"),
                         nutrition_table: UploadFile | None = File(None, description="Optional nutrition table per 100g by dish name"),
                         include_nutrition: bool = Form(True, description="Include portion calories and macronutrients in training targets"),
                         augment_preset: Literal["none", "mild", "strong", "all"] = Form("none",
                             description="Preset defining visual transforms applied to expand the dataset"),
                         augment_transforms: str | None = Form(None, description="Custom comma-separated transform chain"),
                         seed: int = Form(42, description="Random seed for deterministic augmentation outputs"),
                         base_model: str | None = Form(None, description="Base Gemini model to fine-tune, defaults to server setting"),
                         epochs: int | None = Form(None, description="Number of training epochs between 1 and 100"),
                         adapter_size: int | None = Form(None, description="LoRA adapter size (1, 2, 4, 8, 16, or 32)"),
                         learning_rate_multiplier: float | None = Form(None, description="Learning rate multiplier between 0 and 10"),
                         display_name: str | None = Form(None, description="Custom name for the tuned model in Vertex AI")):
    export = await _read_json_file(annotations, "annotations")
    table = await _read_table(nutrition_table)
    data = {}
    for p in photos:
        _photo_mime(p)
        data[p.filename] = await p.read()
    return pipeline.run(export, data, preset=augment_preset, transforms=augment_transforms, seed=seed,
                        nutrition_table=table, include_nutrition=include_nutrition,
                        base_model=base_model, epochs=epochs, adapter_size=adapter_size,
                        learning_rate_multiplier=learning_rate_multiplier, display_name=display_name)


@router.get("/augment/transforms", tags=["Augmentation"], summary="List available image transforms and presets")
def list_transforms():
    return {
        "transforms": {name: desc for name, (_, desc) in augment.TRANSFORMS.items()},
        "syntax": "Chain transforms with plus signs, e.g. flip+rotate:25+noise:45",
        "presets": augment.PRESETS,
    }


@router.post("/augment", tags=["Augmentation"], summary="Generate augmented image variants as a ZIP archive",
             response_class=Response)
async def make_variants(photo: UploadFile = File(...),
                        items: str | None = Form(None, description='Optional JSON array of boxes with names and weights to recompute'),
                        preset: Literal["none", "mild", "strong", "all"] = Form("mild", description="Preset of augmentations to generate"),
                        transforms: str | None = Form(None, description="Custom comma-separated transform chain, e.g. noise:30,rotate:20"),
                        seed: int = Form(42, description="Random seed for deterministic transform generation"),
                        include_original: bool = Form(True, description="Include original unmodified photo in output archive")):
    _photo_mime(photo)
    try:
        parsed = json.loads(items) if items else []
    except ValueError:
        raise HTTPException(400, "Items parameter contains invalid JSON") from None
    specs = augment.resolve_specs(preset, transforms)
    variants = augment.generate(await photo.read(), parsed, specs, base_name=clean_name(photo.filename or "photo"),
                                seed=seed, include_original=include_original)
    return Response(augment.build_zip(variants, photo.filename or "photo"), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="variants.zip"'})


@router.post("/recognize", response_model=RecognizeResponse, tags=["Inference"],
             summary="Recognize dishes, bounding boxes, weights, and nutrition")
async def recognize(photo: UploadFile = File(..., description="Food photo to analyze"),
                    model: str | None = Form(None, description="Tuned endpoint resource name or base Gemini model name"),
                    job_id: str | None = Form(None, description="Tuning job ID to automatically resolve the deployed endpoint"),
                    with_nutrition: bool | None = Form(None, description="Request calorie and macronutrient predictions")):
    mime = _photo_mime(photo)
    target, settings, from_job = model, get_settings(), None
    if not target and job_id:
        from_job = vertex.get_job(job_id)
        if from_job["status"] != "succeeded" or not from_job["endpoint"]:
            raise HTTPException(409, f"Training job has not completed successfully (current status {from_job['status']})")
        target = from_job["endpoint"]
    target = target or settings.tuned_endpoint
    if not target:
        raise HTTPException(400, "Provide a model name, a job_id, or set TUNED_ENDPOINT on the server")
    if with_nutrition is None:
        with_nutrition = ("kbzhu" in (from_job["display_name"] or "")) if from_job else settings.tuned_with_nutrition
    return vertex.recognize(await photo.read(), mime, target, with_nutrition)


app.include_router(router)


@app.get("/health", tags=["System"], summary="Service health and project configuration status")
def health():
    s = get_settings()
    return {"ok": True, "project_configured": bool(s.project), "bucket": s.bucket, "location": s.location}


# --- OpenAPI schema patch for Swagger UI file inputs ---------------------------------
# Newer FastAPI + pydantic v2 describe uploaded files as
# `contentMediaType: application/octet-stream`, which Swagger UI does not render as a
# file picker. This rewrites them to `format: binary` and collapses `anyOf [binary, null]`
# into a plain optional file field (removing the "Send empty value" checkbox).

def _fix_binary(node):
    if isinstance(node, dict):
        for value in list(node.values()):
            _fix_binary(value)
        if node.get("contentMediaType") == "application/octet-stream":
            node.pop("contentMediaType")
            node.setdefault("format", "binary")
        variants = node.get("anyOf")
        if variants:
            non_null = [v for v in variants if v.get("type") != "null"]
            if len(non_null) == 1 and non_null[0].get("format") == "binary":
                node.pop("anyOf")
                node.update(non_null[0])
    elif isinstance(node, list):
        for item in node:
            _fix_binary(item)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        openapi_version=app.openapi_version,
        routes=app.routes,
    )
    _fix_binary(schema)
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi