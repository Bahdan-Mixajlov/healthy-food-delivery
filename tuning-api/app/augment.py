import io
import json
import math
import re
import zipfile
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

BG = (40, 40, 40)


class AugmentError(ValueError):
    pass


def validate_items(items) -> list[dict]:
    if not isinstance(items, list):
        raise AugmentError("items must be a list of [{name, box_2d, weight_g}]")
    out = []
    for i, it in enumerate(items):
        if not isinstance(it, dict) or not isinstance(it.get("name"), str):
            raise AugmentError(f"items[{i}]: expected an object with a 'name' field")
        box = it.get("box_2d")
        if (not isinstance(box, list) or len(box) != 4
                or not all(isinstance(v, (int, float)) for v in box)
                or not all(0 <= v <= 1000 for v in box) or box[0] >= box[2] or box[1] >= box[3]):
            raise AugmentError(f"items[{i}]: box_2d must be [ymin, xmin, ymax, xmax], numbers 0-1000, min < max")
        out.append({"box_2d": [round(v) for v in box], **{k: v for k, v in it.items() if k != "box_2d"}})
    return out


def _corners(box, w, h):
    ymin, xmin, ymax, xmax = box
    x1, y1, x2, y2 = xmin / 1000 * w, ymin / 1000 * h, xmax / 1000 * w, ymax / 1000 * h
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def _map_items(items, w, h, fn, nw, nh, min_frac=0.0):
    out = []
    for it in items:
        pts = [fn(x, y) for x, y in _corners(it["box_2d"], w, h)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        fx1, fy1, fx2, fy2 = min(xs), min(ys), max(xs), max(ys)
        cx1, cy1, cx2, cy2 = max(0, fx1), max(0, fy1), min(nw, fx2), min(nh, fy2)
        full = (fx2 - fx1) * (fy2 - fy1)
        inside = max(0, cx2 - cx1) * max(0, cy2 - cy1)
        if full <= 0 or inside < max(min_frac, 1e-6) * full:
            continue
        box = [round(cy1 / nh * 1000), round(cx1 / nw * 1000), round(cy2 / nh * 1000), round(cx2 / nw * 1000)]
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        out.append({"box_2d": box, **{k: v for k, v in it.items() if k != "box_2d"}})
    return out


def _num(p, default, lo, hi, name):
    try:
        v = float(default if p is None else p)
    except (TypeError, ValueError):
        raise AugmentError(f"{name}: parameter must be a number") from None
    if not lo <= v <= hi:
        raise AugmentError(f"{name}: parameter must be between {lo} and {hi}")
    return v


def t_noise(img, items, p, rng):
    sigma = _num(p, 25, 0, 255, "noise")
    a = np.asarray(img).astype(np.float32) + rng.normal(0, sigma, (img.size[1], img.size[0], 3))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), items


def t_brightness(img, items, p, rng):
    return ImageEnhance.Brightness(img).enhance(_num(p, 0.5, 0, 5, "brightness")), items


def t_contrast(img, items, p, rng):
    return ImageEnhance.Contrast(img).enhance(_num(p, 0.4, 0, 5, "contrast")), items


def t_blur(img, items, p, rng):
    return img.filter(ImageFilter.GaussianBlur(_num(p, 3, 0, 50, "blur"))), items


def t_jpeg(img, items, p, rng):
    q = int(_num(p, 10, 1, 95, "jpeg"))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=q)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB"), items


def t_lowres(img, items, p, rng):
    s = _num(p, 0.3, 0.02, 1, "lowres")
    w, h = img.size
    return img.resize((max(16, round(w * s)), max(16, round(h * s))), Image.Resampling.LANCZOS), items


def t_tint(img, items, p, rng):
    k = {"warm": [1.18, 1.0, 0.78], "cold": [0.65, 0.95, 1.35]}.get(str(p or "warm"))
    if k is None:
        raise AugmentError("tint: parameter must be 'warm' or 'cold'")
    a = np.asarray(img).astype(np.float32) * np.array(k)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), items


def t_gray(img, items, p, rng):
    return img.convert("L").convert("RGB"), items


def t_flip(img, items, p, rng):
    w, h = img.size
    return ImageOps.mirror(img), _map_items(items, w, h, lambda x, y: (w - x, y), w, h)


def t_rotate(img, items, p, rng):
    angle = _num(p, 15, -360, 360, "rotate")
    w, h = img.size
    out = img.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC, fillcolor=BG)
    nw, nh = out.size
    th = math.radians(angle)

    def fn(x, y):
        dx, dy = x - w / 2, y - h / 2
        return dx * math.cos(th) + dy * math.sin(th) + nw / 2, -dx * math.sin(th) + dy * math.cos(th) + nh / 2

    return out, _map_items(items, w, h, fn, nw, nh)


def t_crop(img, items, p, rng):
    s = _num(p, 0.6, 0.1, 1, "crop")
    w, h = img.size
    x1, y1 = int(w * (1 - s) / 2), int(h * (1 - s) / 2)
    x2, y2 = int(w * (1 + s) / 2), int(h * (1 + s) / 2)
    out = img.crop((x1, y1, x2, y2))
    nw, nh = out.size
    return out, _map_items(items, w, h, lambda x, y: (x - x1, y - y1), nw, nh, min_frac=0.6)


def t_zoomout(img, items, p, rng):
    s = _num(p, 0.5, 0.1, 1, "zoomout")
    w, h = img.size
    small = img.resize((max(1, int(w * s)), max(1, int(h * s))), Image.Resampling.LANCZOS)
    ox, oy = (w - small.size[0]) // 2, (h - small.size[1]) // 2
    canvas = Image.new("RGB", (w, h), BG)
    canvas.paste(small, (ox, oy))
    return canvas, _map_items(items, w, h, lambda x, y: (x * s + ox, y * s + oy), w, h)


def _ring_color(img, box):
    w, h = img.size
    x1, y1, x2, y2 = box
    pad = max(6, int(0.12 * max(x2 - x1, y2 - y1)))
    ex = (max(0, x1 - pad), max(0, y1 - pad), min(w, x2 + pad), min(h, y2 + pad))
    a = np.asarray(img.crop(ex)).reshape(-1, 3)
    mask = np.ones((ex[3] - ex[1], ex[2] - ex[0]), bool)
    mask[max(0, y1 - ex[1]):y2 - ex[1], max(0, x1 - ex[0]):x2 - ex[0]] = False
    ring = a[mask.reshape(-1)]
    ring = ring if len(ring) else a
    return tuple(int(v) for v in np.median(ring, axis=0))


def t_occlude(img, items, p, rng):
    if not items:
        raise AugmentError("occlude: no items with bounding boxes")
    if p:
        pool = [i for i in items if i["name"].lower() == str(p).lower()]
        if not pool:
            raise AugmentError(f"occlude: item '{p}' not found")
    else:
        pool = items
    target = pool[int(rng.integers(len(pool)))]
    w, h = img.size
    ymin, xmin, ymax, xmax = target["box_2d"]
    box = (int(xmin / 1000 * w), int(ymin / 1000 * h), int(xmax / 1000 * w), int(ymax / 1000 * h))
    layer = Image.new("RGB", img.size, _ring_color(img, box))
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rectangle(box, fill=255)
    out = img.copy()
    out.paste(layer, (0, 0), mask.filter(ImageFilter.GaussianBlur(max(2, int(min(w, h) * 0.012)))))
    return out, [i for i in items if i is not target]


TRANSFORMS = {
    "noise": (t_noise, "Gaussian noise, parameter: sigma 0-255 (default: 25)"),
    "brightness": (t_brightness, "brightness, multiplier (0.45 dark, 1.6 overexposed)"),
    "contrast": (t_contrast, "contrast, multiplier (0.25 low contrast / haze)"),
    "blur": (t_blur, "blur, radius (default: 3)"),
    "jpeg": (t_jpeg, "JPEG compression, quality 1-95 (default: 10)"),
    "lowres": (t_lowres, "downscale resolution, scale 0.02-1 (0.25 = quarter size per side)"),
    "tint": (t_tint, "color tint, parameter: warm or cold"),
    "gray": (t_gray, "grayscale conversion"),
    "flip": (t_flip, "horizontal flip (bounding boxes are recalculated)"),
    "rotate": (t_rotate, "counter-clockwise rotation by angle in degrees with dark background (bounding boxes recalculated)"),
    "crop": (t_crop, "center crop, scale 0.1-1; items visible under 60% are dropped"),
    "zoomout": (t_zoomout, "zoom out / shrink, scale 0.1-1 with dark border"),
    "occlude": (t_occlude, "occlude dish (parameter: name, or random) and remove it from annotations"),
}

PRESETS = {
    "mild": ["noise:15", "noise:35", "brightness:0.45", "brightness:1.6", "blur:4", "jpeg:8",
             "lowres:0.25", "tint:warm", "flip", "rotate:10", "rotate:-10", "rotate:90"],
    "strong": ["noise:60", "noise:90", "brightness:0.18", "brightness:2.4", "contrast:0.25", "blur:12",
               "jpeg:2", "lowres:0.15", "gray", "tint:cold", "rotate:30", "rotate:-45", "rotate:180",
               "zoomout:0.4", "crop:0.5", "occlude",
               "flip+rotate:25+noise:45+brightness:0.5", "zoomout:0.55+blur:6+tint:warm"],
}
PRESETS["all"] = PRESETS["mild"] + PRESETS["strong"]
MAX_VARIANTS = 60


def parse_spec(spec: str) -> list[tuple[str, object]]:
    steps = []
    for part in spec.split("+"):
        name, _, raw = part.strip().partition(":")
        name = name.strip().lower()
        if name not in TRANSFORMS:
            raise AugmentError(f"unknown transform '{name}', available: {', '.join(TRANSFORMS)}")
        raw = raw.strip()
        param: object = None
        if raw:
            try:
                param = float(raw)
            except ValueError:
                param = raw
        steps.append((name, param))
    return steps


def resolve_specs(preset: str | None, transforms: str | None) -> list[str]:
    specs: list[str] = []
    if preset and preset != "none":
        if preset not in PRESETS:
            raise AugmentError(f"unknown preset '{preset}', available: none, {', '.join(PRESETS)}")
        specs += PRESETS[preset]
    if transforms:
        specs += [s.strip() for s in transforms.split(",") if s.strip()]
    specs = list(dict.fromkeys(specs))
    if not specs:
        raise AugmentError("no transforms selected: specify preset or transforms")
    if len(specs) > MAX_VARIANTS:
        raise AugmentError(f"too many variants ({len(specs)}), maximum allowed is {MAX_VARIANTS}")
    for s in specs:
        parse_spec(s)
    return specs


@dataclass
class Variant:
    file_name: str
    spec: str
    image: bytes
    items: list[dict]


def _slug(spec: str) -> str:
    return re.sub(r"[^0-9A-Za-z.\-]+", "_", spec).strip("_")


def _encode(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=92)
    return buf.getvalue()


def generate(image_bytes: bytes, items: list[dict], specs: list[str], base_name: str = "photo",
             seed: int = 42, include_original: bool = True) -> list[Variant]:
    try:
        src = Image.open(io.BytesIO(image_bytes))
        src.load()
    except Exception as e:
        raise AugmentError("failed to open image (expected jpg, png, or webp)") from e
    src = ImageOps.exif_transpose(src).convert("RGB")
    items = validate_items(items)
    stem = re.sub(r"[^0-9A-Za-z._-]+", "_", base_name.rsplit(".", 1)[0]) or "photo"

    variants: list[Variant] = []
    if include_original:
        variants.append(Variant(f"{stem}__original.jpg", "original", _encode(src), items))
    for n, spec in enumerate(specs):
        rng = np.random.default_rng([seed, n])
        img, its = src.copy(), [dict(i) for i in items]
        for name, param in parse_spec(spec):
            img, its = TRANSFORMS[name][0](img, its, param, rng)
        variants.append(Variant(f"{stem}__{_slug(spec)}.jpg", spec, _encode(img), its))
    return variants


def build_zip(variants: list[Variant], source_name: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for v in variants:
            z.writestr(v.file_name, v.image)
        manifest = {
            "source": source_name,
            "box_format": "box_2d = [ymin, xmin, ymax, xmax], scale 0-1000",
            "variants": [{"file": v.file_name, "spec": v.spec, "items": v.items} for v in variants],
        }
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
    return buf.getvalue()