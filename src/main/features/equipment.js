const db = require('../db');
const { EQUIPMENT_ID_PATTERN, escapeLike, normalizeDateInput, normalizePhone, todayIso } = require('../../shared/business-logic');

const CUSTOMER_PHONE_STRIP_SQL =
  "REPLACE(REPLACE(REPLACE(REPLACE(customers.phone,'(',''),')',''),'-',''),' ','')";

function normalizePrice(value) {
  const cleaned = String(value == null ? '' : value).trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return '';
  const price = Number(cleaned);
  if (!Number.isFinite(price) || price <= 0) return '';
  return price.toFixed(2);
}

function listHandler(event, payload) {
  return db.withDb((conn) => {
    const search = payload && payload.search != null ? String(payload.search).trim() : '';
    let query =
      'SELECT equipment.equipment_id, equipment.item_name, equipment.date_verified, loans.id AS loan_id, ' +
      'loans.checked_out_date, loans.due_date, customers.name AS customer_name ' +
      'FROM equipment ' +
      'LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL AND loans.agreement_pending = 0 ' +
      'LEFT JOIN customers ON loans.customer_id = customers.id ';
    const params = [];
    if (search) {
      const searchPattern = `%${escapeLike(search)}%`;
      const digitsSearchPattern = `%${escapeLike(normalizePhone(search))}%`;
      query +=
        "WHERE equipment.equipment_id LIKE ? ESCAPE '\\' OR equipment.item_name LIKE ? ESCAPE '\\' " +
        "OR customers.name LIKE ? ESCAPE '\\' OR customers.phone LIKE ? ESCAPE '\\' " +
        `OR ${CUSTOMER_PHONE_STRIP_SQL} LIKE ? ESCAPE '\\' `;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, digitsSearchPattern);
    }
    query += 'ORDER BY equipment.equipment_id';
    const rows = conn.prepare(query).all(...params).map((row) => ({ ...row }));
    return { ok: true, items: rows, search };
  });
}

function addHandler(event, payload) {
  const equipmentId = String(payload.equipmentId).trim().toUpperCase();
  const itemName = String(payload.itemName).trim();
  if (!equipmentId || !itemName) {
    return { ok: false, error: 'All fields are required.' };
  }
  if (!EQUIPMENT_ID_PATTERN.test(equipmentId)) {
    return { ok: false, error: 'Equipment ID must be in format AA-0000.' };
  }
  return db.withDb((conn) => {
    try {
      conn
        .prepare('INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)')
        .run(equipmentId, itemName);
      return { ok: true, message: `Equipment "${equipmentId}" added successfully.` };
    } catch (err) {
      if (String(err && err.message ? err.message : err).toLowerCase().includes('constraint')) {
        return { ok: false, error: 'Equipment ID already exists.' };
      }
      throw err;
    }
  });
}

function deleteHandler(event, payload) {
  const equipmentId = String(payload.equipmentId);
  return db.withDb((conn) => {
    const active = conn
      .prepare('SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL')
      .get(equipmentId);
    if (active) {
      return { ok: false, error: 'Cannot delete equipment while it is checked out.' };
    }
    const row = conn.prepare('SELECT item_name FROM equipment WHERE equipment_id = ?').get(equipmentId);
    if (!row) {
      return { ok: false, error: `Equipment ${equipmentId} does not exist.` };
    }
    conn.exec('PRAGMA foreign_keys=OFF');
    conn.exec('BEGIN');
    try {
      conn.prepare('DELETE FROM equipment WHERE equipment_id = ?').run(equipmentId);
      conn.exec('COMMIT');
      conn.exec('PRAGMA foreign_keys=ON');
      return { ok: true, message: 'Equipment deleted successfully.' };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

function sellHandler(event, payload) {
  const equipmentId = String(payload.equipmentId);
  const salePrice = normalizePrice(payload.salePrice);
  if (!salePrice) {
    return { ok: false, error: 'Please enter a valid sale price (e.g., 25.00).' };
  }
  return db.withDb((conn) => {
    const active = conn
      .prepare('SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL')
      .get(equipmentId);
    if (active) {
      return { ok: false, error: 'Cannot sell equipment while it is checked out.' };
    }
    const row = conn.prepare('SELECT item_name FROM equipment WHERE equipment_id = ?').get(equipmentId);
    if (!row) {
      return { ok: false, error: `Equipment ${equipmentId} does not exist.` };
    }
    const itemName = row.item_name ? row.item_name : equipmentId;
    conn.exec('PRAGMA foreign_keys=OFF');
    conn.exec('BEGIN');
    try {
      conn
        .prepare('INSERT INTO deleted_items_log (equipment_id, item_name, deletion_date, sale_price) VALUES (?, ?, ?, ?)')
        .run(equipmentId, itemName, todayIso(), salePrice);
      conn.prepare('DELETE FROM equipment WHERE equipment_id = ?').run(equipmentId);
      conn.exec('COMMIT');
      conn.exec('PRAGMA foreign_keys=ON');
      return { ok: true, message: `Equipment ${equipmentId} sold for $${salePrice}.` };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

function inlineUpdateHandler(event, payload) {
  const { equipmentId, field, value } = payload;
  if (!['item_name', 'equipment_id', 'date_verified'].includes(field)) {
    return { ok: false, error: 'Invalid field' };
  }
  return db.withDb((conn) => {
    conn.exec('BEGIN');
    try {
      if (field === 'equipment_id') {
        const newId = String(value).trim().toUpperCase();
        if (!EQUIPMENT_ID_PATTERN.test(newId)) {
          conn.exec('ROLLBACK');
          return { ok: false, error: 'Equipment ID must be in format AA-0000.' };
        }
        conn.prepare('UPDATE loans SET equipment_id = ? WHERE equipment_id = ?').run(newId, equipmentId);
        conn.prepare('UPDATE checkout_log SET equipment_id = ? WHERE equipment_id = ?').run(newId, equipmentId);
        conn.prepare('UPDATE deleted_items_log SET equipment_id = ? WHERE equipment_id = ?').run(newId, equipmentId);
        conn.prepare('UPDATE equipment SET equipment_id = ? WHERE equipment_id = ?').run(newId, equipmentId);
      } else if (field === 'date_verified') {
        const dateValue = normalizeDateInput(String(value).trim());
        if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          conn.exec('ROLLBACK');
          return { ok: false, error: 'Date must be in YYYY-MM-DD format.' };
        }
        conn.prepare('UPDATE equipment SET date_verified = ? WHERE equipment_id = ?').run(dateValue, equipmentId);
      } else {
        conn.prepare(`UPDATE equipment SET ${field} = ? WHERE equipment_id = ?`).run(value, equipmentId);
      }
      conn.exec('COMMIT');
      return { ok: true, success: true };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

module.exports = {
  listHandler,
  addHandler,
  deleteHandler,
  sellHandler,
  inlineUpdateHandler,
};
