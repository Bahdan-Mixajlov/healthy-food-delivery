import json
import math
import re
from dataclasses import dataclass, field
from urllib.parse import unquote

SYSTEM_INSTRUCTION = (
    "Ты анализируешь фото еды. Найди все продукты и блюда на фото. "
    "Для каждого верни box_2d [ymin, xmin, ymax, xmax] в шкале 0-1000, "
    "name и weight_g. Ответ строго в JSON."
)
USER_TEXT = "Определи блюда на фото, их рамки и вес."
SYSTEM_INSTRUCTION_NUTRITION = (
    "Ты анализируешь фото еды. Найди все продукты и блюда на фото. "
    "Для каждого верни box_2d [ymin, xmin, ymax, xmax] в шкале 0-1000, "
    "name, weight_g (вес порции в граммах), а также calories (ккал), "
    "proteins, fats и carbs (граммы) для всей порции. Ответ строго в JSON."
)
USER_TEXT_NUTRITION = "Определи блюда на фото, их рамки, вес и КБЖУ."

NUTRITION_FIELDS = ("calories", "proteins", "fats", "carbs")
_ALIASES = {
    "calories": {"calories", "kcal", "ккал", "калории", "калорийность"},
    "proteins": {"proteins", "protein", "белки", "белок"},
    "fats": {"fats", "fat", "жиры", "жир"},
    "carbs": {"carbs", "carb", "carbohydrates", "углеводы", "углевод"},
}
_FIELD_BY_ALIAS = {a: f for f, names in _ALIASES.items() for a in names}


def prompts(with_nutrition: bool) -> tuple[str, str]:
    if with_nutrition:
        return SYSTEM_INSTRUCTION_NUTRITION, USER_TEXT_NUTRITION
    return SYSTEM_INSTRUCTION, USER_TEXT


MIME_BY_EXT = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


class ConvertError(ValueError):
    pass


@dataclass
class LabeledImage:
    file_name: str
    items: list[dict]


@dataclass
class ConvertResult:
    examples: list[dict]
    jsonl: str
    images: list[str]
    warnings: list[str] = field(default_factory=list)
    nutrition: bool = False


def to_box_2d(value: dict) -> list[int]:
    x, y, w, h = value["x"], value["y"], value["width"], value["height"]
    box = [y * 10, x * 10, (y + h) * 10, (x + w) * 10]
    return [max(0, min(1000, math.floor(v + 0.5))) for v in box]


def clean_name(raw: str) -> str:
    name = unquote(raw.split("/")[-1])
    return re.sub(r"^[0-9a-f]{8}-", "", name)


def mime_for(name: str) -> str | None:
    if "." not in name:
        return None
    return MIME_BY_EXT.get("." + name.rsplit(".", 1)[-1].lower())


def _parse_weight(text) -> float | None:
    m = re.search(r"\d+(?:[.,]\d+)?", str(text))
    return float(m.group().replace(",", ".")) if m else None


def _clean_number(v: float):
    v = round(float(v), 1)
    return int(v) if v.is_integer() else v


def load_nutrition_table(obj) -> dict[str, dict]:
    if not isinstance(obj, dict):
        raise ConvertError("nutrition table: expected an object {dish_name: {calories, proteins, fats, carbs}} per 100g")
    table = {}
    for name, vals in obj.items():
        if str(name).startswith("_"):
            continue
        ok = isinstance(vals, dict) and all(
            isinstance(vals.get(f), (int, float)) and not isinstance(vals.get(f), bool) and vals[f] >= 0
            for f in NUTRITION_FIELDS)
        if not ok:
            raise ConvertError(f"nutrition table: '{name}' requires non-negative numbers for calories, proteins, fats, carbs (per 100g)")
        table[str(name).strip().lower()] = {f: float(vals[f]) for f in NUTRITION_FIELDS}
    if not table:
        raise ConvertError("nutrition table is empty")
    return table


def portion_nutrition(per100: dict, weight_g: float) -> dict:
    k = weight_g / 100
    out = {"calories": math.floor(per100["calories"] * k + 0.5)}
    out.update({f: _clean_number(per100[f] * k) for f in NUTRITION_FIELDS[1:]})
    return out


def parse_label_studio(export, nutrition_table: dict | None = None, include_nutrition: bool = True) -> tuple[list[LabeledImage], list[str]]:
    if not isinstance(export, list):
        raise ConvertError("expected a JSON array of Label Studio tasks (Export -> JSON)")
    images: list[LabeledImage] = []
    warnings: list[str] = []
    for idx, task in enumerate(export):
        if not isinstance(task, dict):
            warnings.append(f"item #{idx}: not a valid Label Studio task, skipped")
            continue
        raw_name = task.get("file_upload") or (task.get("data") or {}).get("image") or ""
        if not raw_name:
            warnings.append(f"task #{task.get('id', idx)}: no image found, skipped")
            continue
        name = clean_name(raw_name)
        annotations = [a for a in (task.get("annotations") or []) if not a.get("was_cancelled")]
        if not annotations:
            warnings.append(f"{name}: no annotations found, skipped")
            continue

        boxes: dict = {}
        weights: dict = {}
        labeled_nutrition: dict = {}
        for r in annotations[0].get("result", []):
            value = r.get("value", {})
            if r.get("type") == "rectanglelabels" and value.get("rectanglelabels"):
                boxes[r["id"]] = (value["rectanglelabels"][0], to_box_2d(value))
            elif r.get("type") == "textarea" and value.get("text"):
                number = _parse_weight(value["text"][0])
                if number is None:
                    continue
                kind = _FIELD_BY_ALIAS.get(str(r.get("from_name", "")).strip().lower())
                if kind:
                    labeled_nutrition.setdefault(r["id"], {})[kind] = number
                else:
                    weights.setdefault(r["id"], number)

        items = []
        for rid, (label, box) in boxes.items():
            weight = weights.get(rid)
            if weight is None:
                warnings.append(f"{name}: '{label}' is missing weight, item skipped")
                continue
            item = {
                "box_2d": box,
                "name": label,
                "weight_g": int(weight) if float(weight).is_integer() else weight,
            }
            if include_nutrition:
                own = labeled_nutrition.get(rid, {})
                table_item = (nutrition_table or {}).get(label.strip().lower())
                if all(f in own for f in NUTRITION_FIELDS):
                    values = {"calories": math.floor(own["calories"] + 0.5),
                              **{f: _clean_number(own[f]) for f in NUTRITION_FIELDS[1:]}}
                elif table_item is not None:
                    values = portion_nutrition(table_item, weight)
                else:
                    warnings.append(f"{name}: '{label}' lacks nutrition facts (missing in both annotations and table), item skipped")
                    continue
                item.update(values)
            items.append(item)
        if not items:
            warnings.append(f"{name}: no valid items with bounding box and weight, skipped")
            continue
        images.append(LabeledImage(name, items))
    return images, warnings


def build_example(file_uri: str, mime: str, items: list[dict], nutrition: bool = False) -> dict:
    system, user_text = prompts(nutrition)
    answer = json.dumps({"items": items}, ensure_ascii=False, separators=(",", ":"))
    return {
        "systemInstruction": {"role": "system", "parts": [{"text": system}]},
        "contents": [
            {"role": "user", "parts": [
                {"fileData": {"mimeType": mime, "fileUri": file_uri}},
                {"text": user_text},
            ]},
            {"role": "model", "parts": [{"text": answer}]},
        ],
    }


def to_jsonl(examples: list[dict]) -> str:
    return "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in examples)


def convert_export(export, image_base_uri: str, nutrition_table: dict | None = None,
                   include_nutrition: bool = True) -> ConvertResult:
    images, warnings = parse_label_studio(export, nutrition_table, include_nutrition)
    examples = []
    base = image_base_uri.rstrip("/")
    for img in images:
        mime = mime_for(img.file_name)
        if mime is None:
            warnings.append(f"{img.file_name}: unsupported format (expected webp, jpg, png), skipped")
            continue
        examples.append(build_example(f"{base}/{img.file_name}", mime, img.items, include_nutrition))
    if not examples:
        hint = ""
        if include_nutrition and any("lacks nutrition facts" in w for w in warnings):
            hint = (" (nutrition facts not found: provide a 100g nutrition table, add calories/proteins/fats/carbs fields in Label Studio, or disable include_nutrition)")
        raise ConvertError("no valid examples found in annotations" + hint + ": " + "; ".join(warnings))
    return ConvertResult(examples, to_jsonl(examples), [i.file_name for i in images], warnings, include_nutrition)


def inspect_dataset(text: str) -> tuple[int, list[str]]:
    uris: list[str] = []
    count = 0
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            user, model = row["contents"][0], row["contents"][1]
            if user["role"] != "user" or model["role"] != "model":
                raise ValueError("expected user -> model message pair")
            json.loads(model["parts"][0]["text"])
            for part in user["parts"]:
                if "fileData" in part:
                    uri = part["fileData"]["fileUri"]
                    if not uri.startswith("gs://"):
                        raise ValueError("fileUri must start with gs://")
                    uris.append(uri)
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise ConvertError(f"dataset line {n} is invalid: {e}") from e
        count += 1
    if count == 0:
        raise ConvertError("dataset is empty")
    return count, sorted(set(uris))


def dataset_format(text: str) -> str:
    kinds = set()
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            answer = json.loads(json.loads(line)["contents"][1]["parts"][0]["text"])
            for it in (answer["items"] if isinstance(answer, dict) else answer):
                kinds.add("nutrition" if all(f in it for f in NUTRITION_FIELDS) else "basic")
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise ConvertError(f"dataset line {n} is invalid: {e}") from e
    if len(kinds) > 1:
        raise ConvertError("dataset contains a mix of items with and without nutrition facts: use a single format")
    return kinds.pop() if kinds else "basic"