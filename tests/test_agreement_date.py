import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from web_app import DB_PATH, app, calculate_due_date, normalize_date_input


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
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("INSERT INTO customers (name, phone, zip_code, date_added) VALUES (?, ?, ?, ?)", ("Route Test", "5550000000", "12345", "2026-07-07"))
    customer_id = cur.lastrowid
    cur.execute("INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)", ("AA-7789", "Route Test Item"))
    cur.execute(
        "INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date, agreement_data, agreement_date) VALUES (?, ?, ?, ?, ?, ?)",
        (customer_id, "AA-7789", "2026-07-07", "2026-11-04", "data:image/png;base64,abc", "2026-07-07"),
    )
    loan_id = cur.lastrowid
    conn.commit()
    conn.close()

    with app.test_client() as client:
        response = client.get(f"/customer_agreement/{customer_id}?loan_id={loan_id}")

    assert response.status_code == 200
