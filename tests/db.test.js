jest.mock('fs', () => {
  const realFs = jest.requireActual('fs');
  return {
    ...realFs,
    statSync: jest.fn(realFs.statSync),
    copyFileSync: jest.fn(realFs.copyFileSync),
  };
});

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = require('../src/main/db');
const { makeTempDir, cleanupDir } = require('./helpers');

const repoRootDb = path.join(__dirname, '..', 'database.db');
const realStatSync = jest.requireActual('fs').statSync;
const realCopyFileSync = jest.requireActual('fs').copyFileSync;

const EXPECTED_TABLES = {
  users: [
    { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'username', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'password_hash', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'is_admin', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
    { name: 'created_at', type: 'TEXT', notnull: 1, dflt_value: 'CURRENT_DATE', pk: 0 },
  ],
  customers: [
    { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'phone', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'zip_code', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'date_added', type: 'TEXT', notnull: 1, dflt_value: 'CURRENT_DATE', pk: 0 },
  ],
  equipment: [
    { name: 'equipment_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'item_name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'date_verified', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  ],
  loans: [
    { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'customer_id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'equipment_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'item_name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'customer_name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'customer_phone', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'checked_out_date', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'due_date', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'returned_date', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'agreement_data', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'agreement_date', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'agreement_pending', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  ],
  checkout_log: [
    { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'customer_zip_code', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'item_name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'equipment_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'checkout_date', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'is_first_item', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0 },
  ],
  customer_agreements: [
    { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'customer_id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'loan_id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'waiver_agreed', type: 'INTEGER', notnull: 0, dflt_value: '0', pk: 0 },
    { name: 'digital_signature_agreed', type: 'INTEGER', notnull: 0, dflt_value: '0', pk: 0 },
    { name: 'signature_data', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
    { name: 'agreed_date', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  ],
  deleted_items_log: [
    { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { name: 'equipment_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'item_name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'deletion_date', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { name: 'sale_price', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  ],
};

const EXPECTED_INDEXES = [
  'idx_checkout_log_date',
  'idx_customers_name',
  'idx_customers_phone',
  'idx_deleted_items_date',
  'idx_equipment_item_name',
  'idx_loans_customer_status',
  'idx_loans_equipment_status',
];

function openConn(dbPath) {
  const conn = new DatabaseSync(dbPath);
  conn.exec('PRAGMA foreign_keys=ON');
  return conn;
}

function tableInfo(conn, table) {
  return conn
    .prepare('PRAGMA table_info(' + table + ')')
    .all()
    .map((row) => ({
      name: row.name,
      type: row.type,
      notnull: row.notnull,
      dflt_value: row.dflt_value === undefined ? null : row.dflt_value,
      pk: row.pk,
    }));
}

function tableNames(conn) {
  return conn
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function indexNames(conn) {
  return conn
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function tableColumnNames(conn, table) {
  return conn
    .prepare('SELECT name FROM pragma_table_info(?)')
    .all(table)
    .map((row) => row.name);
}

function createLegacySchemaDb(dbPath) {
  const conn = new DatabaseSync(dbPath);
  conn.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_DATE
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      zip_code TEXT NOT NULL
    );
    CREATE TABLE equipment (
      equipment_id TEXT PRIMARY KEY,
      item_name TEXT NOT NULL
    );
    CREATE TABLE loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      equipment_id TEXT NOT NULL,
      checked_out_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      returned_date TEXT,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
    );
    CREATE TABLE checkout_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_zip_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      checkout_date TEXT NOT NULL,
      FOREIGN KEY(equipment_id) REFERENCES equipment(equipment_id)
    );
    CREATE TABLE customer_agreements (
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
    CREATE TABLE deleted_items_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      deletion_date TEXT NOT NULL
    );
  `);
  conn
    .prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)")
    .run('legacyuser', 'legacyhash', 1);
  conn
    .prepare('INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)')
    .run('Legacy Customer', '4065551234', '59901');
  conn
    .prepare('INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)')
    .run('AA-0001', 'Walker');
  conn
    .prepare('INSERT INTO loans (customer_id, equipment_id, checked_out_date, due_date) VALUES (?, ?, ?, ?)')
    .run(1, 'AA-0001', '2024-01-01', '2024-05-01');
  conn.close();
}

describe('initDb on a fresh database', () => {
  test('creates all seven legacy schema tables with matching columns', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'database.db');
    db.initDb(dbPath);
    const conn = openConn(dbPath);
    try {
      expect(tableNames(conn)).toEqual(Object.keys(EXPECTED_TABLES).sort());
      for (const [table, expectedColumns] of Object.entries(EXPECTED_TABLES)) {
        expect(tableInfo(conn, table)).toEqual(expectedColumns);
      }
    } finally {
      conn.close();
      cleanupDir(dir);
    }
  });

  test('creates all seven legacy indexes', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'database.db');
    db.initDb(dbPath);
    const conn = openConn(dbPath);
    try {
      expect(indexNames(conn)).toEqual(EXPECTED_INDEXES);
    } finally {
      conn.close();
      cleanupDir(dir);
    }
  });

  test('returns the resolved database path', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'database.db');
    expect(db.initDb(dbPath)).toBe(dbPath);
    cleanupDir(dir);
  });

  test('initDb is idempotent when run twice on the same path', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'database.db');
    db.initDb(dbPath);
    db.initDb(dbPath);
    const conn = openConn(dbPath);
    try {
      expect(tableNames(conn)).toEqual(Object.keys(EXPECTED_TABLES).sort());
      expect(indexNames(conn)).toEqual(EXPECTED_INDEXES);
    } finally {
      conn.close();
      cleanupDir(dir);
    }
  });
});

describe('migrateLegacyDbIfNeeded', () => {
  beforeEach(() => {
    fs.statSync.mockImplementation(realStatSync);
    fs.copyFileSync.mockImplementation(realCopyFileSync);
  });

  test('returns false when no legacy database source exists', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'database.db');
    expect(db.migrateLegacyDbIfNeeded(target)).toBe(false);
    expect(fs.existsSync(target)).toBe(false);
    cleanupDir(dir);
  });

  test('returns false and leaves the target untouched when the target already exists', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'database.db');
    fs.writeFileSync(target, 'newer database content');
    expect(db.migrateLegacyDbIfNeeded(target)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('newer database content');
    cleanupDir(dir);
  });

  test('copies a legacy database into an absent target', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'database.db');
    const legacyBytes = Buffer.from('legacy database content');
    fs.statSync.mockImplementation((p) => {
      if (p === repoRootDb) return { isFile: () => true };
      return realStatSync(p);
    });
    fs.copyFileSync.mockImplementation((src, dest) => {
      expect(src).toBe(repoRootDb);
      fs.writeFileSync(dest, legacyBytes);
    });
    expect(db.migrateLegacyDbIfNeeded(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('legacy database content');
    cleanupDir(dir);
  });

  test('creates the parent directory for the target when copying', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'a', 'b', 'database.db');
    fs.statSync.mockImplementation((p) => {
      if (p === repoRootDb) return { isFile: () => true };
      return realStatSync(p);
    });
    fs.copyFileSync.mockImplementation((src, dest) => {
      fs.writeFileSync(dest, 'x');
    });
    expect(db.migrateLegacyDbIfNeeded(target)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'a', 'b'))).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('x');
    cleanupDir(dir);
  });
});

describe('initDb on a legacy database with an old schema', () => {
  test('adds migration columns, preserves data, and backfills phone formatting', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'database.db');
    createLegacySchemaDb(dbPath);
    db.initDb(dbPath);
    const conn = openConn(dbPath);
    try {
      expect(tableNames(conn)).toEqual(Object.keys(EXPECTED_TABLES).sort());
      expect(tableColumnNames(conn, 'customers')).toEqual(['id', 'name', 'phone', 'zip_code', 'date_added']);
      expect(tableColumnNames(conn, 'loans')).toEqual([
        'id',
        'customer_id',
        'equipment_id',
        'checked_out_date',
        'due_date',
        'returned_date',
        'agreement_data',
        'agreement_date',
        'agreement_pending',
        'item_name',
        'customer_name',
        'customer_phone',
      ]);
      expect(tableColumnNames(conn, 'equipment')).toEqual(['equipment_id', 'item_name', 'date_verified']);
      expect(tableColumnNames(conn, 'checkout_log')).toEqual([
        'id',
        'customer_zip_code',
        'item_name',
        'equipment_id',
        'checkout_date',
        'is_first_item',
      ]);
      expect(tableColumnNames(conn, 'deleted_items_log')).toEqual([
        'id',
        'equipment_id',
        'item_name',
        'deletion_date',
        'sale_price',
      ]);
      expect(indexNames(conn)).toEqual(EXPECTED_INDEXES);

      const customer = conn.prepare('SELECT * FROM customers WHERE id = 1').get();
      expect(customer.name).toBe('Legacy Customer');
      expect(customer.phone).toBe('(406) 555-1234');
      expect(customer.zip_code).toBe('59901');
      expect(customer.date_added).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const loan = conn.prepare('SELECT * FROM loans WHERE id = 1').get();
      expect(loan.customer_id).toBe(1);
      expect(loan.equipment_id).toBe('AA-0001');
      expect(loan.item_name).toBe('Walker');
      expect(loan.customer_name).toBe('Legacy Customer');
      expect(loan.customer_phone).toBe('(406) 555-1234');
      expect(loan.checked_out_date).toBe('2024-01-01');
      expect(loan.due_date).toBe('2024-05-01');
      expect(loan.agreement_pending).toBe(0);
      expect(loan.agreement_data).toBeNull();
      expect(loan.agreement_date).toBeNull();

      const equipment = conn.prepare("SELECT * FROM equipment WHERE equipment_id = 'AA-0001'").get();
      expect(equipment.item_name).toBe('Walker');
      expect(equipment.date_verified).toBeNull();

      const log = conn.prepare('SELECT * FROM checkout_log').all();
      expect(log).toEqual([]);

      const user = conn.prepare("SELECT * FROM users WHERE username = 'legacyuser'").get();
      expect(user.password_hash).toBe('legacyhash');
    } finally {
      conn.close();
      cleanupDir(dir);
    }
  });

  test('re-running initDb after migration is still idempotent', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'database.db');
    createLegacySchemaDb(dbPath);
    db.initDb(dbPath);
    db.initDb(dbPath);
    const conn = openConn(dbPath);
    try {
      expect(tableNames(conn)).toEqual(Object.keys(EXPECTED_TABLES).sort());
      const customer = conn.prepare('SELECT * FROM customers WHERE id = 1').get();
      expect(customer.phone).toBe('(406) 555-1234');
    } finally {
      conn.close();
      cleanupDir(dir);
    }
  });
});
