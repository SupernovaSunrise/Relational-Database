const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { formatPhone } = require('../shared/business-logic');

let activeDbPath = null;

function log(level, message) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  console.log(`${ts} [${String(level).toUpperCase()}] dme.main.db: ${message}`);
}

function defaultDbPath() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.app && typeof electron.app.getPath === 'function') {
      return path.join(electron.app.getPath('userData'), 'database.db');
    }
  } catch (err) {}
  return path.join(__dirname, '..', '..', 'database.db');
}

function resolveDbPath(dbPath) {
  return dbPath || activeDbPath || defaultDbPath();
}

function legacyDbPath() {
  const candidates = [
    path.join(path.dirname(process.execPath), 'database.db'),
    path.join(__dirname, '..', '..', 'database.db'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (err) {}
  }
  return null;
}

function migrateLegacyDbIfNeeded(targetPath) {
  if (fs.existsSync(targetPath)) return false;
  const legacy = legacyDbPath();
  if (!legacy) return false;
  if (fs.existsSync(`${legacy}-wal`)) {
    log('warn', `Legacy database ${legacy} has uncheckpointed WAL data; close the legacy app before first launch of the new version`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(legacy, targetPath);
  log('info', `Migrated legacy database from ${legacy} to ${targetPath}`);
  return true;
}

function connectDb(dbPath) {
  const resolved = resolveDbPath(dbPath);
  if (!activeDbPath) activeDbPath = resolved;
  const conn = new DatabaseSync(resolved);
  conn.exec('PRAGMA journal_mode=WAL');
  conn.exec('PRAGMA foreign_keys=ON');
  return conn;
}

function closeDb(conn) {
  if (conn) conn.close();
}

function withDb(fn, dbPath) {
  const conn = connectDb(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function tableColumns(conn, table) {
  return conn
    .prepare('SELECT name FROM pragma_table_info(?)')
    .all(table)
    .map((row) => row.name);
}

function initDb(dbPath) {
  const resolved = resolveDbPath(dbPath);
  activeDbPath = resolved;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  migrateLegacyDbIfNeeded(resolved);
  const conn = new DatabaseSync(resolved);
  try {
    conn.exec('PRAGMA journal_mode=WAL');
    conn.exec('PRAGMA foreign_keys=ON');
    conn.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_DATE
      );
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        zip_code TEXT NOT NULL,
        date_added TEXT NOT NULL DEFAULT CURRENT_DATE
      );
      CREATE TABLE IF NOT EXISTS equipment (
        equipment_id TEXT PRIMARY KEY,
        item_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        equipment_id TEXT NOT NULL,
        item_name TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        checked_out_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        returned_date TEXT,
        agreement_data TEXT,
        agreement_date TEXT,
        agreement_pending INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
      );
      CREATE TABLE IF NOT EXISTS checkout_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_zip_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        equipment_id TEXT NOT NULL,
        checkout_date TEXT NOT NULL,
        is_first_item INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
      );
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
      );
      CREATE TABLE IF NOT EXISTS deleted_items_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        deletion_date TEXT NOT NULL,
        sale_price TEXT
      );
    `);
    conn.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_equipment_item_name ON equipment(item_name);
      CREATE INDEX IF NOT EXISTS idx_loans_equipment_status ON loans(equipment_id, returned_date);
      CREATE INDEX IF NOT EXISTS idx_loans_customer_status ON loans(customer_id, returned_date);
      CREATE INDEX IF NOT EXISTS idx_checkout_log_date ON checkout_log(checkout_date);
      CREATE INDEX IF NOT EXISTS idx_deleted_items_date ON deleted_items_log(deletion_date);
    `);
    const customerColumns = tableColumns(conn, 'customers');
    if (!customerColumns.includes('date_added')) {
      conn.exec('ALTER TABLE customers ADD COLUMN date_added TEXT');
      conn.exec("UPDATE customers SET date_added = date('now') WHERE date_added IS NULL");
    }
    const loanColumns = tableColumns(conn, 'loans');
    if (!loanColumns.includes('agreement_data')) {
      conn.exec('ALTER TABLE loans ADD COLUMN agreement_data TEXT');
    }
    if (!loanColumns.includes('agreement_date')) {
      conn.exec('ALTER TABLE loans ADD COLUMN agreement_date TEXT');
    }
    if (!loanColumns.includes('agreement_pending')) {
      conn.exec('ALTER TABLE loans ADD COLUMN agreement_pending INTEGER NOT NULL DEFAULT 0');
    }
    if (!loanColumns.includes('item_name')) {
      conn.exec('ALTER TABLE loans ADD COLUMN item_name TEXT');
    }
    if (!loanColumns.includes('customer_name')) {
      conn.exec('ALTER TABLE loans ADD COLUMN customer_name TEXT');
    }
    if (!loanColumns.includes('customer_phone')) {
      conn.exec('ALTER TABLE loans ADD COLUMN customer_phone TEXT');
    }
    const equipmentColumns = tableColumns(conn, 'equipment');
    if (!equipmentColumns.includes('date_verified')) {
      conn.exec('ALTER TABLE equipment ADD COLUMN date_verified TEXT');
    }
    const logColumns = tableColumns(conn, 'checkout_log');
    if (!logColumns.includes('is_first_item')) {
      conn.exec('ALTER TABLE checkout_log ADD COLUMN is_first_item INTEGER NOT NULL DEFAULT 0');
    }
    const deletedLogColumns = tableColumns(conn, 'deleted_items_log');
    if (!deletedLogColumns.includes('sale_price')) {
      conn.exec('ALTER TABLE deleted_items_log ADD COLUMN sale_price TEXT');
    }
    const updatePhone = conn.prepare('UPDATE customers SET phone = ? WHERE id = ?');
    for (const row of conn.prepare('SELECT id, phone FROM customers').all()) {
      const formatted = formatPhone(row.phone);
      if (formatted !== row.phone) updatePhone.run(formatted, row.id);
    }
    conn.exec(
      'UPDATE loans SET item_name = COALESCE((SELECT item_name FROM equipment WHERE equipment_id = loans.equipment_id), loans.equipment_id) WHERE item_name IS NULL'
    );
    conn.exec(
      'UPDATE loans SET customer_name = (SELECT name FROM customers WHERE id = loans.customer_id), ' +
      'customer_phone = (SELECT phone FROM customers WHERE id = loans.customer_id) ' +
      'WHERE customer_name IS NULL OR customer_phone IS NULL'
    );
  } finally {
    conn.close();
  }
  log('info', `Database ready at ${resolved}`);
  return resolved;
}

function getUserByUsername(username) {
  return withDb((conn) => {
    const row = conn
      .prepare('SELECT id, username, password_hash, is_admin FROM users WHERE username = ?')
      .get(username);
    if (!row) return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, isAdmin: row.is_admin };
  });
}

function getUserById(id) {
  return withDb((conn) => {
    const row = conn
      .prepare('SELECT id, username, password_hash, is_admin FROM users WHERE id = ?')
      .get(id);
    if (!row) return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, isAdmin: row.is_admin };
  });
}

function createUser(username, passwordHash, isAdmin) {
  return withDb((conn) => {
    const result = conn
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(username, passwordHash, isAdmin);
    return Number(result.lastInsertRowid);
  });
}

function countUsers() {
  return withDb((conn) => {
    return conn.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  });
}

function updatePassword(id, passwordHash) {
  return withDb((conn) => {
    return conn.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id).changes;
  });
}

module.exports = {
  initDb,
  connectDb,
  closeDb,
  withDb,
  legacyDbPath,
  migrateLegacyDbIfNeeded,
  getUserByUsername,
  getUserById,
  createUser,
  countUsers,
  updatePassword,
  log,
};
