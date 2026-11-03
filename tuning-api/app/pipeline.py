import re

from app import augment, training, vertex
from app.config import get_settings
from app.converter import ConvertError, build_example, clean_name, mime_for, parse_label_studio, to_jsonl


def safe_name(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]+", "_", name)


def run(export, photos: dict[str, bytes], preset: str = "none", transforms: str | None = None,
        seed: int = 42, nutrition_table: dict | None = None, include_nutrition: bool = True, **tuning) -> dict:
    settings = get_settings()
    images, warnings = parse_label_studio(export, nutrition_table, include_nutrition)
    if not images:
        raise ConvertError("annotations do not contain any valid examples: " + "; ".join(warnings))

    uploaded_by_name = {clean_name(n): data for n, data in photos.items()}
    missing = [i.file_name for i in images if i.file_name not in uploaded_by_name]
    if missing:
        raise ConvertError(
            f"photos not uploaded for {len(missing)} of {len(images)} annotated images: {', '.join(missing[:5])}"
            + (" ..." if len(missing) > 5 else "") + ". Filename must match the name in annotations.")
    unsupported = [i.file_name for i in images if mime_for(i.file_name) is None]
    if unsupported:
        raise ConvertError(f"unsupported format (expected webp, jpg, png): {', '.join(unsupported)}")

    specs = augment.resolve_specs(preset, transforms) if (preset not in (None, "none") or transforms) else []

    run_id = training.new_run_id()
    folder = f"images/{run_id}"
    base_uri = f"gs://{settings.bucket}/{folder}"
    examples, uploaded, variants_total = [], 0, 0

    for img in images:
        mime = mime_for(img.file_name)
        assert mime is not None
        data = uploaded_by_name[img.file_name]
        name = safe_name(img.file_name)
        vertex.gcs_upload(f"{folder}/{name}", data, mime)
        uploaded += 1
        examples.append(build_example(f"{base_uri}/{name}", mime, img.items, include_nutrition))
        if specs:
            for v in augment.generate(data, img.items, specs, base_name=name, seed=seed, include_original=False):
                if not v.items:
                    warnings.append(f"{v.file_name}: no items remained after augmentation, skipped")
                    continue
                vertex.gcs_upload(f"{folder}/{v.file_name}", v.image, "image/jpeg")
                uploaded += 1
                variants_total += 1
                examples.append(build_example(f"{base_uri}/{v.file_name}", "image/jpeg", v.items, include_nutrition))

    job = training.submit_dataset(to_jsonl(examples), check_images=False, **tuning)
    job["warnings"] = warnings + job["warnings"]
    job.update({"images_uploaded": uploaded, "augmented_variants": variants_total, "images_folder": base_uri})
    return job