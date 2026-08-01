const path = require('path');
const db = require('../db');
const ExcelJS = require('exceljs');
const { normalizePhone, formatPhone, EQUIPMENT_ID_PATTERN, todayIso } = require('../../shared/business-logic');
const { customerPhoneExists } = require('./customers');

function cellToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value.richText) return value.richText.map((part) => part.text).join('');
    return String(value);
  }
  return String(value);
}

function buildWorkbook(sheetName, headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  for (const row of rows) {
    ws.addRow(row);
  }
  return wb;
}

async function writeWorkbook(wb, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    await wb.csv.writeFile(filePath);
  } else {
    await wb.xlsx.writeFile(filePath);
  }
}

async function exportHandler(event, payload, kind) {
  const format = payload && payload.format === 'csv' ? 'csv' : 'xlsx';
  try {
    const electron = require('electron');
    const dialog = electron.dialog;
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    const defaults = {
      customers: {
        fileName: format === 'csv' ? 'customers_export.csv' : 'customers_export.xlsx',
        title: 'Export Customers',
        sheetName: 'Customers',
        headers: ['ID', 'Name', 'Phone', 'ZipCode', 'DateAdded'],
        query: 'SELECT id, name, phone, zip_code, date_added FROM customers ORDER BY id',
        map: (row) => [row.id, row.name, row.phone, row.zip_code, row.date_added],
      },
      equipment: {
        fileName: format === 'csv' ? 'equipment_export.csv' : 'equipment_export.xlsx',
        title: 'Export Equipment',
        sheetName: 'Equipment',
        headers: ['EquipmentID', 'ItemName'],
        query: 'SELECT equipment_id, item_name FROM equipment ORDER BY equipment_id',
        map: (row) => [row.equipment_id, row.item_name],
      },
      checkout_log: {
        fileName: format === 'csv' ? 'checkout_log_export.csv' : 'checkout_log_export.xlsx',
        title: 'Export Checkout Log',
        sheetName: 'Checkout Log',
        headers: [
          'Equipment ID',
          'Item Name',
          'Customer Name',
          'Customer Phone',
          'Date Checked Out',
          'Due Date',
          'Date Returned',
          'Agreement Date',
        ],
        query:
          'SELECT l.equipment_id, COALESCE(e.item_name, l.item_name) AS item_name, ' +
          'COALESCE(c.name, l.customer_name) AS customer_name, COALESCE(c.phone, l.customer_phone) AS customer_phone, ' +
          'l.checked_out_date, l.due_date, l.returned_date, l.agreement_date ' +
          'FROM loans l ' +
          'LEFT JOIN equipment e ON l.equipment_id = e.equipment_id ' +
          'LEFT JOIN customers c ON l.customer_id = c.id ' +
          'ORDER BY l.checked_out_date DESC',
        map: (row) => [
          row.equipment_id,
          row.item_name,
          row.customer_name,
          row.customer_phone,
          row.checked_out_date,
          row.due_date,
          row.returned_date,
          row.agreement_date,
        ],
      },
      master: {
        fileName: format === 'csv' ? 'equipment_list_export.csv' : 'equipment_list_export.xlsx',
        title: 'Export Home Equipment List',
        sheetName: 'Equipment List',
        headers: [
          'Equipment ID',
          'Item Name',
          'Customer Name',
          'Customer Phone',
          'Date Checked Out',
          'Return Date',
          'Status',
        ],
        query:
          'SELECT equipment.equipment_id, equipment.item_name, customers.name AS customer_name, ' +
          'customers.phone AS customer_phone, loans.checked_out_date, loans.due_date, loans.id AS loan_id ' +
          'FROM equipment ' +
          'LEFT JOIN loans ON equipment.equipment_id = loans.equipment_id AND loans.returned_date IS NULL AND loans.agreement_pending = 0 ' +
          'LEFT JOIN customers ON loans.customer_id = customers.id ' +
          'ORDER BY equipment.equipment_id ASC',
        map: (row) => {
          const status = row.loan_id
            ? row.due_date && row.due_date < todayIso()
              ? 'Overdue'
              : 'Checked Out'
            : 'Available';
          return [
            row.equipment_id,
            row.item_name,
            row.customer_name,
            row.customer_phone,
            row.checked_out_date,
            row.due_date,
            status,
          ];
        },
      },
    };
    const spec = defaults[kind];
    const result = await dialog.showSaveDialog(win, {
      title: spec.title,
      defaultPath: path.join(electron.app.getPath('downloads'), spec.fileName),
      filters:
        format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, error: 'Export cancelled.' };
    const rows = db.withDb((conn) =>
      conn
        .prepare(spec.query)
        .all()
        .map((row) => ({ ...row }))
    );
    const wb = buildWorkbook(spec.sheetName, spec.headers, rows.map(spec.map));
    await writeWorkbook(wb, result.filePath);
    return { ok: true, path: result.filePath };
  } catch (err) {
    db.log('error', `export ${kind} failed: ${err && err.message ? err.message : err}`);
    return { ok: false, error: 'Export failed.' };
  }
}

async function importHandler(event, kind) {
  try {
    const electron = require('electron');
    const dialog = electron.dialog;
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    const spec =
      kind === 'customers'
        ? { title: 'Import Customers', success: (count) => `Imported ${count} new customers successfully.` }
        : { title: 'Import Equipment', success: (count) => `Imported ${count} new equipment items successfully.` };
    const result = await dialog.showOpenDialog(win, {
      title: spec.title,
      properties: ['openFile'],
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx', 'xls'] }],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, error: 'Import cancelled.' };
    const filePath = result.filePaths[0];
    if (filePath.toLowerCase().endsWith('.xls')) {
      return { ok: false, error: 'Legacy .xls files are not supported. Please save the file as .xlsx and try again.' };
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    const count = db.withDb((conn) => {
      let imported = 0;
      conn.exec('BEGIN');
      try {
        if (kind === 'customers') {
          const insert = conn.prepare(
            'INSERT INTO customers (name, phone, zip_code, date_added) VALUES (?, ?, ?, ?)'
          );
          ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const name = cellToString(row.getCell(1).value);
            const phone = cellToString(row.getCell(2).value);
            const zipCode = cellToString(row.getCell(3).value);
            if (!name || !phone || !zipCode) return;
            const digits = normalizePhone(phone);
            if (digits.length >= 10 && /^\d{5}$/.test(zipCode)) {
              if (!customerPhoneExists(conn, digits)) {
                insert.run(name.trim(), formatPhone(phone), zipCode, todayIso());
                imported += 1;
              }
            }
          });
        } else {
          const insert = conn.prepare('INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)');
          const selectExisting = conn.prepare('SELECT equipment_id FROM equipment WHERE equipment_id = ?');
          ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const equipmentId = cellToString(row.getCell(1).value).toUpperCase();
            const itemName = cellToString(row.getCell(2).value);
            if (!equipmentId || !itemName) return;
            if (EQUIPMENT_ID_PATTERN.test(equipmentId)) {
              if (!selectExisting.get(equipmentId)) {
                insert.run(equipmentId, itemName);
                imported += 1;
              }
            }
          });
        }
        conn.exec('COMMIT');
        return imported;
      } catch (err) {
        try {
          conn.exec('ROLLBACK');
        } catch (rollbackErr) {}
        throw err;
      }
    });
    return { ok: true, message: spec.success(count), count };
  } catch (err) {
    db.log('error', `import ${kind} failed: ${err && err.message ? err.message : err}`);
    return { ok: false, error: 'An error occurred while importing the file. Please check the format and try again.' };
  }
}

function exportCustomersHandler(event, payload) {
  return exportHandler(event, payload, 'customers');
}

function exportEquipmentHandler(event, payload) {
  return exportHandler(event, payload, 'equipment');
}

function exportCheckoutLogHandler(event, payload) {
  return exportHandler(event, payload, 'checkout_log');
}

function exportMasterHandler(event, payload) {
  return exportHandler(event, payload, 'master');
}

function importCustomersHandler(event, payload) {
  return importHandler(event, 'customers');
}

function importEquipmentHandler(event, payload) {
  return importHandler(event, 'equipment');
}

module.exports = {
  exportCustomersHandler,
  exportEquipmentHandler,
  exportCheckoutLogHandler,
  exportMasterHandler,
  importCustomersHandler,
  importEquipmentHandler,
};
