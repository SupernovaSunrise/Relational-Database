import sqlite3
import re
import sys
import logging
from datetime import datetime, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "database.db"
if getattr(sys, 'frozen', False):
    DB_PATH = Path(sys.executable).parent / "database.db"

CHECKOUT_PERIOD_DAYS = 120
EQUIPMENT_ID_PATTERN = re.compile(r"^[A-Z]{2}-\d{4}$")


def normalize_phone(phone):
    digits = re.sub(r"\D", "", str(phone or ""))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def format_phone(phone):
    digits = normalize_phone(phone)
    if len(digits) != 10:
        return phone
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def normalize_date_input(value):
    if value is None:
        return ''
    text = str(value).strip()
    if not text:
        return ''
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", text):
        month, day, year = [int(part) for part in text.split('/')]
        return datetime(year, month, day).date().isoformat()
    if re.fullmatch(r"\d{4}/\d{2}/\d{2}", text):
        year, month, day = [int(part) for part in text.split('/')]
        return datetime(year, month, day).date().isoformat()
    return text


def calculate_due_date(checkout_date, checkout_period_days=CHECKOUT_PERIOD_DAYS):
    normalized = normalize_date_input(checkout_date)
    if not normalized:
        return ''
    try:
        parsed = datetime.strptime(normalized, "%Y-%m-%d").date()
    except ValueError:
        return ''
    return (parsed + timedelta(days=checkout_period_days)).isoformat()


def escape_like(value):
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def customer_phone_exists(phone_digits, cursor, exclude_id=None):
    if not phone_digits:
        return False
    normalized = normalize_phone(phone_digits)
    query = "SELECT 1 FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?"
    params = [normalized]
    if exclude_id is not None:
        query += " AND id != ?"
        params.append(exclude_id)
    cursor.execute(query, params)
    return cursor.fetchone() is not None


def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_DATE
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            zip_code TEXT NOT NULL,
            date_added TEXT NOT NULL DEFAULT CURRENT_DATE
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS equipment (
            equipment_id TEXT PRIMARY KEY,
            item_name TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            equipment_id TEXT NOT NULL,
            checked_out_date TEXT NOT NULL,
            due_date TEXT NOT NULL,
            returned_date TEXT,
            agreement_data TEXT,
            agreement_date TEXT,
            agreement_pending INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS checkout_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_zip_code TEXT NOT NULL,
            item_name TEXT NOT NULL,
            equipment_id TEXT NOT NULL,
            checkout_date TEXT NOT NULL,
            is_first_item INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS customer_agreements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            loan_id INTEGER,
            waiver_agreed INTEGER DEFAULT 0,
            digital_signature_agreed INTEGER DEFAULT 0,
            signature_data TEXT,
            agreed_date TEXT NOT NULL,
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(loan_id) REFERENCES loans(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS deleted_items_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            deletion_date TEXT NOT NULL
        )
        """
    )
    conn.commit()

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_equipment_item_name ON equipment(item_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_loans_equipment_status ON loans(equipment_id, returned_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_loans_customer_status ON loans(customer_id, returned_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_checkout_log_date ON checkout_log(checkout_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deleted_items_date ON deleted_items_log(deletion_date)")

    cursor.execute("PRAGMA table_info(customers)")
    columns = [column[1] for column in cursor.fetchall()]
    if "date_added" not in columns:
        cursor.execute("ALTER TABLE customers ADD COLUMN date_added TEXT")
        cursor.execute("UPDATE customers SET date_added = date('now') WHERE date_added IS NULL")
        conn.commit()

    cursor.execute("PRAGMA table_info(loans)")
    loan_columns = [column[1] for column in cursor.fetchall()]
    if "agreement_data" not in loan_columns:
        cursor.execute("ALTER TABLE loans ADD COLUMN agreement_data TEXT")
    if "agreement_date" not in loan_columns:
        cursor.execute("ALTER TABLE loans ADD COLUMN agreement_date TEXT")
    if "agreement_pending" not in loan_columns:
        cursor.execute("ALTER TABLE loans ADD COLUMN agreement_pending INTEGER NOT NULL DEFAULT 0")

    cursor.execute("PRAGMA table_info(equipment)")
    equip_columns = [column[1] for column in cursor.fetchall()]
    if "date_verified" not in equip_columns:
        cursor.execute("ALTER TABLE equipment ADD COLUMN date_verified TEXT")
        conn.commit()

    cursor.execute("PRAGMA table_info(checkout_log)")
    log_columns = [column[1] for column in cursor.fetchall()]
    if "is_first_item" not in log_columns:
        cursor.execute("ALTER TABLE checkout_log ADD COLUMN is_first_item INTEGER NOT NULL DEFAULT 0")
        conn.commit()

    cursor.execute("SELECT id, phone FROM customers")
    for row in cursor.fetchall():
        formatted = format_phone(row["phone"])
        if formatted != row["phone"]:
            cursor.execute("UPDATE customers SET phone = ? WHERE id = ?", (formatted, row["id"]))
    conn.commit()
    conn.close()


def blank_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
        log.info("Deleted existing database at %s", DB_PATH)
    init_db()
    log.info("Created fresh blank database at %s", DB_PATH)


def find_customer_matches(customer_reference):
    conn = connect_db()
    cursor = conn.cursor()

    search_pattern = f"%{escape_like(customer_reference)}%"
    normalized_search = normalize_phone(customer_reference)
    if customer_reference.isdigit() and len(customer_reference) <= 6:
        cursor.execute(
            "SELECT id, name, phone, zip_code FROM customers WHERE id = ?",
            (customer_reference,),
        )
        rows = cursor.fetchall()
        if rows:
            conn.close()
            return rows

    query = (
        "SELECT id, name, phone, zip_code FROM customers "
        "WHERE LOWER(name) LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR zip_code LIKE ? ESCAPE '\\' "
    )
    params = [search_pattern, search_pattern, search_pattern]
    if normalized_search:
        query += "OR REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') LIKE ? ESCAPE '\\' "
        params.append(f"%{escape_like(normalized_search)}%")
    query += "ORDER BY name LIMIT 20"
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()
    return rows
