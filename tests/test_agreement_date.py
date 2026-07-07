import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from web_app import calculate_due_date, normalize_date_input


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ""),
        ("2026-07-07", "2026-07-07"),
        ("07/07/2026", "2026-07-07"),
        ("7/7/2026", "2026-07-07"),
        ("2026/07/07", "2026-07-07"),
    ],
)
def test_normalize_date_input(raw, expected):
    assert normalize_date_input(raw) == expected


def test_calculate_due_date():
    assert calculate_due_date("2026-07-07", 120) == "2026-11-04"
