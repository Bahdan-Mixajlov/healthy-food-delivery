import json

import pytest

from app import converter


def test_matches_hand_made_dataset(export, hand_dataset):
    result = converter.convert_export(export, "gs://food-recognition-bucket", include_nutrition=False)
    assert result.examples == hand_dataset
    assert result.warnings == []
    assert result.images == ["soup-macaroni-kotleka-white-bread.webp"]


def test_jsonl_is_one_line_per_example(export):
    result = converter.convert_export(export, "gs://b/folder/", include_nutrition=False)
    lines = result.jsonl.strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["contents"][0]["parts"][0]["fileData"]["fileUri"] == \
        "gs://b/folder/soup-macaroni-kotleka-white-bread.webp"


def test_item_without_weight_is_skipped_with_warning(export):
    for r in export[0]["annotations"][0]["result"]:
        if r["type"] == "textarea" and r["value"]["text"] == ["70"]:
            r["value"]["text"] = [""]
    result = converter.convert_export(export, "gs://b", include_nutrition=False)
    assert any("missing weight" in w for w in result.warnings)
    assert len(json.loads(result.examples[0]["contents"][1]["parts"][0]["text"])["items"]) == 3


def test_weight_with_comma_and_unit(export):
    for r in export[0]["annotations"][0]["result"]:
        if r["type"] == "textarea" and r["value"]["text"] == ["280"]:
            r["value"]["text"] = ["280,5 г"]
    items = converter.parse_label_studio(export, include_nutrition=False)[0][0].items
    assert any(i["weight_g"] == 280.5 for i in items)


def test_rejects_non_list_and_empty():
    with pytest.raises(converter.ConvertError):
        converter.convert_export({"a": 1}, "gs://b", include_nutrition=False)
    with pytest.raises(converter.ConvertError):
        converter.convert_export([], "gs://b", include_nutrition=False)


def test_unsupported_image_format(export):
    export[0]["file_upload"] = "abc12345-photo.bmp"
    with pytest.raises(converter.ConvertError):
        converter.convert_export(export, "gs://b", include_nutrition=False)


def test_box_rounding_half_up():
    box = converter.to_box_2d({"x": 56.25, "y": 28.478260869565215, "width": 14.99999999999998, "height": 18.043478260869577})
    assert box == [285, 563, 465, 712]


def test_inspect_dataset(hand_dataset):
    text = "\n".join(json.dumps(r, ensure_ascii=False) for r in hand_dataset)
    count, uris = converter.inspect_dataset(text)
    assert count == 1 and uris == ["gs://food-recognition-bucket/soup-macaroni-kotleka-white-bread.webp"]


@pytest.mark.parametrize("bad", ["", "not json", '{"contents": []}',
                                 '{"contents":[{"role":"user","parts":[]},{"role":"model","parts":[{"text":"not json"}]}]}'])
def test_inspect_dataset_rejects_bad(bad):
    with pytest.raises(converter.ConvertError):
        converter.inspect_dataset(bad)


TABLE = {
    "Белый хлеб": {"calories": 265, "proteins": 8.1, "fats": 3.2, "carbs": 49},
    "Котлета": {"calories": 245, "proteins": 14, "fats": 16, "carbs": 10},
    "Суп рассольник": {"calories": 45, "proteins": 1.5, "fats": 2, "carbs": 5.5},
    "Макароны": {"calories": 113, "proteins": 3.6, "fats": 0.4, "carbs": 23},
    "Чай": {"calories": 1, "proteins": 0, "fats": 0, "carbs": 0.3},
}


def _answer(example):
    return json.loads(example["contents"][1]["parts"][0]["text"])["items"]


def test_nutrition_from_table_is_per_portion(export):
    result = converter.convert_export(export, "gs://b", converter.load_nutrition_table(TABLE))
    assert result.nutrition is True and result.warnings == []
    by_name = {i["name"]: i for i in _answer(result.examples[0])}
    assert by_name["Суп рассольник"] == {"box_2d": [459, 160, 987, 549], "name": "Суп рассольник", "weight_g": 280,
                                         "calories": 126, "proteins": 4.2, "fats": 5.6, "carbs": 15.4}
    assert (by_name["Белый хлеб"]["calories"], by_name["Белый хлеб"]["proteins"]) == (186, 5.7)
    assert by_name["Чай"]["calories"] == 2 and by_name["Чай"]["proteins"] == 0
    system = result.examples[0]["systemInstruction"]["parts"][0]["text"]
    assert "calories" in system and "КБЖУ" in result.examples[0]["contents"][0]["parts"][1]["text"]
    assert list(_answer(result.examples[0])[0]) == ["box_2d", "name", "weight_g", "calories", "proteins", "fats", "carbs"]


def test_nutrition_labeled_in_label_studio_wins_over_table(export):
    rid = "y3vds6NgBs"
    for name, text in [("calories", "200"), ("proteins", "6,5"), ("fats", "2"), ("carbs", "40")]:
        export[0]["annotations"][0]["result"].append({"id": rid, "from_name": name, "to_name": "image", "type": "textarea",
                                                      "value": {"x": 0, "y": 0, "width": 1, "height": 1, "text": [text]}})
    result = converter.convert_export(export, "gs://b", converter.load_nutrition_table(TABLE))
    bread = next(i for i in _answer(result.examples[0]) if i["name"] == "Белый хлеб")
    assert (bread["calories"], bread["proteins"], bread["fats"], bread["carbs"], bread["weight_g"]) == (200, 6.5, 2, 40, 70)


def test_labeled_nutrition_alone_is_enough(export):
    for r in list(export[0]["annotations"][0]["result"]):
        if r["type"] == "rectanglelabels":
            for name in ("ккал", "белки", "жиры", "углеводы"):
                export[0]["annotations"][0]["result"].append({"id": r["id"], "from_name": name, "to_name": "image",
                                                              "type": "textarea", "value": {"text": ["10"]}})
    result = converter.convert_export(export, "gs://b")
    assert all(i["calories"] == 10 for i in _answer(result.examples[0]))


def test_missing_nutrition_is_a_clear_error(export):
    with pytest.raises(converter.ConvertError) as e:
        converter.convert_export(export, "gs://b")
    assert "nutrition facts" in str(e.value) and "include_nutrition" in str(e.value)


def test_dish_missing_from_table_is_skipped_with_warning(export):
    table = {k: v for k, v in TABLE.items() if k != "Чай"}
    result = converter.convert_export(export, "gs://b", converter.load_nutrition_table(table))
    assert any("Чай" in w and "lacks nutrition facts" in w for w in result.warnings)
    assert "Чай" not in [i["name"] for i in _answer(result.examples[0])]


def test_nutrition_table_validation():
    assert "белый хлеб" in converter.load_nutrition_table({"_comment": "x", **TABLE})
    for bad in ([], {}, {"x": {"calories": 1}}, {"x": {"calories": -1, "proteins": 0, "fats": 0, "carbs": 0}},
                {"x": {"calories": "1", "proteins": 0, "fats": 0, "carbs": 0}}):
        with pytest.raises(converter.ConvertError):
            converter.load_nutrition_table(bad)


def test_dataset_format_detection(export):
    basic = converter.convert_export(export, "gs://b", include_nutrition=False).jsonl
    rich = converter.convert_export(export, "gs://b", converter.load_nutrition_table(TABLE)).jsonl
    assert converter.dataset_format(basic) == "basic" and converter.dataset_format(rich) == "nutrition"
    with pytest.raises(converter.ConvertError):
        converter.dataset_format(basic + rich)