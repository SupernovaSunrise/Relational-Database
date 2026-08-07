const db = require('../db');
const { calculateDueDate, normalizeDateInput, todayIso } = require('../../shared/business-logic');

function getMasterDataHandler(event, payload) {
  return db.withDb((conn) => {
    const rows = conn
      .prepare(
        'SELECT equipment.equipment_id, equipment.item_name, customers.id AS customer_id, ' +
        'customers.name AS customer_name, customers.phone AS customer_phone, loans.id AS loan_id, ' +
        'loans.checked_out_date, loans.due_date, loans.agreement_data ' +
        'FROM equipment ' +
        'LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL AND loans.agreement_pending = 0 ' +
        'LEFT JOIN customers ON loans.customer_id = customers.id ' +
        'ORDER BY equipment.equipment_id ASC'
      )
      .all()
      .map((row) => ({ ...row }));
    const availableEquipment = conn
      .prepare(
        'SELECT equipment.equipment_id, equipment.item_name FROM equipment ' +
        'LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL ' +
        'WHERE loans.id IS NULL ORDER BY equipment.equipment_id'
      )
      .all()
      .map((row) => ({ ...row }));
    return {
      ok: true,
      rows,
      availableEquipment,
      todayStr: todayIso(),
      search: '',
      sortBy: 'equipment_id',
      sortDir: 'asc',
      dateFrom: '',
      dateTo: '',
      checkoutCandidates: null,
      pendingEquipmentIds: [],
      pendingCustomerReference: null,
    };
  });
}

function checkoutHandler(event, payload) {
  const { customerId, equipmentIds, checkoutDate } = payload;
  const ids = equipmentIds
    .map((rawId) => String(rawId).trim().toUpperCase())
    .filter((equipmentId) => equipmentId.length > 0);
  if (!ids.length) {
    return { ok: false, error: 'Please select at least one piece of equipment.' };
  }
  return db.withDb((conn) => {
    const customer = conn.prepare('SELECT id, name, phone FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return { ok: false, error: 'Customer not found. Use an existing ID, name, phone, or ZIP.' };
    }
    const checkedOutDate = normalizeDateInput(checkoutDate || '') || todayIso();
    const dueDate = calculateDueDate(checkedOutDate) || todayIso();
    const getEquipment = conn.prepare('SELECT equipment_id, item_name FROM equipment WHERE equipment_id = ?');
    const getActiveLoan = conn.prepare('SELECT id FROM loans WHERE equipment_id = ? AND returned_date IS NULL');
    const insertLoan = conn.prepare(
      'INSERT INTO loans (customer_id, equipment_id, item_name, customer_name, customer_phone, checked_out_date, due_date, agreement_data, agreement_date, agreement_pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    );
    conn.exec('BEGIN');
    try {
      const loanIds = [];
      for (const equipmentId of ids) {
        const equipment = getEquipment.get(equipmentId);
        if (!equipment) {
          conn.exec('ROLLBACK');
          return { ok: false, error: `Equipment ${equipmentId} does not exist.` };
        }
        if (getActiveLoan.get(equipmentId)) {
          conn.exec('ROLLBACK');
          return { ok: false, error: `Equipment ${equipmentId} is already checked out.` };
        }
        const result = insertLoan.run(
          customerId,
          equipmentId,
          equipment.item_name || equipmentId,
          customer.name,
          customer.phone,
          checkedOutDate,
          dueDate,
          null,
          null
        );
        loanIds.push(Number(result.lastInsertRowid));
        conn.prepare('UPDATE equipment SET date_verified = ? WHERE equipment_id = ?').run(checkedOutDate, equipmentId);
      }
      conn.exec('COMMIT');
      return {
        ok: true,
        customerId,
        loanIds,
        loanIdsCsv: loanIds.join(','),
        checkoutDate: checkedOutDate,
        dueDate,
        newCustomer: false,
      };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

function returnHandler(event, payload) {
  return db.withDb((conn) => {
    conn.prepare('UPDATE loans SET returned_date = ? WHERE id = ?').run(todayIso(), payload.loanId);
    return { ok: true, message: 'Equipment returned successfully.' };
  });
}

function inlineUpdateHandler(event, payload) {
  const { loanId, field, value } = payload;
  if (!['checked_out_date', 'due_date'].includes(field)) {
    return { ok: false, error: 'Invalid field' };
  }
  const dateValue = normalizeDateInput(String(value).trim());
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return { ok: false, error: 'Date must be in YYYY-MM-DD format.' };
  }
  return db.withDb((conn) => {
    const loan = conn.prepare('SELECT id FROM loans WHERE id = ?').get(loanId);
    if (!loan) {
      return { ok: false, error: 'Loan not found.' };
    }
    conn.prepare(`UPDATE loans SET ${field} = ? WHERE id = ?`).run(dateValue, loanId);
    return { ok: true, success: true };
  });
}

function cancelPendingHandler(event, payload) {
  const loanIds = payload.loanIds;
  if (!loanIds.length) {
    return { ok: true, message: 'Checkout cancelled and pending items removed.' };
  }
  return db.withDb((conn) => {
    const placeholders = loanIds.map(() => '?').join(',');
    conn.exec('BEGIN');
    try {
      const cancelled = conn
        .prepare(`SELECT equipment_id, checked_out_date FROM loans WHERE id IN (${placeholders}) AND agreement_pending = 1`)
        .all(...loanIds);
      const deleteLog = conn.prepare('DELETE FROM checkout_log WHERE equipment_id = ? AND checkout_date = ?');
      for (const row of cancelled) {
        deleteLog.run(row.equipment_id, row.checked_out_date);
      }
      conn
        .prepare(`DELETE FROM loans WHERE id IN (${placeholders}) AND agreement_pending = 1`)
        .run(...loanIds);
      conn.exec('COMMIT');
      return { ok: true, message: 'Checkout cancelled and pending items removed.' };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

module.exports = {
  getMasterDataHandler,
  checkoutHandler,
  returnHandler,
  cancelPendingHandler,
  inlineUpdateHandler,
};
