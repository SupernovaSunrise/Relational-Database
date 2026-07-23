import sqlite3
import re
from datetime import datetime, timedelta
from pathlib import Path
from db import add_business_days, all_holidays_for_span

DB_PATH = Path(__file__).parent / "database.db"
CHECKOUT_PERIOD_DAYS = 120

EQUIPMENT_ID_PATTERN = re.compile(r"^[A-Z]{2}-\d{4}$")

MENU = [
    ("1", "Add customer"),
    ("2", "Add equipment"),
    ("3", "Checkout equipment"),
    ("4", "Return equipment"),
    ("5", "List customers"),
    ("6", "List equipment"),
    ("7", "List checked out items"),
    ("8", "Exit"),
]


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            zip_code TEXT NOT NULL
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
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
        )
        """
    )
    conn.commit()
    conn.close()


def input_nonempty(prompt):
    while True:
        value = input(prompt).strip()
        if value:
            return value
        print("Please enter a value.")


def validate_phone(phone):
    digits = re.sub(r"\D", "", phone)
    return len(digits) >= 10


def validate_zip(zip_code):
    return bool(re.fullmatch(r"\d{5}", zip_code))


def input_phone():
    while True:
        phone = input_nonempty("Phone number: ").strip()
        if validate_phone(phone):
            return phone
        print("Enter a valid 10-digit phone number.")


def input_zip():
    while True:
        zip_code = input_nonempty("Zip code: ")
        if validate_zip(zip_code):
            return zip_code
        print("Enter a valid 5-digit zip code.")


def input_equipment_id():
    while True:
        equipment_id = input_nonempty("Equipment ID (format AA-0000): ").upper()
        if EQUIPMENT_ID_PATTERN.fullmatch(equipment_id):
            return equipment_id
        print("Equipment ID must be in format 'AA-0000'.")


def add_customer():
    name = input_nonempty("Customer name: ")
    phone = input_phone()
    zip_code = input_zip()
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)",
        (name, phone, zip_code),
    )
    conn.commit()
    conn.close()
    print(f"Customer '{name}' added.")


def add_equipment():
    equipment_id = input_equipment_id()
    item_name = input_nonempty("Item name: ")
    conn = connect_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)",
            (equipment_id, item_name),
        )
        conn.commit()
        print(f"Equipment '{equipment_id}' added.")
    except sqlite3.IntegrityError:
        print(f"Equipment ID '{equipment_id}' already exists.")
    finally:
        conn.close()


def choose_customer():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, zip_code FROM customers ORDER BY name")
    customers = cursor.fetchall()
    conn.close()
    if not customers:
        print("No customers available.")
        return None
    for row in customers:
        print(f"{row['id']}: {row['name']} ({row['phone']}, {row['zip_code']})")
    while True:
        selection = input("Enter customer ID: ").strip()
        if not selection.isdigit():
            print("Enter a numeric customer ID.")
            continue
        for row in customers:
            if str(row['id']) == selection:
                return int(selection)
        print("Customer ID not found.")


def choose_available_equipment():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT equipment.equipment_id, equipment.item_name FROM equipment"
        " LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL"
        " WHERE loans.id IS NULL ORDER BY equipment.equipment_id"
    )
    items = cursor.fetchall()
    conn.close()
    if not items:
        print("No available equipment to checkout.")
        return None
    for row in items:
        print(f"{row['equipment_id']}: {row['item_name']}")
    while True:
        equipment_id = input("Enter equipment ID: ").strip().upper()
        if any(row['equipment_id'] == equipment_id for row in items):
            return equipment_id
        print("Equipment ID not available or invalid.")


def choose_checked_out_equipment():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT loans.id, loans.equipment_id, equipment.item_name, customers.name, loans.checked_out_date, loans.due_date"
        " FROM loans"
        " JOIN equipment ON loans.equipment_id = equipment.equipment_id"
        " JOIN customers ON loans.customer_id = customers.id"
        " WHERE loans.returned_date IS NULL"
        " ORDER BY loans.due_date"
    )
    rows = cursor.fetchall()
    conn.close()
    if not rows:
        print("No equipment is currently checked out.")
        return None
    for row in rows:
        print(
            f"{row['id']}: {row['equipment_id']} ({row['item_name']}) checked out to {row['name']} "
            f"on {row['checked_out_date']} due {row['due_date']}"
        )
    while True:
        selection = input("Enter loan ID to return: ").strip()
        if not selection.isdigit():
            print("Enter a numeric loan ID.")
            continue
        for row in rows:
            if str(row['id']) == selection:
                return int(selection)
        print("Loan ID not found.")


def checkout_equipment():
    customer_id = choose_customer()
    if customer_id is None:
        return
    equipment_id = choose_available_equipment()
    if equipment_id is None:
        return
    checked_out_date = datetime.today().date()
    due_date = add_business_days(checked_out_date, CHECKOUT_PERIOD_DAYS, all_holidays_for_span(checked_out_date, CHECKOUT_PERIOD_DAYS + 30))
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date) VALUES (?, ?, ?, ?)",
        (customer_id, equipment_id, checked_out_date.isoformat(), due_date.isoformat()),
    )
    conn.commit()
    conn.close()
    print(f"Checked out {equipment_id} until {due_date.isoformat()}.")


def return_equipment():
    loan_id = choose_checked_out_equipment()
    if loan_id is None:
        return
    returned_date = datetime.today().date().isoformat()
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE loans SET returned_date = ? WHERE id = ?",
        (returned_date, loan_id),
    )
    conn.commit()
    conn.close()
    print("Equipment returned successfully.")


def list_customers():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, zip_code FROM customers ORDER BY name")
    for row in cursor.fetchall():
        print(f"{row['id']}: {row['name']} | {row['phone']} | {row['zip_code']}")
    conn.close()


def list_equipment():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT equipment_id, item_name FROM equipment ORDER BY equipment_id")
    for row in cursor.fetchall():
        print(f"{row['equipment_id']}: {row['item_name']}")
    conn.close()


def list_checked_out():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT loans.equipment_id, equipment.item_name, customers.name, loans.checked_out_date, loans.due_date"
        " FROM loans"
        " JOIN equipment ON loans.equipment_id = equipment.equipment_id"
        " JOIN customers ON loans.customer_id = customers.id"
        " WHERE loans.returned_date IS NULL"
        " ORDER BY loans.due_date"
    )
    rows = cursor.fetchall()
    if not rows:
        print("No checked out equipment.")
    else:
        for row in rows:
            print(
                f"{row['equipment_id']}: {row['item_name']} -> {row['name']} "
                f"checked out {row['checked_out_date']} due {row['due_date']}"
            )
    conn.close()


def print_menu():
    print("\nEquipment Checkout Database")
    print("--------------------------------")
    for key, label in MENU:
        print(f"{key}. {label}")


def main():
    init_db()
    while True:
        print_menu()
        choice = input("Choose an option: ").strip()
        if choice == "1":
            add_customer()
        elif choice == "2":
            add_equipment()
        elif choice == "3":
            checkout_equipment()
        elif choice == "4":
            return_equipment()
        elif choice == "5":
            list_customers()
        elif choice == "6":
            list_equipment()
        elif choice == "7":
            list_checked_out()
        elif choice == "8":
            print("Goodbye.")
            break
        else:
            print("Invalid option. Choose a number from the menu.")


if __name__ == "__main__":
    main()
