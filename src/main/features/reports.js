const db = require('../db');

function getYearsHandler(event, payload) {
  return db.withDb((conn) => {
    const years = conn
      .prepare("SELECT DISTINCT strftime('%Y', checked_out_date) AS year FROM loans WHERE agreement_pending = 0 ORDER BY year DESC")
      .all()
      .map((row) => row.year)
      .filter((year) => year);
    return { ok: true, years };
  });
}

function getDataHandler(event, payload) {
  let reportType = payload.reportType || 'analytics';
  let yearFilter = payload.yearFilter || '';
  let monthFilter = payload.monthFilter || '';
  const dateFrom = (payload.dateFrom || '').trim();
  const dateTo = (payload.dateTo || '').trim();
  let reportData = [];
  let reportTitle = '';
  let analyticsSummary = null;
  let dailyGuests = [];
  let monthlyStats = [];
  let analyticsMonths = [];

  const years = db.withDb((conn) => {
    if (reportType === 'checkout') {
      let query = 'SELECT id, customer_zip_code, item_name, equipment_id, checkout_date, is_first_item FROM checkout_log WHERE 1=1';
      const params = [];
      if (yearFilter) {
        query += " AND strftime('%Y', checkout_date) = ?";
        params.push(yearFilter);
      }
      if (dateFrom) {
        query += ' AND checkout_date >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ' AND checkout_date <= ?';
        params.push(dateTo);
      }
      query += ' ORDER BY checkout_date DESC';
      reportData = conn.prepare(query).all(...params).map((row) => ({ ...row }));
      reportTitle = 'Checkout Log';
    } else if (reportType === 'item_sales') {
      let query = 'SELECT id, equipment_id, item_name, deletion_date FROM deleted_items_log WHERE 1=1';
      const params = [];
      if (yearFilter) {
        query += " AND strftime('%Y', deletion_date) = ?";
        params.push(yearFilter);
      }
      if (dateFrom) {
        query += ' AND deletion_date >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ' AND deletion_date <= ?';
        params.push(dateTo);
      }
      query += ' ORDER BY deletion_date DESC';
      reportData = conn.prepare(query).all(...params).map((row) => ({ ...row }));
      reportTitle = 'Item Sales Log';
    } else if (reportType === 'analytics') {
      reportTitle = 'Analytics';
      const yearClause = yearFilter ? "AND strftime('%Y', checked_out_date) = ?" : '';
      const params = yearFilter ? [yearFilter] : [];
      analyticsMonths = conn
        .prepare(
          `SELECT DISTINCT strftime('%Y-%m', checked_out_date) AS month FROM loans WHERE agreement_pending = 0 ${yearClause} ORDER BY month DESC`
        )
        .all(...params)
        .map((row) => row.month)
        .filter((month) => month);
      if (!analyticsMonths.includes(monthFilter)) {
        monthFilter = analyticsMonths.length ? analyticsMonths[0] : '';
      }
      let dailyClause = yearClause;
      const dailyParams = [...params];
      if (monthFilter) {
        dailyClause += " AND strftime('%Y-%m', checked_out_date) = ?";
        dailyParams.push(monthFilter);
      }
      dailyGuests = conn
        .prepare(
          `SELECT checked_out_date AS date, COUNT(DISTINCT customer_id || '_' || checked_out_date) AS guest_count, COUNT(*) AS item_count FROM loans WHERE agreement_pending = 0 ${dailyClause} GROUP BY checked_out_date ORDER BY checked_out_date DESC`
        )
        .all(...dailyParams)
        .map((row) => ({ ...row }));
      const rawMonthly = conn
        .prepare(
          `SELECT strftime('%Y-%m', checked_out_date) AS month_year, COUNT(DISTINCT customer_id || '_' || checked_out_date) AS total_guests, COUNT(*) AS total_items, COUNT(DISTINCT checked_out_date) AS active_days FROM loans WHERE agreement_pending = 0 ${yearClause} GROUP BY month_year ORDER BY month_year DESC`
        )
        .all(...params);
      for (const row of rawMonthly) {
        const activeDays = row.active_days || 1;
        monthlyStats.push({
          month_year: row.month_year,
          total_guests: row.total_guests,
          total_items: row.total_items,
          avg_guests_per_day: row.total_guests / activeDays,
          avg_items_per_day: row.total_items / activeDays,
        });
      }
      const summaryRow = conn
        .prepare(
          `SELECT COUNT(DISTINCT customer_id || '_' || checked_out_date) AS total_guests, COUNT(*) AS total_checkouts, COUNT(DISTINCT checked_out_date) AS total_days FROM loans WHERE agreement_pending = 0 ${yearClause}`
        )
        .get(...params);
      if (summaryRow && summaryRow.total_checkouts) {
        const totalDays = summaryRow.total_days || 1;
        analyticsSummary = {
          total_checkouts: summaryRow.total_checkouts,
          unique_guests: summaryRow.total_guests,
          avg_per_day: summaryRow.total_guests / totalDays,
        };
      }
    }
    return conn
      .prepare("SELECT DISTINCT strftime('%Y', checked_out_date) AS year FROM loans WHERE agreement_pending = 0 ORDER BY year DESC")
      .all()
      .map((row) => row.year)
      .filter((year) => year);
  });

  return {
    ok: true,
    reportType,
    reportTitle,
    reportData,
    yearFilter,
    monthFilter,
    dateFrom,
    dateTo,
    years,
    analyticsMonths,
    analyticsSummary,
    dailyGuests,
    monthlyStats,
  };
}

function deleteCheckoutHandler(event, payload) {
  return db.withDb((conn) => {
    conn.prepare('DELETE FROM checkout_log WHERE id = ?').run(payload.id);
    return { ok: true, message: 'Checkout log entry removed successfully.' };
  });
}

function deleteItemSaleHandler(event, payload) {
  return db.withDb((conn) => {
    conn.prepare('DELETE FROM deleted_items_log WHERE id = ?').run(payload.id);
    return { ok: true, message: 'Item sale log entry removed successfully.' };
  });
}

module.exports = {
  getYearsHandler,
  getDataHandler,
  deleteCheckoutHandler,
  deleteItemSaleHandler,
};
