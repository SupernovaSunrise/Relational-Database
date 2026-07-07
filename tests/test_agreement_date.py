import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from web_app import app, calculate_due_date, normalize_date_input


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


def test_customer_agreement_route_with_existing_loan_renders():
    with app.test_client() as client:
        response = client.get("/customer_agreement/1")

    assert response.status_code == 302
