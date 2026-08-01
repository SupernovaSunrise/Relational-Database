const db = require('../db');
const { calculateDueDate, normalizeDateInput, todayIso, CHECKOUT_PERIOD_DAYS } = require('../../shared/business-logic');

function getLoanHandler(event, payload) {
  return db.withDb((conn) => {
    const loan = conn
      .prepare(
        'SELECT loans.id, loans.customer_id, loans.equipment_id, COALESCE(equipment.item_name, loans.item_name) AS item_name, ' +
        'loans.checked_out_date, loans.due_date, loans.agreement_date, loans.agreement_data, ' +
        'loans.agreement_pending, loans.returned_date ' +
        'FROM loans LEFT JOIN equipment ON loans.equipment_id = equipment.equipment_id ' +
        'WHERE loans.id = ?'
      )
      .get(payload.loanId);
    if (!loan) return { ok: false, error: 'Loan not found.' };
    const customer = conn
      .prepare('SELECT id, name, phone, zip_code FROM customers WHERE id = ?')
      .get(loan.customer_id);
    if (!customer) return { ok: false, error: 'Customer not found.' };
    return {
      ok: true,
      item: { ...loan },
      customer: { ...customer },
      loanIds: String(loan.id),
      loanId: loan.id,
      checkoutDate: loan.checked_out_date || todayIso(),
      dueDate: loan.due_date || '',
      agreementDate: loan.agreement_date || '',
      checkoutPeriodDays: CHECKOUT_PERIOD_DAYS,
    };
  });
}

function getCustomerHandler(event, payload) {
  return db.withDb((conn) => {
    const customer = conn
      .prepare('SELECT id, name, phone, zip_code FROM customers WHERE id = ?')
      .get(payload.customerId);
    if (!customer) return { ok: false, error: 'Customer not found.' };
    const rows = conn
      .prepare(
        'SELECT loans.id, loans.equipment_id, COALESCE(equipment.item_name, loans.item_name) AS item_name, ' +
        'loans.checked_out_date, loans.due_date, loans.agreement_date, loans.agreement_data ' +
        'FROM loans LEFT JOIN equipment ON loans.equipment_id = equipment.equipment_id ' +
        'WHERE loans.customer_id = ? AND loans.returned_date IS NULL AND loans.agreement_data IS NOT NULL ' +
        'ORDER BY loans.checked_out_date, loans.id'
      )
      .all(payload.customerId)
      .map((row) => ({ ...row }));
    if (!rows.length) {
      return { ok: false, error: 'No signed active agreement found for this customer.' };
    }
    let latest = rows[0];
    for (const row of rows) {
      const rowKey = (row.agreement_date || '') + '|' + row.id;
      const latestKey = (latest.agreement_date || '') + '|' + latest.id;
      if (rowKey > latestKey) latest = row;
    }
    return {
      ok: true,
      customer: { ...customer },
      items: rows,
      signatureData: latest.agreement_data,
      agreementDate: latest.agreement_date,
    };
  });
}

function submitHandler(event, payload) {
  const waiverAgreed = !!payload.waiverAgreed;
  const signatureAgreed = !!payload.signatureAgreed;
  const signatureData = payload.signatureData;
  if (!waiverAgreed || !signatureAgreed) {
    return { ok: false, error: 'You must agree to both the waiver and digital signature acknowledgement.' };
  }
  if (!signatureData) {
    return { ok: false, error: 'Please provide a digital signature.' };
  }
  const checkoutDate = normalizeDateInput(payload.checkoutDate) || todayIso();
  let dueDate = calculateDueDate(checkoutDate);
  if (!dueDate) dueDate = todayIso();
  const returnBy = normalizeDateInput(payload.returnBy || '');
  if (returnBy && /^\d{4}-\d{2}-\d{2}$/.test(returnBy)) {
    dueDate = returnBy;
  }
  const agreementDate = normalizeDateInput(payload.agreementDate) || todayIso();
  const loanIds = payload.loanIds;
  return db.withDb((conn) => {
    const updateLoan = conn.prepare(
      'UPDATE loans SET checked_out_date = ?, due_date = ?, agreement_data = ?, agreement_date = ?, agreement_pending = 0 WHERE id = ? AND agreement_pending = 1 AND customer_id = ?'
    );
    conn.exec('BEGIN');
    try {
      const updatedLoans = [];
      for (const loanId of loanIds) {
        const result = updateLoan.run(checkoutDate, dueDate, signatureData, agreementDate, loanId, payload.customerId);
        if (result.changes > 0) updatedLoans.push(loanId);
      }
      if (updatedLoans.length) {
        const customerRow = conn.prepare('SELECT zip_code FROM customers WHERE id = ?').get(payload.customerId);
        if (!customerRow) {
          conn.exec('ROLLBACK');
          return { ok: false, error: 'Customer not found.' };
        }
        const placeholders = updatedLoans.map(() => '?').join(',');
        const loanRows = conn
          .prepare(
            `SELECT loans.equipment_id, equipment.item_name FROM loans LEFT JOIN equipment ON loans.equipment_id = equipment.equipment_id WHERE loans.id IN (${placeholders})`
          )
          .all(...updatedLoans);
        const insertLog = conn.prepare(
          'INSERT INTO checkout_log (customer_zip_code, item_name, equipment_id, checkout_date, is_first_item) VALUES (?, ?, ?, ?, ?)'
        );
        loanRows.forEach((row, index) => {
          insertLog.run(
            customerRow.zip_code,
            row.item_name || row.equipment_id,
            row.equipment_id,
            checkoutDate,
            index === 0 ? 1 : 0
          );
        });
        conn
          .prepare(
            'INSERT INTO customer_agreements (customer_id, loan_id, waiver_agreed, digital_signature_agreed, signature_data, agreed_date) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            payload.customerId,
            updatedLoans[0],
            waiverAgreed ? 1 : 0,
            signatureAgreed ? 1 : 0,
            signatureData,
            todayIso()
          );
      }
      conn.exec('COMMIT');
      return { ok: true, message: 'Customer agreement recorded successfully.', updatedLoanIds: updatedLoans };
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch (rollbackErr) {}
      throw err;
    }
  });
}

module.exports = {
  getLoanHandler,
  getCustomerHandler,
  submitHandler,
};
