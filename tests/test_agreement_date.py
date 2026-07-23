import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import web_app
from web_app import app, calculate_due_date, normalize_date_input


@pytest.fixture
def agreement_database(tmp_path, monkeypatch):
    monkeypatch.setattr(web_app, "DB_PATH", tmp_path / "test_database.db")
    web_app.init_db()
    conn = web_app.connect_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)", ("Test Customer", "5555555555", "59901"))
    cursor.execute("INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)", ("AA-0001", "Walker"))
    cursor.execute("INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)", ("BB-0002", "Wheelchair"))
    cursor.execute(
        "INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date) VALUES (?, ?, ?, ?)",
        (1, "AA-0001", "2024-02-01", "2024-05-31"),
    )
    conn.commit()
    conn.close()

    yield


def test_customer_agreement_displays_the_stored_checkout_date(agreement_database):
    with app.test_client() as client:
        response = client.get("/customer_agreement/1?loan_ids=1")

    assert response.status_code == 200
    assert b'id="checkout_date" name="checkout_date" value="2024-02-01"' in response.data


def test_saving_agreement_persists_the_entered_checkout_date(agreement_database):
    with app.test_client() as client:
        response = client.post(
            "/customer_agreement/1?loan_ids=1",
            data={
                "action": "save",
                "loan_ids": "1",
                "checkout_date": "03/01/2024",
                "agreement_date": "03/01/2024",
                "waiver_agreed": "on",
                "signature_agreed": "on",
                "signature_data": "data:image/png;base64,test",
            },
        )

    assert response.status_code == 302
    conn = web_app.connect_db()
    loan = conn.execute("SELECT checked_out_date, due_date FROM loans WHERE id = 1").fetchone()
    conn.close()
    assert dict(loan) == {"checked_out_date": "2024-03-01", "due_date": "2024-08-20"}


def test_adding_equipment_uses_the_entered_checkout_date(agreement_database):
    with app.test_client() as client:
        response = client.post(
            "/customer_agreement/1?loan_ids=1",
            data={
                "action": "add_equipment",
                "loan_ids": "1",
                "checkout_date": "03/01/2024",
                "equipment_ids": "BB-0002",
            },
            follow_redirects=True,
        )

    assert response.status_code == 200
    assert b'id="checkout_date" name="checkout_date" value="2024-03-01"' in response.data
    conn = web_app.connect_db()
    new_loan = conn.execute(
        "SELECT checked_out_date, due_date FROM loans WHERE equipment_id = ?", ("BB-0002",)
    ).fetchone()
    checkout_log = conn.execute(
        "SELECT checkout_date FROM checkout_log WHERE equipment_id = ?", ("BB-0002",)
    ).fetchone()
    conn.close()
    assert dict(new_loan) == {"checked_out_date": "2024-03-01", "due_date": "2024-08-20"}
    assert checkout_log["checkout_date"] == "2024-03-01"


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
    assert calculate_due_date("2026-07-07", 120) == "2026-12-29"


def test_customer_agreement_route_with_existing_loan_renders():
    with app.test_client() as client:
        response = client.get("/customer_agreement/1")

    assert response.status_code == 302
