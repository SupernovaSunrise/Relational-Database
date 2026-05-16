from flask import Flask, render_template, request, redirect, url_for, flash
import sqlite3
import re
from datetime import datetime, timedelta
from pathlib import Path

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this in production

DB_PATH = Path(__file__).parent / "database.db"
CHECKOUT_PERIOD_DAYS = 120

EQUIPMENT_ID_PATTERN = re.compile(r"^[A-Z]{2}-\d{4}$")

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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_equipment_item_name ON equipment(item_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_loans_equipment_status ON loans(equipment_id, returned_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_loans_customer_status ON loans(customer_id, returned_date)")
    conn.commit()
    conn.close()

def find_customer_matches(customer_reference):
    conn = connect_db()
    cursor = conn.cursor()
    if customer_reference.isdigit():
        cursor.execute(
            "SELECT id, name, phone, zip_code FROM customers WHERE id = ?",
            (customer_reference,),
        )
        rows = cursor.fetchall()
        conn.close()
        return rows

    cursor.execute(
        "SELECT id, name, phone, zip_code FROM customers "
        "WHERE phone LIKE ? OR name LIKE ? OR zip_code LIKE ? "
        "ORDER BY name LIMIT 20",
        (f"%{customer_reference}%", f"%{customer_reference}%", f"%{customer_reference}%"),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows

def resolve_customer_reference(customer_reference):
    matches = find_customer_matches(customer_reference)
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]["id"]
    return None

@app.route('/')
def index():
    return redirect(url_for('master_control'))

@app.route('/master', methods=['GET', 'POST'])
def master_control():
    checkout_candidates = None
    pending_equipment_id = None
    pending_customer_reference = None

    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'add_customer':
            name = request.form['name'].strip()
            phone = request.form['phone'].strip()
            zip_code = request.form['zip_code'].strip()

            if not name or not phone or not zip_code:
                flash('All customer fields are required.')
                return redirect(url_for('master_control'))

            digits = re.sub(r"\D", "", phone)
            if len(digits) < 10:
                flash('Phone number must have at least 10 digits.')
                return redirect(url_for('master_control'))

            if not re.fullmatch(r"\d{5}", zip_code):
                flash('Zip code must be 5 digits.')
                return redirect(url_for('master_control'))

            conn = connect_db()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    "INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)",
                    (name, phone, zip_code),
                )
                conn.commit()
                flash(f'Customer "{name}" added successfully.')
            except sqlite3.IntegrityError:
                flash('Error adding customer.')
            finally:
                conn.close()

        elif action == 'add_equipment':
            equipment_id = request.form['equipment_id'].strip().upper()
            item_name = request.form['item_name'].strip()

            if not equipment_id or not item_name:
                flash('All equipment fields are required.')
                return redirect(url_for('master_control'))

            if not EQUIPMENT_ID_PATTERN.fullmatch(equipment_id):
                flash('Equipment ID must be in format AA-0000.')
                return redirect(url_for('master_control'))

            conn = connect_db()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    "INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)",
                    (equipment_id, item_name),
                )
                conn.commit()
                flash(f'Equipment "{equipment_id}" added successfully.')
            except sqlite3.IntegrityError:
                flash('Equipment ID already exists.')
            finally:
                conn.close()

        elif action == 'checkout':
            equipment_id = request.form['equipment_id'].strip().upper()
            customer_reference = request.form['customer_reference'].strip()

            if not equipment_id or not customer_reference:
                flash('Please enter both equipment ID and customer reference.')
                return redirect(url_for('master_control'))

            matches = find_customer_matches(customer_reference)
            if not matches:
                flash('Customer not found. Use an existing ID, name, phone, or ZIP.')
                return redirect(url_for('master_control'))

            if len(matches) > 1:
                pending_equipment_id = equipment_id
                pending_customer_reference = customer_reference
                checkout_candidates = matches
            else:
                customer_id = matches[0]["id"]
                conn = connect_db()
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL",
                    (equipment_id,)
                )
                if cursor.fetchone():
                    conn.close()
                    flash('Equipment is already checked out.')
                    return redirect(url_for('master_control'))

                checked_out_date = datetime.today().date()
                due_date = checked_out_date + timedelta(days=CHECKOUT_PERIOD_DAYS)
                cursor.execute(
                    "INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date) VALUES (?, ?, ?, ?)",
                    (customer_id, equipment_id, checked_out_date.isoformat(), due_date.isoformat()),
                )
                conn.commit()
                conn.close()
                flash(f'Equipment {equipment_id} checked out until {due_date.isoformat()}.')

        elif action == 'return':
            loan_id = request.form['loan_id']
            if loan_id:
                returned_date = datetime.today().date().isoformat()
                conn = connect_db()
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE loans SET returned_date = ? WHERE id = ?",
                    (returned_date, loan_id),
                )
                conn.commit()
                conn.close()
                flash('Equipment returned successfully.')

        if checkout_candidates:
            pass
        else:
            return redirect(url_for('master_control', search=request.args.get('search', ''), sort_by=request.args.get('sort_by', 'equipment_id'), sort_dir=request.args.get('sort_dir', 'asc')))

    search = request.args.get('search', '').strip()
    sort_by = request.args.get('sort_by', 'equipment_id')
    sort_dir = request.args.get('sort_dir', 'asc')
    sort_options = {
        'equipment_id': 'equipment.equipment_id',
        'item_name': 'equipment.item_name',
        'customer_name': 'customers.name',
        'customer_zip': 'customers.zip_code',
        'checked_out_date': 'loans.checked_out_date',
        'due_date': 'loans.due_date',
    }
    sort_column = sort_options.get(sort_by, 'equipment.equipment_id')
    sort_direction = 'DESC' if sort_dir == 'desc' else 'ASC'

    conn = connect_db()
    cursor = conn.cursor()
    query = (
        "SELECT equipment.equipment_id, equipment.item_name, customers.name AS customer_name, "
        "customers.zip_code AS customer_zip, loans.id AS loan_id, loans.checked_out_date, loans.due_date "
        "FROM equipment "
        "LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL "
        "LEFT JOIN customers ON loans.customer_id = customers.id "
    )
    params = ()
    if search:
        search_pattern = f"%{search}%"
        query += (
            "WHERE equipment.equipment_id LIKE ? OR equipment.item_name LIKE ? "
            "OR customers.name LIKE ? OR customers.zip_code LIKE ? "
        )
        params = (search_pattern, search_pattern, search_pattern, search_pattern)
    query += f"ORDER BY {sort_column} {sort_direction}"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return render_template(
        'master.html',
        rows=rows,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        checkout_candidates=checkout_candidates,
        pending_equipment_id=pending_equipment_id,
        pending_customer_reference=pending_customer_reference,
    )

@app.route('/customers')
def customers():
    search = request.args.get('search', '').strip()
    conn = connect_db()
    cursor = conn.cursor()
    if search:
        search_pattern = f"%{search}%"
        cursor.execute(
            "SELECT id, name, phone, zip_code FROM customers "
            "WHERE name LIKE ? OR phone LIKE ? OR zip_code LIKE ? "
            "ORDER BY name",
            (search_pattern, search_pattern, search_pattern),
        )
    else:
        cursor.execute("SELECT id, name, phone, zip_code FROM customers ORDER BY name")
    customers_list = cursor.fetchall()
    conn.close()
    return render_template('customers.html', customers=customers_list, search=search)

@app.route('/add_customer', methods=['GET', 'POST'])
def add_customer():
    if request.method == 'POST':
        name = request.form['name'].strip()
        phone = request.form['phone'].strip()
        zip_code = request.form['zip_code'].strip()

        if not name or not phone or not zip_code:
            flash('All fields are required.')
            return redirect(url_for('add_customer'))

        # Validate phone (at least 10 digits)
        digits = re.sub(r"\D", "", phone)
        if len(digits) < 10:
            flash('Phone number must have at least 10 digits.')
            return redirect(url_for('add_customer'))

        # Validate zip code (5 digits)
        if not re.fullmatch(r"\d{5}", zip_code):
            flash('Zip code must be 5 digits.')
            return redirect(url_for('add_customer'))

        conn = connect_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)",
                (name, phone, zip_code),
            )
            conn.commit()
            flash(f'Customer "{name}" added successfully.')
        except sqlite3.IntegrityError:
            flash('Error adding customer.')
        finally:
            conn.close()

        return redirect(url_for('customers'))

    return render_template('add_customer.html')

@app.route('/equipment')
def equipment():
    search = request.args.get('search', '').strip()
    conn = connect_db()
    cursor = conn.cursor()
    query = (
        "SELECT equipment.equipment_id, equipment.item_name, loans.id AS loan_id, "
        "loans.checked_out_date, loans.due_date, customers.name AS customer_name "
        "FROM equipment "
        "LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL "
        "LEFT JOIN customers ON loans.customer_id = customers.id "
    )
    params = ()
    if search:
        search_pattern = f"%{search}%"
        query += (
            "WHERE equipment.equipment_id LIKE ? OR equipment.item_name LIKE ? "
            "OR customers.name LIKE ? "
        )
        params = (search_pattern, search_pattern, search_pattern)
    query += "ORDER BY equipment.equipment_id"
    cursor.execute(query, params)
    equipment_list = cursor.fetchall()
    conn.close()
    return render_template('equipment.html', equipment=equipment_list, search=search)

@app.route('/add_equipment', methods=['GET', 'POST'])
def add_equipment():
    if request.method == 'POST':
        equipment_id = request.form['equipment_id'].strip().upper()
        item_name = request.form['item_name'].strip()

        if not equipment_id or not item_name:
            flash('All fields are required.')
            return redirect(url_for('add_equipment'))

        if not EQUIPMENT_ID_PATTERN.fullmatch(equipment_id):
            flash('Equipment ID must be in format AA-0000.')
            return redirect(url_for('add_equipment'))

        conn = connect_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)",
                (equipment_id, item_name),
            )
            conn.commit()
            flash(f'Equipment "{equipment_id}" added successfully.')
        except sqlite3.IntegrityError:
            flash('Equipment ID already exists.')
        finally:
            conn.close()

        return redirect(url_for('equipment'))

    return render_template('add_equipment.html')

@app.route('/delete_customer/<int:customer_id>', methods=['POST'])
def delete_customer(customer_id):
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM loans WHERE customer_id = ? AND returned_date IS NULL",
        (customer_id,)
    )
    if cursor.fetchone():
        conn.close()
        flash('Cannot delete customer while they have active checked out equipment.')
        return redirect(url_for('customers'))

    cursor.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    conn.commit()
    conn.close()
    flash('Customer deleted successfully.')
    return redirect(url_for('customers'))

@app.route('/delete_equipment/<equipment_id>', methods=['POST'])
def delete_equipment(equipment_id):
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL",
        (equipment_id,)
    )
    if cursor.fetchone():
        conn.close()
        flash('Cannot delete equipment while it is checked out.')
        return redirect(url_for('equipment'))

    cursor.execute("DELETE FROM equipment WHERE equipment_id = ?", (equipment_id,))
    conn.commit()
    conn.close()
    flash('Equipment deleted successfully.')
    return redirect(url_for('equipment'))

@app.route('/checkout', methods=['GET', 'POST'])
def checkout():
    if request.method == 'POST':
        customer_reference = request.form['customer_reference'].strip()
        equipment_id = request.form['equipment_id'].strip().upper()

        if not customer_reference or not equipment_id:
            flash('Please enter both customer reference and equipment ID.')
            return redirect(url_for('checkout'))

        customer_id = resolve_customer_reference(customer_reference)
        if not customer_id:
            flash('Customer not found. Use an existing ID, name, or phone.')
            return redirect(url_for('checkout'))

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL",
            (equipment_id,)
        )
        if cursor.fetchone():
            conn.close()
            flash('Equipment is already checked out.')
            return redirect(url_for('checkout'))

        checked_out_date = datetime.today().date()
        due_date = checked_out_date + timedelta(days=CHECKOUT_PERIOD_DAYS)

        cursor.execute(
            "INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date) VALUES (?, ?, ?, ?)",
            (customer_id, equipment_id, checked_out_date.isoformat(), due_date.isoformat()),
        )
        conn.commit()
        conn.close()

        flash(f'Equipment {equipment_id} checked out until {due_date.isoformat()}.')
        return redirect(url_for('checked_out'))

    customer_search = request.args.get('customer_search', '').strip()
    equipment_search = request.args.get('equipment_search', '').strip()

    conn = connect_db()
    cursor = conn.cursor()

    if customer_search:
        customer_pattern = f"%{customer_search}%"
        cursor.execute(
            "SELECT id, name, phone FROM customers "
            "WHERE name LIKE ? OR phone LIKE ? OR zip_code LIKE ? "
            "ORDER BY name LIMIT 100",
            (customer_pattern, customer_pattern, customer_pattern),
        )
    else:
        cursor.execute("SELECT id, name, phone FROM customers ORDER BY name LIMIT 100")
    customers_list = cursor.fetchall()

    if equipment_search:
        equipment_pattern = f"%{equipment_search}%"
        cursor.execute(
            "SELECT equipment.equipment_id, equipment.item_name FROM equipment "
            "LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL "
            "WHERE loans.id IS NULL AND (equipment.equipment_id LIKE ? OR equipment.item_name LIKE ?) "
            "ORDER BY equipment.equipment_id LIMIT 100",
            (equipment_pattern, equipment_pattern),
        )
    else:
        cursor.execute(
            "SELECT equipment.equipment_id, equipment.item_name FROM equipment "
            "LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL "
            "WHERE loans.id IS NULL ORDER BY equipment.equipment_id LIMIT 100"
        )
    available_equipment = cursor.fetchall()

    conn.close()
    return render_template(
        'checkout.html',
        customers=customers_list,
        equipment=available_equipment,
        customer_search=customer_search,
        equipment_search=equipment_search,
    )

@app.route('/return_equipment', methods=['GET', 'POST'])
def return_equipment():
    if request.method == 'POST':
        loan_id = request.form['loan_id']

        if not loan_id:
            flash('Please select equipment to return.')
            return redirect(url_for('return_equipment'))

        returned_date = datetime.today().date().isoformat()
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE loans SET returned_date = ? WHERE id = ?",
            (returned_date, loan_id),
        )
        conn.commit()
        conn.close()

        flash('Equipment returned successfully.')
        return redirect(url_for('checked_out'))

    search = request.args.get('search', '').strip()
    conn = connect_db()
    cursor = conn.cursor()
    query = (
        "SELECT loans.id, loans.equipment_id, equipment.item_name, customers.name, "
        "customers.zip_code, loans.checked_out_date, loans.due_date "
        "FROM loans "
        "JOIN equipment ON loans.equipment_id = equipment.equipment_id "
        "JOIN customers ON loans.customer_id = customers.id "
        "WHERE loans.returned_date IS NULL "
    )
    params = ()
    if search:
        search_pattern = f"%{search}%"
        query += (
            "AND (loans.equipment_id LIKE ? OR equipment.item_name LIKE ? "
            "OR customers.name LIKE ? OR customers.zip_code LIKE ?) "
        )
        params = (search_pattern, search_pattern, search_pattern, search_pattern)
    query += "ORDER BY loans.due_date"
    cursor.execute(query, params)
    checked_out_list = cursor.fetchall()
    conn.close()

    return render_template('return_equipment.html', checked_out=checked_out_list, search=search)

@app.route('/checked_out')
def checked_out():
    return redirect(url_for('return_equipment'))

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)