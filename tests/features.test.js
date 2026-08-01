const db = require('../src/main/db');
const customers = require('../src/main/features/customers');
const equipment = require('../src/main/features/equipment');
const loans = require('../src/main/features/loans');
const agreements = require('../src/main/features/agreements');
const reports = require('../src/main/features/reports');
const { calculateDueDate } = require('../src/shared/business-logic');
const { initTempDb, cleanupDir, todayIso, fakeEvent } = require('./helpers');

const evt = fakeEvent(1);

function seedCustomer(name, phone, zip) {
  return db.withDb((conn) => {
    const result = conn
      .prepare('INSERT INTO customers (name, phone, zip_code, date_added) VALUES (?, ?, ?, ?)')
      .run(name, phone, zip, todayIso());
    return Number(result.lastInsertRowid);
  });
}

function seedEquipment(equipmentId, itemName) {
  return db.withDb((conn) => {
    conn.prepare('INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)').run(equipmentId, itemName);
  });
}

function seedUser(username, passwordHash, isAdmin) {
  return db.withDb((conn) => {
    const result = conn
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(username, passwordHash, isAdmin);
    return Number(result.lastInsertRowid);
  });
}

function checkoutAndAgree(customerId, equipmentIds, checkoutDate, agreementDate) {
  const checkout = loans.checkoutHandler(evt, { customerId, equipmentIds, checkoutDate });
  expect(checkout.ok).toBe(true);
  const submit = agreements.submitHandler(evt, {
    customerId,
    loanIds: checkout.loanIds,
    checkoutDate,
    agreementDate,
    waiverAgreed: true,
    signatureAgreed: true,
    signatureData: 'data:image/png;base64,test-signature',
  });
  expect(submit.ok).toBe(true);
  return { checkout, submit };
}

describe('customers feature', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('addHandler validates all fields before inserting', () => {
    expect(customers.addHandler(evt, { name: '', phone: '', zipCode: '' })).toEqual({
      ok: false,
      error: 'All fields are required.',
    });
    expect(customers.addHandler(evt, { name: 'A', phone: '406555123', zipCode: '59901' })).toEqual({
      ok: false,
      error: 'Phone number must have at least 10 digits.',
    });
    expect(customers.addHandler(evt, { name: 'A', phone: '4065551234', zipCode: '5990' })).toEqual({
      ok: false,
      error: 'Zip code must be 5 digits.',
    });
    expect(customers.addHandler(evt, { name: 'A', phone: '4065551234', zipCode: '59901a' })).toEqual({
      ok: false,
      error: 'Zip code must be 5 digits.',
    });
  });

  test('addHandler formats and stores the phone and assigns date_added', () => {
    const result = customers.addHandler(evt, { name: 'Alice Smith', phone: '406-555-1234', zipCode: '59901' });
    expect(result.ok).toBe(true);
    expect(result.id).toBe(1);
    const row = db.withDb((conn) => conn.prepare('SELECT * FROM customers WHERE id = 1').get());
    expect(row.phone).toBe('(406) 555-1234');
    expect(row.name).toBe('Alice Smith');
    expect(row.date_added).toBe(todayIso());
  });

  test('duplicate phone numbers are rejected even with different formatting', () => {
    customers.addHandler(evt, { name: 'Alice', phone: '(406) 555-1234', zipCode: '59901' });
    const dup = customers.addHandler(evt, { name: 'Bob', phone: '406-555-1234', zipCode: '59901' });
    expect(dup.ok).toBe(false);
    expect(dup.error).toBe('A customer with this phone number already exists.');
  });

  test('listHandler returns all customers sorted by name and supports search', () => {
    seedCustomer('Bob Jones', '(406) 555-9876', '59001');
    seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const all = customers.listHandler(evt, {});
    expect(all.ok).toBe(true);
    expect(all.items.map((c) => c.name)).toEqual(['Alice Smith', 'Bob Jones']);
    const byName = customers.listHandler(evt, { search: 'ali' });
    expect(byName.items.map((c) => c.name)).toEqual(['Alice Smith', 'Bob Jones']);
    const byZip = customers.listHandler(evt, { search: '59901' });
    expect(byZip.items.map((c) => c.name)).toEqual(['Alice Smith']);
    const byPhone = customers.listHandler(evt, { search: '406' });
    expect(byPhone.items.map((c) => c.name)).toEqual(['Alice Smith', 'Bob Jones']);
  });

  test('searchHandler finds customers by id, name, phone, and zip', () => {
    seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    seedCustomer('Bob Jones', '(406) 555-9876', '59001');
    const byId = customers.searchHandler(evt, { query: '1' });
    expect(byId.items.map((c) => c.name)).toEqual(['Alice Smith']);
    const byName = customers.searchHandler(evt, { query: 'smith' });
    expect(byName.items.map((c) => c.name)).toEqual(['Alice Smith']);
    const byPhone = customers.searchHandler(evt, { query: '5551234' });
    expect(byPhone.items.map((c) => c.name)).toEqual(['Alice Smith']);
    const byZip = customers.searchHandler(evt, { query: '59001' });
    expect(byZip.items.map((c) => c.name)).toEqual(['Bob Jones']);
  });

  test('getHandler returns one customer or a not-found error', () => {
    seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const found = customers.getHandler(evt, { id: 1 });
    expect(found.ok).toBe(true);
    expect(found.item.name).toBe('Alice Smith');
    expect(found.item.date_added).toBe(todayIso());
    expect(customers.getHandler(evt, { id: 999 })).toEqual({ ok: false, error: 'Customer not found.' });
  });

  test('inlineUpdateHandler validates the field name and phone rules', () => {
    seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    seedCustomer('Bob Jones', '(406) 555-9876', '59001');
    expect(customers.inlineUpdateHandler(evt, { id: 1, field: 'email', value: 'a@b.c' })).toEqual({
      ok: false,
      error: 'Invalid field',
    });
    expect(
      customers.inlineUpdateHandler(evt, { id: 1, field: 'phone', value: '40655512' })
    ).toEqual({ ok: false, error: 'Phone number must have at least 10 digits.' });
    expect(
      customers.inlineUpdateHandler(evt, { id: 1, field: 'phone', value: '(406) 555-9876' })
    ).toEqual({ ok: false, error: 'Phone number already exists for another customer.' });
    expect(customers.inlineUpdateHandler(evt, { id: 1, field: 'name', value: 'Alice Updated' }).ok).toBe(true);
    expect(customers.inlineUpdateHandler(evt, { id: 1, field: 'phone', value: '4065551234' }).ok).toBe(true);
    const row = db.withDb((conn) => conn.prepare('SELECT * FROM customers WHERE id = 1').get());
    expect(row.name).toBe('Alice Updated');
    expect(row.phone).toBe('(406) 555-1234');
  });

  test('deleteHandler blocks customers with active loans', () => {
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    seedEquipment('AA-0001', 'Walker');
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const result = customers.deleteHandler(evt, { id: customerId });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Cannot delete customer while they have active checked out equipment.');
  });

  test('deleteHandler removes customers, their loans, agreements, and checkout log entries', () => {
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    seedEquipment('AA-0001', 'Walker');
    checkoutAndAgree(customerId, ['AA-0001'], '2024-03-01', '2024-03-01');
    loans.returnHandler(evt, { loanId: 1 });
    const result = customers.deleteHandler(evt, { id: customerId });
    expect(result.ok).toBe(true);
    const counts = db.withDb((conn) => ({
      customers: conn.prepare('SELECT COUNT(*) AS c FROM customers').get().c,
      loans: conn.prepare('SELECT COUNT(*) AS c FROM loans').get().c,
      agreements: conn.prepare('SELECT COUNT(*) AS c FROM customer_agreements').get().c,
      log: conn.prepare('SELECT COUNT(*) AS c FROM checkout_log').get().c,
    }));
    expect(counts).toEqual({ customers: 0, loans: 0, agreements: 0, log: 0 });
  });
});

describe('equipment feature', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('addHandler validates required fields and the AA-0000 format', () => {
    expect(equipment.addHandler(evt, { equipmentId: '', itemName: '' })).toEqual({
      ok: false,
      error: 'All fields are required.',
    });
    expect(equipment.addHandler(evt, { equipmentId: 'AA-001', itemName: 'Walker' })).toEqual({
      ok: false,
      error: 'Equipment ID must be in format AA-0000.',
    });
    expect(equipment.addHandler(evt, { equipmentId: 'AA-12345', itemName: 'Walker' })).toEqual({
      ok: false,
      error: 'Equipment ID must be in format AA-0000.',
    });
    expect(equipment.addHandler(evt, { equipmentId: '1A-0001', itemName: 'Walker' })).toEqual({
      ok: false,
      error: 'Equipment ID must be in format AA-0000.',
    });
    expect(equipment.addHandler(evt, { equipmentId: 'aa-0001', itemName: 'Walker' }).ok).toBe(true);
    const row = db.withDb((conn) => conn.prepare("SELECT * FROM equipment WHERE equipment_id = 'AA-0001'").get());
    expect(row.item_name).toBe('Walker');
  });

  test('duplicate equipment IDs are rejected', () => {
    seedEquipment('AA-0001', 'Walker');
    const result = equipment.addHandler(evt, { equipmentId: 'AA-0001', itemName: 'Second' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Equipment ID already exists.');
  });

  test('listHandler supports search and excludes pending loans from active joins', () => {
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const all = equipment.listHandler(evt, {});
    expect(all.items.map((i) => i.equipment_id)).toEqual(['AA-0001', 'BB-0002']);
    expect(all.items.every((i) => i.loan_id === null)).toBe(true);
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const afterCheckout = equipment.listHandler(evt, { search: 'walker' });
    expect(afterCheckout.items[0].loan_id).toBeNull();
  });

  test('listHandler shows checked-out equipment with customer info after agreement', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    checkoutAndAgree(customerId, ['AA-0001'], '2024-03-01', '2024-03-01');
    const result = equipment.listHandler(evt, { search: '406' });
    expect(result.items[0].loan_id).toBe(1);
    expect(result.items[0].customer_name).toBe('Alice Smith');
    expect(result.items[0].checked_out_date).toBe('2024-03-01');
    expect(result.items[0].due_date).toBe('2024-08-21');
  });

  test('deleteHandler blocks checked-out equipment and removes without logging a sale', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const blocked = equipment.deleteHandler(evt, { equipmentId: 'AA-0001' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('Cannot delete equipment while it is checked out.');
    loans.cancelPendingHandler(evt, { loanIds: [1] });
    const deleted = equipment.deleteHandler(evt, { equipmentId: 'AA-0001' });
    expect(deleted.ok).toBe(true);
    const rows = db.withDb((conn) => ({
      equipment: conn.prepare('SELECT COUNT(*) AS c FROM equipment').get().c,
      deletedLog: conn.prepare('SELECT COUNT(*) AS c FROM deleted_items_log').get().c,
    }));
    expect(rows.equipment).toBe(0);
    expect(rows.deletedLog).toBe(0);
  });

  test('sellHandler records a sale with price and removes the equipment', () => {
    seedEquipment('AA-0001', 'Walker');
    expect(equipment.sellHandler(evt, { equipmentId: 'AA-0001', salePrice: 'not-a-price' })).toEqual({
      ok: false,
      error: 'Please enter a valid sale price (e.g., 25.00).',
    });
    expect(equipment.sellHandler(evt, { equipmentId: 'AA-0001', salePrice: '0' })).toEqual({
      ok: false,
      error: 'Please enter a valid sale price (e.g., 25.00).',
    });
    expect(equipment.sellHandler(evt, { equipmentId: 'ZZ-9999', salePrice: '25.00' })).toEqual({
      ok: false,
      error: 'Equipment ZZ-9999 does not exist.',
    });
    const sold = equipment.sellHandler(evt, { equipmentId: 'AA-0001', salePrice: '$25.5' });
    expect(sold.ok).toBe(true);
    expect(sold.message).toBe('Equipment AA-0001 sold for $25.50.');
    const rows = db.withDb((conn) => ({
      equipment: conn.prepare('SELECT COUNT(*) AS c FROM equipment').get().c,
      deletedLog: conn.prepare('SELECT * FROM deleted_items_log').all(),
    }));
    expect(rows.equipment).toBe(0);
    expect(rows.deletedLog).toEqual([
      { id: 1, equipment_id: 'AA-0001', item_name: 'Walker', deletion_date: todayIso(), sale_price: '25.50' },
    ]);
  });

  test('sellHandler blocks selling checked-out equipment', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const result = equipment.sellHandler(evt, { equipmentId: 'AA-0001', salePrice: '25.00' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Cannot sell equipment while it is checked out.');
  });

  test('inlineUpdateHandler validates fields and renames equipment_id', () => {
    seedEquipment('AA-0001', 'Walker');
    expect(equipment.inlineUpdateHandler(evt, { equipmentId: 'AA-0001', field: 'price', value: '1' })).toEqual({
      ok: false,
      error: 'Invalid field',
    });
    expect(
      equipment.inlineUpdateHandler(evt, { equipmentId: 'AA-0001', field: 'date_verified', value: 'not-a-date' })
    ).toEqual({ ok: false, error: 'Date must be in YYYY-MM-DD format.' });
    expect(
      equipment.inlineUpdateHandler(evt, { equipmentId: 'AA-0001', field: 'date_verified', value: '03/01/2024' }).ok
    ).toBe(true);
    expect(
      equipment.inlineUpdateHandler(evt, { equipmentId: 'AA-0001', field: 'item_name', value: 'Heavy Walker' }).ok
    ).toBe(true);
    expect(
      equipment.inlineUpdateHandler(evt, { equipmentId: 'AA-0001', field: 'equipment_id', value: 'AA-0002' }).ok
    ).toBe(true);
    const row = db.withDb((conn) => conn.prepare("SELECT * FROM equipment WHERE equipment_id = 'AA-0002'").get());
    expect(row.item_name).toBe('Heavy Walker');
    expect(row.date_verified).toBe('2024-03-01');
    expect(db.withDb((conn) => conn.prepare("SELECT COUNT(*) AS c FROM equipment WHERE equipment_id = 'AA-0001'").get().c)).toBe(0);
  });

  test('equipment_id rename against rows referencing the old id currently fails on the FK constraint', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    expect(() =>
      equipment.inlineUpdateHandler(evt, { equipmentId: 'AA-0001', field: 'equipment_id', value: 'AA-0002' })
    ).toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe('loans feature', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('checkoutHandler validates the basic conditions', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    expect(loans.checkoutHandler(evt, { customerId, equipmentIds: [], checkoutDate: '2024-03-01' })).toEqual({
      ok: false,
      error: 'Please select at least one piece of equipment.',
    });
    expect(
      loans.checkoutHandler(evt, { customerId: 999, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' })
    ).toEqual({ ok: false, error: 'Customer not found. Use an existing ID, name, phone, or ZIP.' });
    expect(
      loans.checkoutHandler(evt, { customerId, equipmentIds: ['ZZ-9999'], checkoutDate: '2024-03-01' })
    ).toEqual({ ok: false, error: 'Equipment ZZ-9999 does not exist.' });
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    expect(
      loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' })
    ).toEqual({ ok: false, error: 'Equipment AA-0001 is already checked out.' });
  });

  test('checkoutHandler inserts pending loans with the parity-correct due date', () => {
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const result = loans.checkoutHandler(evt, {
      customerId,
      equipmentIds: ['AA-0001', 'BB-0002'],
      checkoutDate: '2024-03-01',
    });
    expect(result.ok).toBe(true);
    expect(result.loanIds).toHaveLength(2);
    expect(result.checkoutDate).toBe('2024-03-01');
    expect(result.dueDate).toBe('2024-08-21');
    expect(calculateDueDate('2024-03-01')).toBe('2024-08-21');
    const rows = db.withDb((conn) =>
      conn
        .prepare('SELECT equipment_id, checked_out_date, due_date, agreement_pending, agreement_data, agreement_date FROM loans ORDER BY id')
        .all()
    );
    expect(rows).toEqual([
      { equipment_id: 'AA-0001', checked_out_date: '2024-03-01', due_date: '2024-08-21', agreement_pending: 1, agreement_data: null, agreement_date: null },
      { equipment_id: 'BB-0002', checked_out_date: '2024-03-01', due_date: '2024-08-21', agreement_pending: 1, agreement_data: null, agreement_date: null },
    ]);
  });

  test('checkoutHandler defaults to today when no checkout date is supplied', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const result = loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'] });
    expect(result.checkoutDate).toBe(todayIso());
    expect(result.dueDate).toBe(calculateDueDate(todayIso()));
  });

  test('checkoutHandler sets date_verified on the equipment', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const row = db.withDb((conn) => conn.prepare("SELECT date_verified FROM equipment WHERE equipment_id = 'AA-0001'").get());
    expect(row.date_verified).toBe('2024-03-01');
  });

  test('inlineUpdateHandler validates dates and updates checkout and return dates', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    expect(loans.inlineUpdateHandler(evt, { loanId: 1, field: 'price', value: '1' })).toEqual({
      ok: false,
      error: 'Invalid field',
    });
    expect(
      loans.inlineUpdateHandler(evt, { loanId: 1, field: 'checked_out_date', value: 'nonsense' })
    ).toEqual({ ok: false, error: 'Date must be in YYYY-MM-DD format.' });
    expect(loans.inlineUpdateHandler(evt, { loanId: 1, field: 'checked_out_date', value: '04/01/2024' }).ok).toBe(true);
    expect(loans.inlineUpdateHandler(evt, { loanId: 1, field: 'due_date', value: '2024-09-01' }).ok).toBe(true);
    const row = db.withDb((conn) => conn.prepare('SELECT checked_out_date, due_date FROM loans WHERE id = 1').get());
    expect(row.checked_out_date).toBe('2024-04-01');
    expect(row.due_date).toBe('2024-09-01');
    expect(loans.inlineUpdateHandler(evt, { loanId: 999, field: 'due_date', value: '2024-09-01' })).toEqual({
      ok: false,
      error: 'Loan not found.',
    });
  });

  test('getPendingHandler lists pending loans and getByCustomerHandler requires signed agreements', () => {
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    expect(loans.getPendingHandler(evt, {}).items).toEqual([]);
    expect(loans.getByCustomerHandler(evt, { customerId }).ok).toBe(true);
    expect(loans.getByCustomerHandler(evt, { customerId }).items).toEqual([]);
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const pending = loans.getPendingHandler(evt, {});
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0].equipment_id).toBe('AA-0001');
    expect(pending.items[0].customer_name).toBe('Alice Smith');
    expect(loans.getByCustomerHandler(evt, { customerId: 999 })).toEqual({ ok: false, error: 'Customer not found.' });
  });

  test('returnHandler sets the returned date and frees the equipment', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    checkoutAndAgree(customerId, ['AA-0001'], '2024-03-01', '2024-03-01');
    const result = loans.returnHandler(evt, { loanId: 1 });
    expect(result.ok).toBe(true);
    const loan = db.withDb((conn) => conn.prepare('SELECT returned_date FROM loans WHERE id = 1').get());
    expect(loan.returned_date).toBe(todayIso());
    const master = loans.getMasterDataHandler(evt, {});
    expect(master.availableEquipment.map((e) => e.equipment_id)).toEqual(['AA-0001']);
  });

  test('cancelPendingHandler removes pending loans', () => {
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    expect(loans.cancelPendingHandler(evt, { loanIds: [] }).ok).toBe(true);
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001', 'BB-0002'], checkoutDate: '2024-03-01' });
    expect(loans.getPendingHandler(evt, {}).items).toHaveLength(2);
    const cancelled = loans.cancelPendingHandler(evt, { loanIds: [1, 2] });
    expect(cancelled.ok).toBe(true);
    expect(loans.getPendingHandler(evt, {}).items).toEqual([]);
    expect(db.withDb((conn) => conn.prepare('SELECT COUNT(*) AS c FROM loans').get().c)).toBe(0);
  });

  test('getMasterDataHandler reports availability and pending state', () => {
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const empty = loans.getMasterDataHandler(evt, {});
    expect(empty.availableEquipment.map((e) => e.equipment_id)).toEqual(['AA-0001', 'BB-0002']);
    expect(empty.todayStr).toBe(todayIso());
    loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const pending = loans.getMasterDataHandler(evt, {});
    expect(pending.availableEquipment.map((e) => e.equipment_id)).toEqual(['BB-0002']);
    const aa = pending.rows.find((r) => r.equipment_id === 'AA-0001');
    expect(aa.loan_id).toBeNull();
  });
});

describe('agreements feature', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('submitHandler requires waiver, signature agreement, and signature data', () => {
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    seedEquipment('AA-0001', 'Walker');
    const base = {
      customerId,
      loanIds: [1],
      checkoutDate: '2024-03-01',
      agreementDate: '2024-03-01',
      waiverAgreed: false,
      signatureAgreed: false,
      signatureData: '',
    };
    expect(agreements.submitHandler(evt, base)).toEqual({
      ok: false,
      error: 'You must agree to both the waiver and digital signature acknowledgement.',
    });
    expect(
      agreements.submitHandler(evt, { ...base, waiverAgreed: true, signatureAgreed: true })
    ).toEqual({ ok: false, error: 'Please provide a digital signature.' });
  });

  test('submitHandler finalizes pending loans and writes checkout_log and customer_agreements', () => {
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const checkout = loans.checkoutHandler(evt, {
      customerId,
      equipmentIds: ['AA-0001', 'BB-0002'],
      checkoutDate: '2024-03-01',
    });
    const submit = agreements.submitHandler(evt, {
      customerId,
      loanIds: checkout.loanIds,
      checkoutDate: '2024-03-01',
      agreementDate: '03/01/2024',
      waiverAgreed: true,
      signatureAgreed: true,
      signatureData: 'data:image/png;base64,test-signature',
    });
    expect(submit.ok).toBe(true);
    expect(submit.updatedLoanIds).toEqual([1, 2]);
    expect(loans.getPendingHandler(evt, {}).items).toEqual([]);

    const loanRows = db.withDb((conn) =>
      conn.prepare('SELECT checked_out_date, due_date, agreement_data, agreement_date, agreement_pending FROM loans ORDER BY id').all()
    );
    expect(loanRows).toEqual([
      { checked_out_date: '2024-03-01', due_date: '2024-08-21', agreement_data: 'data:image/png;base64,test-signature', agreement_date: '2024-03-01', agreement_pending: 0 },
      { checked_out_date: '2024-03-01', due_date: '2024-08-21', agreement_data: 'data:image/png;base64,test-signature', agreement_date: '2024-03-01', agreement_pending: 0 },
    ]);

    const logRows = db.withDb((conn) =>
      conn.prepare('SELECT customer_zip_code, item_name, equipment_id, checkout_date, is_first_item FROM checkout_log ORDER BY id').all()
    );
    expect(logRows).toEqual([
      { customer_zip_code: '59901', item_name: 'Walker', equipment_id: 'AA-0001', checkout_date: '2024-03-01', is_first_item: 1 },
      { customer_zip_code: '59901', item_name: 'Wheelchair', equipment_id: 'BB-0002', checkout_date: '2024-03-01', is_first_item: 0 },
    ]);

    const agreementRows = db.withDb((conn) =>
      conn
        .prepare('SELECT customer_id, loan_id, waiver_agreed, digital_signature_agreed, signature_data, agreed_date FROM customer_agreements')
        .all()
    );
    expect(agreementRows).toEqual([
      {
        customer_id: customerId,
        loan_id: 1,
        waiver_agreed: 1,
        digital_signature_agreed: 1,
        signature_data: 'data:image/png;base64,test-signature',
        agreed_date: todayIso(),
      },
    ]);
  });

  test('submitHandler honors an explicit returnBy override', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const checkout = loans.checkoutHandler(evt, {
      customerId,
      equipmentIds: ['AA-0001'],
      checkoutDate: '2024-03-01',
    });
    const submit = agreements.submitHandler(evt, {
      customerId,
      loanIds: checkout.loanIds,
      checkoutDate: '2024-03-01',
      returnBy: '2025-01-15',
      agreementDate: '2024-03-01',
      waiverAgreed: true,
      signatureAgreed: true,
      signatureData: 'data:image/png;base64,test-signature',
    });
    expect(submit.ok).toBe(true);
    const loan = db.withDb((conn) => conn.prepare('SELECT checked_out_date, due_date FROM loans WHERE id = 1').get());
    expect(loan.checked_out_date).toBe('2024-03-01');
    expect(loan.due_date).toBe('2025-01-15');
  });

  test('submitHandler does not finalize loans that are not pending', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    checkoutAndAgree(customerId, ['AA-0001'], '2024-03-01', '2024-03-01');
    const submit = agreements.submitHandler(evt, {
      customerId,
      loanIds: [1],
      checkoutDate: '2024-03-01',
      agreementDate: '2024-03-02',
      waiverAgreed: true,
      signatureAgreed: true,
      signatureData: 'data:image/png;base64,second',
    });
    expect(submit.ok).toBe(true);
    expect(submit.updatedLoanIds).toEqual([]);
    const loan = db.withDb((conn) => conn.prepare('SELECT agreement_date, agreement_pending FROM loans WHERE id = 1').get());
    expect(loan.agreement_date).toBe('2024-03-01');
    expect(loan.agreement_pending).toBe(0);
    expect(
      db.withDb((conn) => conn.prepare('SELECT COUNT(*) AS c FROM checkout_log').get().c)
    ).toBe(1);
  });

  test('getLoanHandler returns loan and customer details', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    const checkout = loans.checkoutHandler(evt, { customerId, equipmentIds: ['AA-0001'], checkoutDate: '2024-03-01' });
    const result = agreements.getLoanHandler(evt, { loanId: checkout.loanIds[0] });
    expect(result.ok).toBe(true);
    expect(result.item.equipment_id).toBe('AA-0001');
    expect(result.item.item_name).toBe('Walker');
    expect(result.customer.name).toBe('Alice Smith');
    expect(result.checkoutDate).toBe('2024-03-01');
    expect(result.dueDate).toBe('2024-08-21');
    expect(result.checkoutPeriodDays).toBe(120);
    expect(agreements.getLoanHandler(evt, { loanId: 999 })).toEqual({ ok: false, error: 'Loan not found.' });
  });

  test('getCustomerHandler requires a signed active agreement', () => {
    seedEquipment('AA-0001', 'Walker');
    const customerId = seedCustomer('Alice Smith', '(406) 555-1234', '59901');
    expect(agreements.getCustomerHandler(evt, { customerId })).toEqual({
      ok: false,
      error: 'No signed active agreement found for this customer.',
    });
    checkoutAndAgree(customerId, ['AA-0001'], '2024-03-01', '2024-03-01');
    const result = agreements.getCustomerHandler(evt, { customerId });
    expect(result.ok).toBe(true);
    expect(result.customer.name).toBe('Alice Smith');
    expect(result.items).toHaveLength(1);
    expect(result.signatureData).toBe('data:image/png;base64,test-signature');
    expect(result.agreementDate).toBe('2024-03-01');
  });
});

describe('reports feature', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
    seedEquipment('AA-0001', 'Walker');
    seedEquipment('BB-0002', 'Wheelchair');
    seedUser('admin', 'hash', 1);
    const customerId = seedCustomer('Jane Doe', '(406) 555-0001', '59901');
    checkoutAndAgree(customerId, ['AA-0001', 'BB-0002'], '2024-03-01', '2024-03-01');
    loans.returnHandler(evt, { loanId: 1 });
    checkoutAndAgree(customerId, ['AA-0001'], '2024-04-02', '2024-04-02');
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('getYearsHandler returns distinct agreement years', () => {
    const result = reports.getYearsHandler(evt, {});
    expect(result.ok).toBe(true);
    expect(result.years).toEqual(['2024']);
  });

  test('getDataHandler analytics returns summary, daily, and monthly shapes', () => {
    const result = reports.getDataHandler(evt, { reportType: 'analytics', yearFilter: '2024' });
    expect(result.ok).toBe(true);
    expect(result.reportTitle).toBe('Analytics');
    expect(result.analyticsMonths).toEqual(['2024-04', '2024-03']);
    expect(result.analyticsSummary).toEqual({ total_checkouts: 3, unique_guests: 2, avg_per_day: 1 });
    expect(result.dailyGuests).toEqual([{ date: '2024-04-02', guest_count: 1, item_count: 1 }]);
    expect(result.monthlyStats).toEqual([
      { month_year: '2024-04', total_guests: 1, total_items: 1, avg_guests_per_day: 1, avg_items_per_day: 1 },
      { month_year: '2024-03', total_guests: 1, total_items: 2, avg_guests_per_day: 1, avg_items_per_day: 2 },
    ]);
  });

  test('getDataHandler analytics honors year and month filters', () => {
    const noData = reports.getDataHandler(evt, { reportType: 'analytics', yearFilter: '2020' });
    expect(noData.analyticsSummary).toBeNull();
    expect(noData.dailyGuests).toEqual([]);
    const month = reports.getDataHandler(evt, { reportType: 'analytics', yearFilter: '2024', monthFilter: '2024-03' });
    expect(month.monthFilter).toBe('2024-03');
    expect(month.dailyGuests).toEqual([{ date: '2024-03-01', guest_count: 1, item_count: 2 }]);
  });

  test('getDataHandler checkout report returns log rows with filters', () => {
    const all = reports.getDataHandler(evt, { reportType: 'checkout' });
    expect(all.ok).toBe(true);
    expect(all.reportTitle).toBe('Checkout Log');
    expect(all.reportData).toHaveLength(3);
    expect(all.reportData[0]).toMatchObject({
      equipment_id: 'AA-0001',
      checkout_date: '2024-04-02',
      is_first_item: 1,
      customer_zip_code: '59901',
      item_name: 'Walker',
    });
    const from = reports.getDataHandler(evt, { reportType: 'checkout', dateFrom: '2024-04-01' });
    expect(from.reportData).toHaveLength(1);
    const to = reports.getDataHandler(evt, { reportType: 'checkout', dateTo: '2024-03-31' });
    expect(to.reportData).toHaveLength(2);
    const byYear = reports.getDataHandler(evt, { reportType: 'checkout', yearFilter: '2024' });
    expect(byYear.reportData).toHaveLength(3);
  });

  test('getDataHandler item_sales report reads deleted_items_log', () => {
    loans.returnHandler(evt, { loanId: 2 });
    equipment.sellHandler(evt, { equipmentId: 'BB-0002', salePrice: '45.00' });
    const result = reports.getDataHandler(evt, { reportType: 'item_sales' });
    expect(result.ok).toBe(true);
    expect(result.reportTitle).toBe('Item Sales Log');
    expect(result.reportData).toEqual([
      { id: 1, equipment_id: 'BB-0002', item_name: 'Wheelchair', deletion_date: todayIso(), sale_price: '45.00' },
    ]);
  });

  test('deleteCheckoutHandler and deleteItemSaleHandler remove rows', () => {
    const all = reports.getDataHandler(evt, { reportType: 'checkout' });
    expect(reports.deleteCheckoutHandler(evt, { id: all.reportData[0].id }).ok).toBe(true);
    expect(reports.getDataHandler(evt, { reportType: 'checkout' }).reportData).toHaveLength(2);
    loans.returnHandler(evt, { loanId: 2 });
    equipment.sellHandler(evt, { equipmentId: 'BB-0002', salePrice: '45.00' });
    const sales = reports.getDataHandler(evt, { reportType: 'item_sales' });
    expect(reports.deleteItemSaleHandler(evt, { id: sales.reportData[0].id }).ok).toBe(true);
    expect(reports.getDataHandler(evt, { reportType: 'item_sales' }).reportData).toEqual([]);
  });
});
