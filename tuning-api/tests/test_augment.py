import io
import json
import math
import zipfile

import numpy as np
import pytest
from PIL import Image

from app import augment


def _valid(items):
    for it in items:
        ymin, xmin, ymax, xmax = it["box_2d"]
        assert 0 <= ymin < ymax <= 1000 and 0 <= xmin < xmax <= 1000, it


def _close(a, b, tol=2):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def test_all_presets_run_and_boxes_are_valid(photo_bytes, items):
    for preset in ("mild", "strong"):
        specs = augment.resolve_specs(preset, None)
        variants = augment.generate(photo_bytes, items, specs, "photo.jpg")
        assert len(variants) == len(specs) + 1
        for v in variants:
            Image.open(io.BytesIO(v.image)).verify()
            _valid(v.items)


def test_photometric_transforms_keep_boxes(photo_bytes, items):
    for spec in ["noise:30", "brightness:0.5", "contrast:0.3", "blur:3", "jpeg:5", "lowres:0.2", "tint:warm", "gray"]:
        v = augment.generate(photo_bytes, items, [spec], include_original=False)[0]
        assert [i["box_2d"] for i in v.items] == [i["box_2d"] for i in items], spec


def test_lowres_changes_size(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["lowres:0.25"], include_original=False)[0]
    orig = Image.open(io.BytesIO(photo_bytes))
    assert Image.open(io.BytesIO(v.image)).size == (round(orig.size[0] * 0.25), round(orig.size[1] * 0.25))


def test_flip_twice_returns_original_boxes(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["flip+flip"], include_original=False)[0]
    for a, b in zip(v.items, items):
        assert _close(a["box_2d"], b["box_2d"])


def test_flip_box_math(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["flip"], include_original=False)[0]
    for a, b in zip(v.items, items):
        ymin, xmin, ymax, xmax = b["box_2d"]
        assert _close(a["box_2d"], [ymin, 1000 - xmax, ymax, 1000 - xmin])


def test_rotate_zero_is_identity(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["rotate:0"], include_original=False)[0]
    for a, b in zip(v.items, items):
        assert _close(a["box_2d"], b["box_2d"])


def test_rotate_90_box_math(photo_bytes, items):
    w, h = Image.open(io.BytesIO(photo_bytes)).size
    v = augment.generate(photo_bytes, items, ["rotate:90"], include_original=False)[0]
    assert Image.open(io.BytesIO(v.image)).size == (h, w)
    for a, b in zip(v.items, items):
        ymin, xmin, ymax, xmax = b["box_2d"]
        x1, x2, y1, y2 = xmin / 1000 * w, xmax / 1000 * w, ymin / 1000 * h, ymax / 1000 * h
        expected = [(w - x2) / w * 1000, y1 / h * 1000, (w - x1) / w * 1000, y2 / h * 1000]
        assert _close(a["box_2d"], [round(e) for e in expected], tol=3), (a, expected)


def test_rotate_180_then_180_returns_original(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["rotate:180+rotate:180"], include_original=False)[0]
    for a, b in zip(v.items, items):
        assert _close(a["box_2d"], b["box_2d"], tol=3)


def test_rotated_box_contains_the_object_center(photo_bytes, items):
    w, h = Image.open(io.BytesIO(photo_bytes)).size
    v = augment.generate(photo_bytes, items, ["rotate:30"], include_original=False)[0]
    nw, nh = Image.open(io.BytesIO(v.image)).size
    th = math.radians(30)
    for a, b in zip(v.items, items):
        ymin, xmin, ymax, xmax = b["box_2d"]
        dx, dy = (xmin + xmax) / 2000 * w - w / 2, (ymin + ymax) / 2000 * h - h / 2
        cx = dx * math.cos(th) + dy * math.sin(th) + nw / 2
        cy = -dx * math.sin(th) + dy * math.cos(th) + nh / 2
        assert a["box_2d"][1] / 1000 * nw <= cx <= a["box_2d"][3] / 1000 * nw
        assert a["box_2d"][0] / 1000 * nh <= cy <= a["box_2d"][2] / 1000 * nh


def test_crop_drops_items_that_are_mostly_cut(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["crop:0.5"], include_original=False)[0]
    assert [i["name"] for i in v.items] == ["Макароны"]
    _valid(v.items)


def test_zoomout_scales_boxes(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["zoomout:0.5"], include_original=False)[0]
    for a, b in zip(v.items, items):
        ymin, xmin, ymax, xmax = b["box_2d"]
        assert _close(a["box_2d"], [250 + ymin / 2, 250 + xmin / 2, 250 + ymax / 2, 250 + xmax / 2], tol=3)


def test_occlude_removes_one_item_and_paints_it(photo_bytes, items):
    v = augment.generate(photo_bytes, items, ["occlude:Чай"], include_original=False)[0]
    assert [i["name"] for i in v.items] == [i["name"] for i in items if i["name"] != "Чай"]
    src = np.asarray(Image.open(io.BytesIO(photo_bytes)).convert("RGB")).astype(int)
    out = np.asarray(Image.open(io.BytesIO(v.image)).convert("RGB")).astype(int)
    h, w = src.shape[:2]
    tea = next(i for i in items if i["name"] == "Чай")["box_2d"]
    sl = (slice(int(tea[0] / 1000 * h) + 10, int(tea[2] / 1000 * h) - 10), slice(int(tea[1] / 1000 * w) + 10, int(tea[3] / 1000 * w) - 10))
    assert np.abs(src[sl] - out[sl]).mean() > 15
    soup = next(i for i in items if i["name"] == "Суп рассольник")["box_2d"]
    sl2 = (slice(int(soup[0] / 1000 * h) + 40, int(soup[2] / 1000 * h) - 40), slice(int(soup[1] / 1000 * w) + 40, int(soup[3] / 1000 * w) - 40))
    assert np.abs(src[sl2] - out[sl2]).mean() < 25


def test_same_seed_same_result_different_seed_differs(photo_bytes, items):
    a = augment.generate(photo_bytes, items, ["noise:40"], seed=1, include_original=False)[0].image
    b = augment.generate(photo_bytes, items, ["noise:40"], seed=1, include_original=False)[0].image
    c = augment.generate(photo_bytes, items, ["noise:40"], seed=2, include_original=False)[0].image
    assert a == b and a != c


def test_spec_validation():
    with pytest.raises(augment.AugmentError):
        augment.resolve_specs("mild", "wobble:3")
    with pytest.raises(augment.AugmentError):
        augment.resolve_specs("none", None)
    with pytest.raises(augment.AugmentError):
        augment.resolve_specs("bogus", None)
    with pytest.raises(augment.AugmentError):
        augment.resolve_specs("none", "noise:abc")
        augment.generate(b"", [], ["noise:abc"])


def test_bad_items_and_bad_image(photo_bytes, items):
    with pytest.raises(augment.AugmentError):
        augment.generate(photo_bytes, [{"name": "x", "box_2d": [10, 10, 5, 5]}], ["flip"])
    with pytest.raises(augment.AugmentError):
        augment.generate(b"not an image", items, ["flip"])


def test_zip_contains_images_and_manifest(photo_bytes, items):
    variants = augment.generate(photo_bytes, items, ["flip", "noise:20"], "soup.webp")
    z = zipfile.ZipFile(io.BytesIO(augment.build_zip(variants, "soup.webp")))
    names = z.namelist()
    assert "manifest.json" in names and len(names) == 4
    manifest = json.loads(z.read("manifest.json"))
    assert [v["spec"] for v in manifest["variants"]] == ["original", "flip", "noise:20"]