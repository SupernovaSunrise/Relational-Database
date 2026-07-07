import re

with open('web_app.py', 'r') as f:
    content = f.read()

# Fix /customers - remove search param
content = re.sub(
    r'''@app\.route\('/customers'\)\ndef customers\(\):\s+search = request\.args\.get\('search', ''\)\.strip\(\)[\s\S]*?return render_template\('customers\.html', customers=customers_list, search=search\)''',
    '''@app.route('/customers')
def customers():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, zip_code, date_added FROM customers ORDER BY name")
    customers_list = cursor.fetchall()
    conn.close()
    return render_template('customers.html', customers=customers_list)''',
    content
)

# Fix /equipment - remove search param
content = re.sub(
    r'''@app\.route\('/equipment'\)\ndef equipment\(\):\s+search = request\.args\.get\('search', ''\)\.strip\(\)[\s\S]*?return render_template\('equipment\.html', equipment=equipment_list, search=search\)''',
    '''@app.route('/equipment')
def equipment():
    conn = connect_db()
    cursor = conn.cursor()
    query = (
        "SELECT equipment.equipment_id, equipment.item_name, loans.id AS loan_id, "
        "loans.checked_out_date, loans.due_date, customers.name AS customer_name "
        "FROM equipment "
        "LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL "
        "LEFT JOIN customers ON loans.customer_id = customers.id "
        "ORDER BY equipment.equipment_id"
    )
    cursor.execute(query)
    equipment_list = cursor.fetchall()
    conn.close()
    return render_template('equipment.html', equipment=equipment_list)''',
    content
)

# Fix init_db - remove duplicate date_verified and is_first_item checks
# First occurrence should be kept, second removed
lines = content.split('\n')
result = []
skip_next = 0
for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    if 'cursor.execute("PRAGMA table_info(equipment)")' in line and i > 250:  # second occurrence
        # Skip next 4 lines (the duplicate check)
        if 'if "date_verified" not in equip_columns:' in lines[i+2]:
            skip_next = 4
            continue
    if 'cursor.execute("PRAGMA table_info(checkout_log)")' in line and i > 250:  # second occurrence
        # Skip next 4 lines (the duplicate check)
        if 'if "is_first_item" not in log_columns:' in lines[i+2]:
            skip_next = 4
            continue
    result.append(line)

content = '\n'.join(result)

with open('web_app.py', 'w') as f:
    f.write(content)

print("Fixed routes and init_db")
