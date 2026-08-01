const db = require('../db');
const { normalizePhone, formatPhone, escapeLike, todayIso } = require('../../shared/business-logic');

const PHONE_STRIP_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','')";

function customerPhoneExists(conn, phoneDigits, excludeId) {
  const digits = normalizePhone(phoneDigits);
  if (!digits) return false;
  let query = `SELECT 1 FROM customers WHERE ${PHONE_STRIP_SQL} = ?`;
  const params = [digits];
  if (excludeId !== undefined && excludeId !== null) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  return !!conn.prepare(query).get(...params);
}

function listHandler(event, payload) {
  return db.withDb((conn) => {
    const search = payload && payload.search != null ? String(payload.search).trim() : '';
    const baseQuery =
      'SELECT customers.id, customers.name, customers.phone, customers.zip_code, customers.date_added, ' +
      'EXISTS(SELECT 1 FROM loans WHERE loans.customer_id = customers.id ' +
      'AND loans.returned_date IS NULL AND loans.agreement_data IS NOT NULL) AS has_agreement ' +
      'FROM customers ';
    let query = baseQuery;
    const params = [];
    if (search) {
      const searchPattern = `%${escapeLike(search)}%`;
      const digitsSearchPattern = `%${escapeLike(normalizePhone(search))}%`;
      query +=
        "WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR zip_code LIKE ? ESCAPE '\\' " +
        `OR ${PHONE_STRIP_SQL} LIKE ? ESCAPE '\\' ORDER BY name`;
      params.push(searchPattern, searchPattern, searchPattern, digitsSearchPattern);
    } else {
      query += 'ORDER BY name';
    }
    const rows = conn.prepare(query).all(...params).map((row) => ({ ...row }));
    return { ok: true, items: rows, search };
  });
}

function searchHandler(event, payload) {
  return db.withDb((conn) => {
    const reference = String(payload.query);
    const searchPattern = `%${escapeLike(reference)}%`;
    const normalizedSearch = normalizePhone(reference);
    if (/^\d+$/.test(reference) && reference.length <= 6) {
      const rows = conn
        .prepare('SELECT id, name, phone, zip_code FROM customers WHERE id = ?')
        .all(reference);
      if (rows.length) return { ok: true, items: rows.map((row) => ({ ...row })) };
    }
    let query =
      "SELECT id, name, phone, zip_code FROM customers WHERE LOWER(name) LIKE ? ESCAPE '\\' " +
      "OR phone LIKE ? ESCAPE '\\' OR zip_code LIKE ? ESCAPE '\\' ";
    const params = [searchPattern, searchPattern, searchPattern];
    if (normalizedSearch) {
      query += `OR ${PHONE_STRIP_SQL} LIKE ? ESCAPE '\\' `;
      params.push(`%${escapeLike(normalizedSearch)}%`);
    }
    query += 'ORDER BY name LIMIT 20';
    const rows = conn.prepare(query).all(...params).map((row) => ({ ...row }));
    return { ok: true, items: rows };
  });
}

function getHandler(event, payload) {
  return db.withDb((conn) => {
    const row = conn
      .prepare('SELECT id, name, phone, zip_code, date_added FROM customers WHERE id = ?')
      .get(payload.id);
    if (!row) return { ok: false, error: 'Customer not found.' };
    return { ok: true, item: { ...row } };
  });
}

function addHandler(event, payload) {
  const name = String(payload.name).trim();
  const phone = String(payload.phone).trim();
  const zipCode = String(payload.zipCode).trim();
  if (!name || !phone || !zipCode) {
    return { ok: false, error: 'All fields are required.' };
  }
  const digits = normalizePhone(phone);
  if (digits.length < 10) {
    return { ok: false, error: 'Phone number must have at least 10 digits.' };
  }
  if (!/^\d{5}$/.test(zipCode)) {
    return { ok: false, error: 'Zip code must be 5 digits.' };
  }
  return db.withDb((conn) => {
    if (customerPhoneExists(conn, digits)) {
      return { ok: false, error: 'A customer with this phone number already exists.' };
    }
    const formattedPhone = formatPhone(phone);
    try {
      const result = conn
        .prepare('INSERT INTO customers (name, phone, zip_code, date_added) VALUES (?, ?, ?, ?)')
        .run(name, formattedPhone, zipCode, todayIso());
      return { ok: true, message: `Customer "${name}" added successfully.`, id: Number(result.lastInsertRowid) };
    } catch (err) {
      if (String(err && err.message ? err.message : err).toLowerCase().includes('constraint')) {
        return { ok: false, error: 'Error adding customer.' };
      }
      throw err;
    }
  });
}

function deleteHandler(event, payload) {
  return db.withDb((conn) => {
    const active = conn
      .prepare('SELECT id FROM loans WHERE customer_id = ? AND returned_date IS NULL')
      .get(payload.id);
    if (active) {
      return { ok: false, error: 'Cannot delete customer while they have active checked out equipment.' };
    }
    conn.exec('PRAGMA foreign_keys=OFF');
    conn.exec('BEGIN');
    try {
      conn.prepare('DELETE FROM customers WHERE id = ?').run(payload.id);
      conn.exec('COMMIT');
      conn.exec('PRAGMA foreign_keys=ON');
      return { ok: true, message: 'Customer deleted successfully.' };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

function inlineUpdateHandler(event, payload) {
  const { id, field, value } = payload;
  if (!['name', 'phone', 'zip_code'].includes(field)) {
    return { ok: false, error: 'Invalid field' };
  }
  return db.withDb((conn) => {
    let newValue = value;
    if (field === 'phone') {
      const digits = normalizePhone(value);
      if (digits.length < 10) {
        return { ok: false, error: 'Phone number must have at least 10 digits.' };
      }
      if (customerPhoneExists(conn, digits, id)) {
        return { ok: false, error: 'Phone number already exists for another customer.' };
      }
      newValue = formatPhone(value);
    }
    conn.prepare(`UPDATE customers SET ${field} = ? WHERE id = ?`).run(newValue, id);
    return { ok: true, success: true };
  });
}

module.exports = {
  listHandler,
  searchHandler,
  getHandler,
  addHandler,
  deleteHandler,
  inlineUpdateHandler,
  customerPhoneExists,
};
