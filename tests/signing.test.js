jest.mock('electron', () => {
  const state = { displays: [], primaryId: 1, removedListeners: [], windows: [], nextId: 100 };

  class FakeWebContents {
    constructor(id) {
      this.id = id;
      this.listeners = {};
      this.sent = [];
    }

    setWindowOpenHandler() {}

    on(event, handler) {
      this.listeners[event] = handler;
    }

    send(channel, payload) {
      this.sent.push({ channel, payload });
    }

    getURL() {
      return '';
    }
  }

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.id = state.nextId++;
      this.webContents = new FakeWebContents(this.id);
      this.destroyed = false;
      this.shown = false;
      this.firedClosed = false;
      this.windowListeners = {};
      this.loadFileResult = Promise.resolve();
      state.windows.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }

    show() {
      this.shown = true;
    }

    close() {
      this.fireClosed();
    }

    destroy() {
      this.fireClosed();
    }

    fireClosed() {
      if (this.firedClosed) return;
      this.firedClosed = true;
      this.destroyed = true;
      const handler = this.windowListeners.closed;
      if (handler) handler();
    }

    on(event, handler) {
      if (event === 'closed') this.windowListeners.closed = handler;
    }

    loadFile() {
      return this.loadFileResult;
    }
  }

  return {
    state,
    FakeBrowserWindow,
    app: {
      isPackaged: false,
      quit: jest.fn(),
      getPath: jest.fn(() => ''),
      getAppPath: jest.fn(() => ''),
    },
    ipcMain: { handle: jest.fn() },
    BrowserWindow: FakeBrowserWindow,
    screen: {
      getAllDisplays: () => state.displays,
      getPrimaryDisplay: () => ({ id: state.primaryId }),
      on: (event, handler) => {
        if (event === 'display-removed') state.removedListeners.push(handler);
      },
    },
  };
});

const signing = require('../src/main/signing');
const db = require('../src/main/db');
const { initTempDb, cleanupDir } = require('./helpers');

function makeDisplays(count) {
  const list = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 }];
  for (let i = 2; i <= count; i += 1) {
    list.push({
      id: i,
      bounds: { x: 1920, y: 0, width: 1280, height: 800 },
      size: { width: 1280, height: 800 },
      scaleFactor: 1,
    });
  }
  return list;
}

function seedCheckout(dbPath) {
  db.withDb((conn) => {
    conn.prepare('INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)').run('Jane Veteran', '(406) 555-1234', '59901');
    conn.prepare('INSERT INTO equipment (equipment_id, item_name) VALUES (?, ?)').run('AA-0001', 'Wheelchair');
    conn
      .prepare(
        'INSERT INTO loans (customer_id, equipment_id, item_name, customer_name, customer_phone, checked_out_date, due_date, agreement_pending) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
      )
      .run(1, 'AA-0001', 'Wheelchair', 'Jane Veteran', '(406) 555-1234', '2024-01-01', '2024-05-01');
  }, dbPath);
}

function startPayload(overrides) {
  return Object.assign(
    {
      customerId: 1,
      loanIds: [1],
      checkoutDate: '2024-01-01',
      dueDate: '2024-05-01',
    },
    overrides || {}
  );
}

describe('signing module', () => {
  let temp;
  let mainEvents;
  let trust;
  let state;
  let windows;

  beforeEach(() => {
    const electron = require('electron');
    state = electron.state;
    windows = state.windows;
    temp = initTempDb();
    db.initDb(temp.dbPath);
    seedCheckout(temp.dbPath);
    windows.length = 0;
    state.nextId = 100;
    mainEvents = [];
    state.displays = makeDisplays(1);
    state.removedListeners = [];
    state.primaryId = 1;
    trust = { addSignerWebContents: jest.fn(), removeTrustedWebContents: jest.fn() };
    signing.resetSigningState();
    signing.initSigning(trust, () => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => mainEvents.push({ channel, payload }) },
    }));
  });

  afterEach(() => {
    signing.resetSigningState();
    cleanupDir(temp.dir);
  });

  describe('startHandler fallback', () => {
    test('does not start when only one display is connected', () => {
      const res = signing.startHandler(null, startPayload());
      expect(res).toEqual({ ok: true, started: false, reason: 'no-display' });
      expect(windows).toHaveLength(0);
    });

    test('does not start when the feature is disabled', () => {
      state.displays = makeDisplays(2);
      db.setSetting(signing.SETTING_KEY, '0');
      const res = signing.startHandler(null, startPayload());
      expect(res).toEqual({ ok: true, started: false, reason: 'disabled' });
      expect(windows).toHaveLength(0);
    });

    test('is enabled by default and falls back only when a display is missing', () => {
      expect(signing.isEnabled()).toBe(true);
      expect(signing.startHandler(null, startPayload()).reason).toBe('no-display');
    });

    test('rejects a payload with no usable loan ids', () => {
      state.displays = makeDisplays(2);
      expect(signing.startHandler(null, startPayload({ loanIds: [] }))).toEqual({
        ok: false,
        error: 'No pending loans to sign.',
      });
      expect(windows).toHaveLength(0);
    });

    test('rejects loan ids that belong to another customer', () => {
      state.displays = makeDisplays(2);
      db.withDb((conn) => {
        conn.prepare('INSERT INTO customers (name, phone, zip_code) VALUES (?, ?, ?)').run('Other', '(406) 555-9999', '59902');
      });
      const res = signing.startHandler(null, startPayload({ customerId: 2 }));
      expect(res).toEqual({ ok: false, error: 'Those items are no longer available for signing.' });
      expect(windows).toHaveLength(0);
    });

    test('rejects loan ids that are not pending', () => {
      state.displays = makeDisplays(2);
      db.withDb((conn) => conn.prepare('UPDATE loans SET agreement_pending = 0 WHERE id = 1').run());
      expect(signing.startHandler(null, startPayload())).toEqual({
        ok: false,
        error: 'Those items are no longer available for signing.',
      });
      expect(windows).toHaveLength(0);
    });

    test('falls back to inline when the display vanishes between detection and open', () => {
      state.displays = makeDisplays(2);
      const realGetAll = state.displays.slice();
      let call = 0;
      const screen = require('electron').screen;
      const original = screen.getAllDisplays;
      screen.getAllDisplays = () => {
        call += 1;
        return call === 1 ? realGetAll : [realGetAll[0]];
      };
      try {
        expect(signing.startHandler(null, startPayload())).toEqual({
          ok: true,
          started: false,
          reason: 'no-display',
        });
        expect(windows).toHaveLength(0);
      } finally {
        screen.getAllDisplays = original;
      }
    });
  });

  describe('startHandler with a second display', () => {
    beforeEach(() => {
      state.displays = makeDisplays(2);
    });

    test('opens a frameless fullscreen window on the non-primary display', async () => {
      const res = await signing.startHandler(null, startPayload());
      expect(res.ok).toBe(true);
      expect(res.started).toBe(true);
      expect(windows).toHaveLength(1);

      const win = windows[0];
      expect(win.options.frame).toBe(false);
      expect(win.options.fullscreen).toBe(true);
      expect(win.options.x).toBe(1920);
      expect(win.options.y).toBe(0);
      expect(win.options.width).toBe(1280);
      expect(win.options.height).toBe(800);
      expect(win.shown).toBe(true);

      const prefs = win.options.webPreferences;
      expect(prefs.contextIsolation).toBe(true);
      expect(prefs.nodeIntegration).toBe(false);
      expect(prefs.sandbox).toBe(true);
      expect(prefs.devTools).toBe(false);
      expect(trust.addSignerWebContents).toHaveBeenCalledWith(win.webContents);
    });

    test('refuses a second concurrent session', async () => {
      await signing.startHandler(null, startPayload());
      const second = await signing.startHandler(null, startPayload());
      expect(second).toEqual({ ok: false, error: 'A signing session is already in progress.' });
      expect(windows).toHaveLength(1);
    });

    test('getContext exposes the customer, equipment and return date', async () => {
      await signing.startHandler(null, startPayload());
      const ctx = signing.getContextHandler();
      expect(ctx.ok).toBe(true);
      expect(ctx.customer.name).toBe('Jane Veteran');
      expect(ctx.customer.zip_code).toBe('59901');
      expect(ctx.items).toEqual([{ equipment_id: 'AA-0001', item_name: 'Wheelchair', due_date: '2024-05-01' }]);
      expect(ctx.returnBy).toBe('2024-05-01');
      expect(ctx.checkoutPeriodDays).toBe(120);
    });

    test('getContext fails closed with no active session', () => {
      expect(signing.getContextHandler()).toEqual({ ok: false, error: 'No signing session is in progress.' });
    });
  });

  describe('submitHandler', () => {
    beforeEach(async () => {
      state.displays = makeDisplays(2);
      await signing.startHandler(null, startPayload());
    });

    test('records the agreement for the session loans and closes the window', () => {
      const res = signing.submitHandler(null, { waiverAgreed: true, signatureData: 'data:image/png;base64,x' });
      expect(res.ok).toBe(true);
      expect(windows[0].isDestroyed()).toBe(true);
      expect(mainEvents).toHaveLength(1);
      expect(mainEvents[0].payload.type).toBe('completed');

      const loan = db.withDb((conn) =>
        conn.prepare('SELECT agreement_pending, agreement_date, agreement_data, customer_name FROM loans WHERE id = 1').get()
      );
      expect(loan.agreement_pending).toBe(0);
      expect(loan.agreement_date).toBeTruthy();
      expect(loan.agreement_data).toBe('data:image/png;base64,x');

      const agreement = db.withDb((conn) => conn.prepare('SELECT * FROM customer_agreements').get());
      expect(agreement.customer_id).toBe(1);
      expect(agreement.waiver_agreed).toBe(1);
      expect(agreement.digital_signature_agreed).toBe(1);
      expect(agreement.witness_name).toBeNull();
    });

    test('requires the waiver to be agreed', () => {
      const res = signing.submitHandler(null, { waiverAgreed: false, signatureData: '' });
      expect(res).toEqual({ ok: false, error: 'You must agree to the General Terms of Use and Loan Agreement.' });
      expect(windows[0].isDestroyed()).toBe(false);
      const loan = db.withDb((conn) => conn.prepare('SELECT agreement_pending FROM loans WHERE id = 1').get());
      expect(loan.agreement_pending).toBe(1);
    });

    test('the staff-entered witness name is stored with the agreement', () => {
      expect(signing.setWitnessHandler(null, { witnessName: '  Staff Jane  ' })).toEqual({ ok: true });
      signing.submitHandler(null, { waiverAgreed: true, signatureData: '' });
      const agreement = db.withDb((conn) => conn.prepare('SELECT witness_name FROM customer_agreements').get());
      expect(agreement.witness_name).toBe('Staff Jane');
    });

    test('ignores signer-supplied customer and loan ids', () => {
      signing.submitHandler(null, { waiverAgreed: true, signatureData: '', customerId: 999, loanIds: [42] });
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM loans').all());
      expect(rows).toHaveLength(1);
      const agreement = db.withDb((conn) => conn.prepare('SELECT customer_id, loan_id FROM customer_agreements').get());
      expect(agreement.customer_id).toBe(1);
      expect(agreement.loan_id).toBe(1);
    });

    test('fails closed when no session is active', () => {
      signing.resetSigningState();
      expect(signing.submitHandler(null, { waiverAgreed: true })).toEqual({
        ok: false,
        error: 'No signing session is in progress.',
      });
    });

    test('refuses to submit once the loans are no longer pending', () => {
      db.withDb((conn) => conn.prepare('UPDATE loans SET agreement_pending = 0 WHERE id = 1').run());
      const res = signing.submitHandler(null, { waiverAgreed: true, signatureData: '' });
      expect(res).toEqual({
        ok: false,
        error: 'This agreement is no longer current. Please ask staff for assistance.',
      });
      expect(windows[0].isDestroyed()).toBe(false);
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM customer_agreements').all());
      expect(rows).toHaveLength(0);
    });
  });

  describe('interruption', () => {
    beforeEach(async () => {
      state.displays = makeDisplays(2);
      await signing.startHandler(null, startPayload());
    });

    test('closing the signing window cancels the pending checkout', () => {
      windows[0].close();
      expect(mainEvents.map((e) => e.payload.type)).toEqual(['interrupted']);
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM loans').all());
      expect(rows).toHaveLength(0);
    });

    test('unplugging the signing display cancels the pending checkout', () => {
      state.removedListeners.forEach((handler) => handler({}, 2));
      expect(windows[0].isDestroyed()).toBe(true);
      expect(mainEvents.map((e) => e.payload.type)).toEqual(['interrupted']);
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM loans').all());
      expect(rows).toHaveLength(0);
    });

    test('unplugging a different display leaves the session alone', () => {
      state.removedListeners.forEach((handler) => handler({}, 3));
      expect(windows[0].isDestroyed()).toBe(false);
      expect(mainEvents).toHaveLength(0);
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM loans').all());
      expect(rows).toHaveLength(1);
    });

    test('a renderer crash cancels the checkout instead of wedging the feature', () => {
      windows[0].webContents.listeners['render-process-gone']({}, { reason: 'crashed' });
      expect(mainEvents.map((e) => e.payload.type)).toEqual(['interrupted']);
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM loans').all());
      expect(rows).toHaveLength(0);
      expect(trust.removeTrustedWebContents).toHaveBeenCalled();
    });

    test('closing the window revokes the signer trust entry', () => {
      windows[0].close();
      expect(trust.removeTrustedWebContents).toHaveBeenCalledWith(windows[0].webContents);
    });

    test('a new session can start after an interrupted one', async () => {
      windows[0].close();
      db.withDb((conn) => {
        conn
          .prepare(
            'INSERT INTO loans (customer_id, equipment_id, item_name, customer_name, customer_phone, checked_out_date, due_date, agreement_pending) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
          )
          .run(1, 'AA-0001', 'Wheelchair', 'Jane Veteran', '(406) 555-1234', '2024-01-01', '2024-05-01');
      });
      const res = await signing.startHandler(null, startPayload({ loanIds: [2] }));
      expect(res.ok).toBe(true);
      expect(res.started).toBe(true);
    });
  });

  describe('cancel and handoff', () => {
    beforeEach(async () => {
      state.displays = makeDisplays(2);
      await signing.startHandler(null, startPayload());
    });

    test('cancel removes the pending loans and closes the window', () => {
      const res = signing.cancelHandler();
      expect(res.ok).toBe(true);
      expect(windows[0].isDestroyed()).toBe(true);
      expect(mainEvents.map((e) => e.payload.type)).toEqual(['cancelled']);
      const rows = db.withDb((conn) => conn.prepare('SELECT id FROM loans').all());
      expect(rows).toHaveLength(0);
    });

    test('handoff keeps the pending loans and emits nothing', () => {
      const res = signing.abandonHandler();
      expect(res).toEqual({
        ok: true,
        active: true,
        customerId: 1,
        loanIds: [1],
        checkoutDate: '2024-01-01',
        dueDate: '2024-05-01',
      });
      expect(windows[0].isDestroyed()).toBe(true);
      expect(mainEvents).toHaveLength(0);
      const rows = db.withDb((conn) => conn.prepare('SELECT id, agreement_pending FROM loans').all());
      expect(rows).toHaveLength(1);
      expect(rows[0].agreement_pending).toBe(1);
    });
  });

  describe('status and settings', () => {
    test('reports no display on a single-screen machine', () => {
      const status = signing.getStatusHandler();
      expect(status.ok).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.secondaryDisplayName).toBeNull();
      expect(status.active).toBe(false);
    });

    test('names the detected second display', () => {
      state.displays = makeDisplays(2);
      expect(signing.getStatusHandler().secondaryDisplayName).toBe('Second Display (1280 x 800)');
    });

    test('setEnabled persists the preference and ends any active session', async () => {
      state.displays = makeDisplays(2);
      await signing.startHandler(null, startPayload());
      expect(signing.setEnabledHandler(null, { enabled: false })).toEqual({ ok: true, enabled: false });
      expect(signing.isEnabled()).toBe(false);
      expect(windows[0].isDestroyed()).toBe(true);
      signing.resetSigningState();
      expect(signing.isEnabled()).toBe(false);
    });
  });
});