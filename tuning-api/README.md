# Food Recognition Model Fine-Tuning Automation API

A FastAPI service where Label Studio annotations are converted into a dataset, the dataset is sent to Gemini fine-tuning on Vertex AI, and the training status is retrieved with a separate request. It also includes a photo distortion generator and a recognition endpoint.

| #   | endpoint                      | what it does                                                                                                      |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /convert`               | Label Studio annotations (`export.json`) -> `dataset.jsonl` (dish, box, weight, and portion nutrition facts)      |
| 2   | `POST /training/jobs`         | sends the dataset to training and returns a `job_id`                                                              |
| 2   | `GET /training/jobs/{job_id}` | training status (`pending`, `running`, `succeeded`, `failed`, `cancelled`) and the endpoint of the finished model |
| 3   | `POST /pipeline/train`        | photos + annotations -> everything at once (uses 1 and 2) and returns a `job_id` for status tracking              |
| 4   | `POST /augment`               | distorted photo variants (noise, brightness, rotations) with recalculated boxes packaged as a zip                 |
| 4   | `GET /augment/transforms`     | list of distortions and ready-made presets                                                                        |
| 5   | `POST /recognize`             | photo -> dishes, boxes, weight (fine-tuned or base model)                                                         |

Interactive documentation with a "Try it out" button is available at `/docs`.

## Running in Cloud Shell

```bash
unzip tuning-api.zip && cd tuning-api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export GCP_PROJECT=843555852216
export GCS_BUCKET=food-recognition-bucket
export TUNED_ENDPOINT=projects/843555852216/locations/us/endpoints/202591614487494656
uvicorn app.main:app --port 8080
```

Then use "Web Preview" -> port 8080 -> append `/docs` to the address.

Environment variables (see `.env.example`):

| variable         | default                   | purpose                                                        |
| ---------------- | ------------------------- | -------------------------------------------------------------- |
| `GCP_PROJECT`    | none, required            | Google Cloud project                                           |
| `GCP_LOCATION`   | `us-central1`             | region of the tuning jobs (the status is also fetched from it) |
| `GCS_BUCKET`     | `food-recognition-bucket` | bucket for photos and datasets                                 |
| `BASE_MODEL`     | `gemini-3.1-flash-lite`   | which model to fine-tune                                       |
| `TUNED_ENDPOINT` | none                      | default endpoint for `/recognize`                              |
| `API_KEY`        | none                      | if set, requests must include the `X-API-Key` header           |

Permissions: the user or service account needs the **Vertex AI User** role and write access to the bucket (**Storage Object Admin**). In Cloud Shell, your own account permissions apply.

## Request examples

```bash
# 1. annotations -> dataset (dataset.jsonl file)
curl -X POST localhost:8080/convert -F annotations=@export.json \
  -F nutrition_table=@examples/nutrition_table.example.json -F download=true -o dataset.jsonl

# 2. send the dataset to training and check the status
curl -X POST localhost:8080/training/jobs -F dataset=@dataset.jsonl -F epochs=5
curl localhost:8080/training/jobs/<job_id>

# 3. everything at once (photos and annotations plus distorted copies)
curl -X POST localhost:8080/pipeline/train \
  -F annotations=@export.json -F photos=@soup-macaroni-kotleka-white-bread.webp \
  -F nutrition_table=@examples/nutrition_table.example.json -F augment_preset=mild -F epochs=5
curl localhost:8080/training/jobs/<job_id>        # job_id from the response

# 4. distortions with presets and custom parameters
curl -X POST localhost:8080/augment -F photo=@photo.jpg -F preset=strong \
  -F 'transforms=noise:30,flip+rotate:20' -F 'items=[{"name":"Tea","box_2d":[109,300,443,524],"weight_g":220}]' -o variants.zip

# 5. recognition using model or job_id (defaults to TUNED_ENDPOINT)
#    for a model trained with nutrition values the format is detected from the job_id
curl -X POST localhost:8080/recognize -F photo=@photo.jpg
curl -X POST localhost:8080/recognize -F photo=@photo.jpg -F job_id=<job_id>
curl -X POST localhost:8080/recognize -F photo=@photo.jpg -F model=gemini-3.1-flash-lite   # base model for comparison
```

## Nutrition values

The model can be trained to return not only the dish, box, and weight, but also the nutritional values of the portion.

```json
{
  "items": [
    {
      "box_2d": [459, 160, 987, 549],
      "name": "Pickle soup",
      "weight_g": 280,
      "calories": 126,
      "proteins": 4.2,
      "fats": 5.6,
      "carbs": 15.4
    }
  ]
}
```

This is enabled by default with `include_nutrition=true`. The correct training answers come from two sources:

1. **Fields in Label Studio.** If a region has text fields named `calories`, `proteins`, `fats`, `carbs` (the aliases `ккал`, `белки`, `жиры`, `углеводы` are also accepted), they are used directly as per-portion values.
2. **A per-100 g table** (`nutrition_table` JSON, example in `examples/nutrition_table.example.json`), where portion nutrition = value per 100 g × weight / 100. Fields from Label Studio take precedence over the table when present.

If a dish has neither, the item is skipped with a warning. If no examples are left, the service stops and explains what to add. To train without nutrition values, set `include_nutrition=false`.

Important notes:

- The numbers in the example table are approximate and only for demonstration. The model learns the exact values provided in training, so take them from your own dish database or a reference source.
- A model trained without nutrition values cannot be upgraded to include them, so a new training run on data with nutrition is required. Examples with and without nutrition cannot be mixed in one dataset: the service validates format consistency.
- The recognition prompt must match the training prompt. For models trained with nutrition values, the job name ends with `-kbzhu`, and `/recognize` resolves the format automatically when given a `job_id`. For custom endpoints, set `with_nutrition=true` or configure the environment variable `TUNED_WITH_NUTRITION=true`.
- The model returns an estimate from a photo rather than an exact measurement, and the accuracy of the nutrition values depends on the accuracy of portion weights and reference tables.

## What is sent to training

- `POST /training/jobs` sends exactly the dataset you uploaded.
- `POST /pipeline/train` builds the dataset from all annotated photos in the request (plus distorted copies if `augment_preset` is set) and starts one training job. Photos without annotations and items without weight or nutrition are skipped with a warning in the response. A missing photo file or an unsupported format stops the request before anything is uploaded.
- Every run starts from the base model and learns only from the data in that request. Previous runs and earlier fine-tuned models are not extended. To train on all your data, send it together.
- The service does not set aside a separate validation set, so all examples go into training.

## How it works

- `app/converter.py` converts Label Studio percentage boxes to `box_2d` format (0-1000 scale, order `[ymin, xmin, ymax, xmax]`), builds dataset rows, and validates the output dataset.
- `app/training.py` validates the dataset and parameters, uploads it to Cloud Storage, and starts tuning.
- `app/vertex.py` handles Google Cloud operations including Cloud Storage, tuning jobs, and model calls.
- `app/pipeline.py` coordinates the combined pipeline using the converter and training modules.
- `app/augment.py` manages image distortions and bounding box recalculations.

Photos from `/pipeline/train` are uploaded to `gs://<bucket>/images/<run_id>/`, while the dataset is stored in `gs://<bucket>/datasets/<run_id>/dataset.jsonl`. A photo filename must match the name in the annotations; the Label Studio prefix (such as `974ffc18-`) is optional.

### Distortions

A distortion is written as `name` or `name:parameter`, and several can be chained with `+`, for example `flip+rotate:25+noise:45`. Available options: `noise`, `brightness`, `contrast`, `blur`, `jpeg`, `lowres`, `tint`, `gray`, `flip`, `rotate`, `crop`, `zoomout`, and `occlude` (descriptions are available via `GET /augment/transforms`). The result is repeatable with the same `seed`.

Limitations: for rotation angles that are not multiples of 90 degrees, the box becomes the bounding rectangle of the rotated box, so it is wider than the dish itself. Perspective skew and manual additions of new food items are not automated, and `occlude` fills the dish area with the surrounding background color.

### Cost

Training costs roughly `tokens per example × number of examples × epochs × $3 / 1,000,000`. As a reference from a previous run, 54,880 tokens cost $0.1646. One photo example uses around 1,400 tokens. For instance, 13 examples (one photo plus the `mild` preset) across 5 epochs equal roughly 89,000 tokens, which is about $0.27.
