import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app import converter, vertex
from app.main import app

client = TestClient(app)
PHOTO_NAME = "soup-macaroni-kotleka-white-bread.webp"


class FakeCloud:
    def __init__(self):
        self.objects: dict[str, bytes | str] = {}
        self.tuning_calls: list[dict] = []
        self.recognize_calls: list[tuple[str, bool]] = []
        self.jobs = {"12345678901234": {
            "job_id": "12345678901234", "status": "succeeded", "state": "JOB_STATE_SUCCEEDED",
            "created_at": "2026-10-23T14:36:56+00:00", "started_at": None, "finished_at": None,
            "base_model": "gemini-3.1-flash-lite", "display_name": "x",
            "model": "projects/1/locations/us/models/9@1",
            "endpoint": "projects/1/locations/us/endpoints/777", "error": None}}


@pytest.fixture
def cloud(monkeypatch):
    c = FakeCloud()
    monkeypatch.setenv("GCS_BUCKET", "test-bucket")
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("TUNED_ENDPOINT", raising=False)
    monkeypatch.setattr(vertex, "gcs_upload", lambda path, data, ct: c.objects.__setitem__(path, data) or f"gs://test-bucket/{path}")
    monkeypatch.setattr(vertex, "gcs_exists", lambda uri: uri.removeprefix("gs://test-bucket/") in c.objects)

    def start(dataset_uri, **kw):
        c.tuning_calls.append({"dataset_uri": dataset_uri, **kw})
        return {"job_id": "12345678901234", "state": "JOB_STATE_PENDING", "status": "pending"}

    def get_job(job_id):
        if job_id not in c.jobs:
            raise vertex.JobNotFound("not found")
        return c.jobs[job_id]

    monkeypatch.setattr(vertex, "start_tuning", start)
    monkeypatch.setattr(vertex, "get_job", get_job)

    def recognize(image, mime, model, with_nutrition=False):
        c.recognize_calls.append((model, with_nutrition))
        return {"model": model, "with_nutrition": with_nutrition,
                "items": [{"name": "Tea", "box_2d": [1, 2, 3, 4], "weight_g": 200}], "raw_response": "[]", "parse_error": None}

    monkeypatch.setattr(vertex, "recognize", recognize)
    monkeypatch.delenv("TUNED_WITH_NUTRITION", raising=False)
    return c


def _table_file():
    return ("nutrition_table.json", open("tests/data/nutrition_table.json", "rb").read(), "application/json")


NO_NUTRITION = {"include_nutrition": "false"}


def _export_file():
    return ("export.json", open("tests/data/export.json", "rb").read(), "application/json")


def test_convert_returns_dataset(cloud, hand_dataset):
    r = client.post("/convert", files={"annotations": _export_file()},
                    data={"images_uri": "gs://food-recognition-bucket", **NO_NUTRITION})
    assert r.status_code == 200
    body = r.json()
    assert body["examples"] == 1 and body["warnings"] == []
    assert [json.loads(line) for line in body["jsonl"].splitlines()] == hand_dataset


def test_convert_download_file(cloud):
    r = client.post("/convert", files={"annotations": _export_file()}, data={"download": "true", **NO_NUTRITION})
    assert r.headers["content-type"].startswith("application/x-ndjson")
    assert "dataset.jsonl" in r.headers["content-disposition"]
    assert "gs://test-bucket/" + PHOTO_NAME in r.text


def test_convert_bad_input(cloud):
    r = client.post("/convert", files={"annotations": ("x.json", b"not json", "application/json")})
    assert r.status_code == 400
    r = client.post("/convert", files={"annotations": ("x.json", b'{"a": 1}', "application/json")})
    assert r.status_code == 400 and "array" in r.json()["error"]


def _dataset_bytes():
    return open("tests/data/dataset.jsonl", "rb").read()


def test_training_job_created_and_status(cloud):
    cloud.objects[PHOTO_NAME] = b"img"
    r = client.post("/training/jobs", files={"dataset": ("dataset.jsonl", _dataset_bytes().replace(b"food-recognition-bucket", b"test-bucket"))},
                    data={"epochs": "5", "adapter_size": "2", "learning_rate_multiplier": "1", "display_name": "demo"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_id"] == "12345678901234" and body["status"] == "pending"
    assert body["status_url"] == "/training/jobs/12345678901234"
    call = cloud.tuning_calls[0]
    assert call["dataset_uri"].startswith("gs://test-bucket/datasets/") and call["dataset_uri"].endswith("/dataset.jsonl")
    assert (call["epochs"], call["adapter_size"], call["learning_rate_multiplier"], call["display_name"]) == (5, 2, 1.0, "demo")
    assert any(k.startswith("datasets/") for k in cloud.objects)
    assert "examples" in body["warnings"][0]

    s = client.get(body["status_url"])
    assert s.status_code == 200 and s.json()["status"] == "succeeded" and s.json()["endpoint"].endswith("/777")


def test_training_rejects_missing_images(cloud):
    r = client.post("/training/jobs", files={"dataset": ("dataset.jsonl", _dataset_bytes())})
    assert r.status_code == 400 and "missing" in r.json()["error"]
    assert cloud.tuning_calls == []
    r = client.post("/training/jobs", files={"dataset": ("dataset.jsonl", _dataset_bytes())}, data={"check_images": "false"})
    assert r.status_code == 200


@pytest.mark.parametrize("field,value", [("adapter_size", "3"), ("epochs", "0"), ("epochs", "500"), ("learning_rate_multiplier", "-1")])
def test_training_rejects_bad_params(cloud, field, value):
    r = client.post("/training/jobs", files={"dataset": ("d.jsonl", _dataset_bytes())}, data={"check_images": "false", field: value})
    assert r.status_code == 400


def test_training_rejects_broken_dataset(cloud):
    r = client.post("/training/jobs", files={"dataset": ("d.jsonl", b"not json")})
    assert r.status_code == 400


def test_status_unknown_and_malformed_job(cloud):
    assert client.get("/training/jobs/99999999999999").status_code == 404


def test_pipeline_without_augmentation(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()), ("photos", (PHOTO_NAME, photo_bytes, "image/webp"))], data=NO_NUTRITION)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_id"] == "12345678901234" and body["status_url"].endswith(body["job_id"])
    assert body["examples"] == 1 and body["images_uploaded"] == 1 and body["augmented_variants"] == 0
    dataset = next(v for k, v in cloud.objects.items() if k.startswith("datasets/"))
    count, uris = converter.inspect_dataset(dataset)
    assert count == 1 and all(u.removeprefix("gs://test-bucket/") in cloud.objects for u in uris)


def test_pipeline_with_augmentation(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()), ("photos", (PHOTO_NAME, photo_bytes, "image/webp"))],
                    data={"augment_preset": "mild", "epochs": "3", **NO_NUTRITION})
    body = r.json()
    assert r.status_code == 200, r.text
    assert body["augmented_variants"] == 12 and body["examples"] == 13 and body["images_uploaded"] == 13
    dataset = next(v for k, v in cloud.objects.items() if k.startswith("datasets/"))
    count, uris = converter.inspect_dataset(dataset)
    assert count == 13 and len(uris) == 13 and all(u.removeprefix("gs://test-bucket/") in cloud.objects for u in uris)
    flipped = [json.loads(line) for line in dataset.splitlines() if "flip" in line][0]
    answer = json.loads(flipped["contents"][1]["parts"][0]["text"])["items"]
    assert answer[0]["box_2d"] == [465, 110, 617, 349]
    assert cloud.tuning_calls[0]["epochs"] == 3


def test_pipeline_matches_photo_with_label_studio_prefix(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()),
                                              ("photos", ("974ffc18-" + PHOTO_NAME, photo_bytes, "image/webp"))], data=NO_NUTRITION)
    assert r.status_code == 200, r.text


def test_pipeline_reports_missing_photos(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()), ("photos", ("other.jpg", photo_bytes, "image/jpeg"))], data=NO_NUTRITION)
    assert r.status_code == 400 and PHOTO_NAME in r.json()["error"]
    assert cloud.objects == {} and cloud.tuning_calls == []


def test_pipeline_rejects_unknown_preset(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()), ("photos", (PHOTO_NAME, photo_bytes, "image/webp"))],
                    data={"augment_preset": "extreme"})
    assert r.status_code == 422


def test_augment_endpoint_returns_zip(cloud, photo_bytes, items):
    r = client.post("/augment", files={"photo": ("soup.jpg", photo_bytes, "image/jpeg")},
                    data={"items": json.dumps(items, ensure_ascii=False), "preset": "none", "transforms": "flip,rotate:30+noise:20"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    manifest = json.loads(z.read("manifest.json"))
    assert [v["spec"] for v in manifest["variants"]] == ["original", "flip", "rotate:30+noise:20"]
    assert all(v["file"] in z.namelist() for v in manifest["variants"])


def test_augment_without_items_returns_images_only(cloud, photo_bytes):
    r = client.post("/augment", files={"photo": ("soup.jpg", photo_bytes, "image/jpeg")}, data={"preset": "mild"})
    assert r.status_code == 200
    assert len(zipfile.ZipFile(io.BytesIO(r.content)).namelist()) == 14


def test_augment_errors(cloud, photo_bytes):
    f = {"photo": ("soup.jpg", photo_bytes, "image/jpeg")}
    assert client.post("/augment", files=f, data={"preset": "none"}).status_code == 400
    assert client.post("/augment", files=f, data={"transforms": "wobble"}).status_code == 400
    assert client.post("/augment", files=f, data={"items": "not json"}).status_code == 400
    assert client.post("/augment", files={"photo": ("soup.txt", b"x", "text/plain")}).status_code == 400


def test_list_transforms(cloud):
    body = client.get("/augment/transforms").json()
    assert "rotate" in body["transforms"] and "mild" in body["presets"] and "strong" in body["presets"]


def test_recognize_by_model_job_and_default(cloud, photo_bytes, monkeypatch):
    f = {"photo": ("p.jpg", photo_bytes, "image/jpeg")}
    assert client.post("/recognize", files=f, data={"model": "projects/1/locations/us/endpoints/5"}).json()["model"].endswith("/5")
    assert client.post("/recognize", files=f, data={"job_id": "12345678901234"}).json()["model"].endswith("/777")
    assert client.post("/recognize", files=f).status_code == 400
    monkeypatch.setenv("TUNED_ENDPOINT", "projects/1/locations/us/endpoints/9")
    assert client.post("/recognize", files=f).json()["model"].endswith("/9")


def test_recognize_unfinished_job(cloud, photo_bytes):
    cloud.jobs["12345678901234"]["status"] = "running"
    r = client.post("/recognize", files={"photo": ("p.jpg", photo_bytes, "image/jpeg")}, data={"job_id": "12345678901234"})
    assert r.status_code == 409


def test_parse_model_output_variants():
    assert vertex.parse_model_output('```json\n[{"name":"a"}]\n```') == ([{"name": "a"}], None)
    assert vertex.parse_model_output('{"items":[{"name":"a"}]}') == ([{"name": "a"}], None)
    items, err = vertex.parse_model_output('[{"name": "broken')
    assert items is None and err is not None and "JSON" in err


def test_api_key(cloud, monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    assert client.get("/augment/transforms").status_code == 401
    assert client.get("/augment/transforms", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/augment/transforms", headers={"X-API-Key": "secret"}).status_code == 200
    assert client.get("/health").status_code == 200


def test_missing_project_is_reported(monkeypatch):
    monkeypatch.delenv("GCP_PROJECT", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    r = client.get("/training/jobs/12345678901234")
    assert r.status_code == 500 and "GCP_PROJECT" in r.json()["error"]


def test_convert_with_nutrition_table(cloud):
    r = client.post("/convert", files={"annotations": _export_file(), "nutrition_table": _table_file()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["nutrition"] is True
    answer = json.loads(json.loads(body["jsonl"])["contents"][1]["parts"][0]["text"])["items"]
    assert {"calories", "proteins", "fats", "carbs"} <= set(answer[0])


def test_convert_without_nutrition_source_explains_what_to_do(cloud):
    r = client.post("/convert", files={"annotations": _export_file()})
    assert r.status_code == 400 and "nutrition table" in r.json()["error"]


def test_convert_bad_table(cloud):
    r = client.post("/convert", files={"annotations": _export_file(), "nutrition_table": ("t.json", b'{"x": {"calories": 1}}', "application/json")})
    assert r.status_code == 400 and "nutrition table" in r.json()["error"]


def test_training_dataset_with_nutrition_is_named_and_reported(cloud):
    ds = client.post("/convert", files={"annotations": _export_file(), "nutrition_table": _table_file()}).json()["jsonl"]
    cloud.objects[PHOTO_NAME] = b"img"
    r = client.post("/training/jobs", files={"dataset": ("d.jsonl", ds.replace("food-recognition-bucket", "test-bucket"))})
    assert r.status_code == 200, r.text
    assert r.json()["format"] == "nutrition" and cloud.tuning_calls[0]["display_name"].endswith("-kbzhu")


def test_training_rejects_mixed_dataset(cloud):
    rich = client.post("/convert", files={"annotations": _export_file(), "nutrition_table": _table_file()}).json()["jsonl"]
    basic = client.post("/convert", files={"annotations": _export_file()}, data=NO_NUTRITION).json()["jsonl"]
    r = client.post("/training/jobs", files={"dataset": ("d.jsonl", rich + basic)}, data={"check_images": "false"})
    assert r.status_code == 400 and "mix" in r.json()["error"]


def test_pipeline_with_nutrition_and_augmentation(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()), ("nutrition_table", _table_file()),
                                              ("photos", (PHOTO_NAME, photo_bytes, "image/webp"))],
                    data={"augment_preset": "mild"})
    assert r.status_code == 200, r.text
    assert r.json()["format"] == "nutrition" and r.json()["examples"] == 13
    assert cloud.tuning_calls[0]["display_name"].endswith("-kbzhu")
    dataset = next(v for k, v in cloud.objects.items() if k.startswith("datasets/"))
    rows = [json.loads(json.loads(line)["contents"][1]["parts"][0]["text"])["items"] for line in dataset.splitlines()]
    assert all({"calories", "proteins", "fats", "carbs"} <= set(it) for items in rows for it in items)
    soup = [it for items in rows for it in items if it["name"] == "Суп рассольник"]
    assert {it["calories"] for it in soup} == {126}


def test_pipeline_without_nutrition_source_fails_before_upload(cloud, photo_bytes):
    r = client.post("/pipeline/train", files=[("annotations", _export_file()), ("photos", (PHOTO_NAME, photo_bytes, "image/webp"))])
    assert r.status_code == 400 and "nutrition" in r.json()["error"]
    assert cloud.objects == {} and cloud.tuning_calls == []


def test_recognize_picks_prompt_format(cloud, photo_bytes, monkeypatch):
    f = {"photo": ("p.jpg", photo_bytes, "image/jpeg")}
    ep = "projects/1/locations/us/endpoints/5"
    client.post("/recognize", files=f, data={"model": ep})
    client.post("/recognize", files=f, data={"model": ep, "with_nutrition": "true"})
    cloud.jobs["12345678901234"]["display_name"] = "food-recognition-20261028-aaaaaa-kbzhu"
    client.post("/recognize", files=f, data={"job_id": "12345678901234"})
    client.post("/recognize", files=f, data={"job_id": "12345678901234", "with_nutrition": "false"})
    monkeypatch.setenv("TUNED_ENDPOINT", ep)
    monkeypatch.setenv("TUNED_WITH_NUTRITION", "true")
    client.post("/recognize", files=f)
    assert [w for _, w in cloud.recognize_calls] == [False, True, True, False, True]