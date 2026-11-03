import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
DATA = Path(__file__).parent / "data"


@pytest.fixture
def export():
    return json.loads((DATA / "export.json").read_text(encoding="utf-8"))


@pytest.fixture
def hand_dataset():
    return [json.loads(l) for l in (DATA / "dataset.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]


@pytest.fixture
def photo_bytes():
    return (DATA / "00_original.jpg").read_bytes()


@pytest.fixture
def items():
    expected = json.loads((DATA / "expected.json").read_text(encoding="utf-8"))
    return [dict(i) for i in expected[0]["items"]]
