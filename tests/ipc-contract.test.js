var mockIpcHandlers = {};

jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
    getPath: jest.fn(() => ''),
    getAppPath: jest.fn(() => ''),
  },
  ipcMain: {
    handle: jest.fn((channel, handler) => {
      mockIpcHandlers[channel] = handler;
    }),
  },
}));

const { CHANNELS, PAYLOADS, REQUIRED_AUTH, REQUIRED_ADMIN, MAX_PAYLOAD_BYTES, SIGNING_CHANNELS, SIGNER_CHANNELS } = require('../src/shared/ipc-contract');
const ipc = require('../src/main/ipc');
const db = require('../src/main/db');
const auth = require('../src/main/auth');
const { initTempDb, cleanupDir, fakeEvent } = require('./helpers');

describe('ipc-contract module invariants', () => {
  test('PAYLOADS defines an entry for every channel and no extras', () => {
    const channelValues = Object.values(CHANNELS).sort();
    const payloadKeys = Object.keys(PAYLOADS).sort();
    expect(payloadKeys).toEqual(channelValues);
  });

  test('REQUIRED_AUTH and REQUIRED_ADMIN are disjoint', () => {
    for (const channel of REQUIRED_AUTH) {
      expect(REQUIRED_ADMIN.has(channel)).toBe(false);
    }
  });

  test('the three public channels are exactly those in REQUIRED_AUTH', () => {
    expect(Array.from(REQUIRED_AUTH).sort()).toEqual(
      [CHANNELS.AUTH_REGISTER, CHANNELS.AUTH_LOGIN, CHANNELS.APP_GET_STATUS].sort()
    );
  });

  test('delete/import/export/shutdown channels are admin-gated', () => {
    const expectedAdmin = [
      CHANNELS.APP_SHUTDOWN,
      CHANNELS.CUSTOMERS_DELETE,
      CHANNELS.EQUIPMENT_DELETE,
      CHANNELS.EQUIPMENT_SELL,
      CHANNELS.REPORTS_DELETE_CHECKOUT,
      CHANNELS.REPORTS_DELETE_ITEM_SALE,
      CHANNELS.IMPORT_EXPORT_EXPORT_CUSTOMERS,
      CHANNELS.IMPORT_EXPORT_EXPORT_EQUIPMENT,
      CHANNELS.IMPORT_EXPORT_EXPORT_CHECKOUT_LOG,
      CHANNELS.IMPORT_EXPORT_EXPORT_MASTER,
      CHANNELS.IMPORT_EXPORT_IMPORT_CUSTOMERS,
      CHANNELS.IMPORT_EXPORT_IMPORT_EQUIPMENT,
      CHANNELS.SIGNING_SET_ENABLED,
    ];
    for (const channel of expectedAdmin) {
      expect(REQUIRED_ADMIN.has(channel)).toBe(true);
    }
    expect(REQUIRED_ADMIN.size).toBe(expectedAdmin.length);
  });

  test('auth:changePassword and auth:logout are not public', () => {
    expect(REQUIRED_AUTH.has(CHANNELS.AUTH_CHANGE_PASSWORD)).toBe(false);
    expect(REQUIRED_AUTH.has(CHANNELS.AUTH_LOGOUT)).toBe(false);
  });
});

describe('signing channel invariants', () => {
  test('every signing channel is declared in the contract', () => {
    expect(SIGNING_CHANNELS).toEqual(
      new Set([
        CHANNELS.SIGNING_START,
        CHANNELS.SIGNING_GET_STATUS,
        CHANNELS.SIGNING_SET_ENABLED,
        CHANNELS.SIGNING_SET_WITNESS,
        CHANNELS.SIGNING_GET_CONTEXT,
        CHANNELS.SIGNING_SUBMIT,
        CHANNELS.SIGNING_CANCEL,
        CHANNELS.SIGNING_ABANDON,
      ])
    );
  });

  test('signing channels are neither public nor admin-gated (except setEnabled)', () => {
    for (const channel of SIGNING_CHANNELS) {
      expect(REQUIRED_AUTH.has(channel)).toBe(false);
    }
    expect(REQUIRED_ADMIN.has(CHANNELS.SIGNING_SET_ENABLED)).toBe(true);
    for (const channel of SIGNING_CHANNELS) {
      if (channel === CHANNELS.SIGNING_SET_ENABLED) continue;
      expect(REQUIRED_ADMIN.has(channel)).toBe(false);
    }
  });

  test('the signer window only gets read-context and submit', () => {
    expect(Array.from(SIGNER_CHANNELS).sort()).toEqual(
      [CHANNELS.SIGNING_GET_CONTEXT, CHANNELS.SIGNING_SUBMIT].sort()
    );
    for (const channel of SIGNER_CHANNELS) {
      expect(SIGNING_CHANNELS.has(channel)).toBe(true);
    }
    expect(SIGNER_CHANNELS.has(CHANNELS.CUSTOMERS_LIST)).toBe(false);
    expect(SIGNER_CHANNELS.has(CHANNELS.AGREEMENTS_SUBMIT)).toBe(false);
    expect(SIGNER_CHANNELS.has(CHANNELS.APP_SHUTDOWN)).toBe(false);
  });

  test('signing payloads validate fail-closed', () => {
    expect(
      ipc.validatePayload(CHANNELS.SIGNING_START, {
        customerId: 1,
        loanIds: [1, 2],
        checkoutDate: '2024-01-01',
        dueDate: '2024-05-01',
      })
    ).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_START, { customerId: 1, loanIds: [1], checkoutDate: '2024-01-01' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_START, { customerId: 1, loanIds: [1] })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_START, { customerId: 1, loanIds: ['1'], checkoutDate: '2024-01-01' })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SET_ENABLED, { enabled: true })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SET_ENABLED, { enabled: 1 })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SET_ENABLED, {})).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SET_WITNESS, {})).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SET_WITNESS, { witnessName: null })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SET_WITNESS, { witnessName: 'x'.repeat(256) })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, { waiverAgreed: true })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, { waiverAgreed: true, signatureData: '' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, { waiverAgreed: 'yes' })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, {})).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_GET_CONTEXT, {})).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_GET_CONTEXT, { loanId: 3 })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_CANCEL, {})).toBe(true);
    expect(ipc.validatePayload(CHANNELS.SIGNING_ABANDON, {})).toBe(true);
  });

  test('the signer cannot smuggle customer or loan ids into submit', () => {
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, { waiverAgreed: true, customerId: 7 })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, { waiverAgreed: true, loanIds: [7] })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.SIGNING_SUBMIT, { waiverAgreed: true, witnessName: 'Mallory' })).toBe(false);
  });
});

describe('validatePayload', () => {
  test('unspecced channels fail closed', () => {
    expect(ipc.validatePayload('nonsense:channel', {})).toBe(false);
    expect(ipc.validatePayload('app:unknown', {})).toBe(false);
    expect(ipc.validatePayload(undefined, {})).toBe(false);
  });

  test('null or undefined payload is treated as an empty object', () => {
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, undefined)).toBe(true);
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, null)).toBe(true);
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, {})).toBe(true);
  });

  test('non-object payloads are rejected', () => {
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, 'string')).toBe(false);
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, 42)).toBe(false);
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, [])).toBe(false);
  });

  test('unknown keys are rejected', () => {
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, { extra: 1 })).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: ['AA-0001'], extra: true })
    ).toBe(false);
  });

  test('__proto__ and constructor keys are rejected', () => {
    const withProto = JSON.parse('{"__proto__": {"polluted": 1}}');
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, withProto)).toBe(false);
    const withConstructor = JSON.parse('{"constructor": 1}');
    expect(ipc.validatePayload(CHANNELS.APP_GET_STATUS, withConstructor)).toBe(false);
  });

  test('auth:login validates required string fields', () => {
    expect(ipc.validatePayload(CHANNELS.AUTH_LOGIN, { username: 'a', password: 'b' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.AUTH_LOGIN, { username: 'a' })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.AUTH_LOGIN, { username: 'a', password: 123 })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.AUTH_LOGIN, { username: null, password: 'b' })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.AUTH_LOGIN, { username: 'a', password: 'b', extra: 1 })).toBe(false);
  });

  test('string length caps are enforced', () => {
    expect(ipc.validatePayload(CHANNELS.CUSTOMERS_LIST, { search: 'x'.repeat(255) })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.CUSTOMERS_LIST, { search: 'x'.repeat(256) })).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.CUSTOMERS_ADD, { name: 'n', phone: 'p', zipCode: 'z'.repeat(17) })
    ).toBe(false);
  });

  test('optional fields accept absence and null', () => {
    expect(ipc.validatePayload(CHANNELS.CUSTOMERS_LIST, {})).toBe(true);
    expect(ipc.validatePayload(CHANNELS.CUSTOMERS_LIST, { search: null })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: ['a'] })).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: ['a'], checkoutDate: '2024-01-01' })
    ).toBe(true);
  });

  test('numbers must be integers', () => {
    expect(ipc.validatePayload(CHANNELS.LOANS_RETURN, { loanId: 1 })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.LOANS_RETURN, { loanId: 1.5 })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.LOANS_RETURN, { loanId: '1' })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.LOANS_RETURN, { loanId: NaN })).toBe(false);
  });

  test('arrays enforce caps and element types', () => {
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: [] })
    ).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: Array(50).fill('AA-0001') })
    ).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: Array(51).fill('AA-0001') })
    ).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: [123] })
    ).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CHECKOUT, { customerId: 1, equipmentIds: ['x'.repeat(51)] })
    ).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CANCEL_PENDING, { loanIds: [1, 2, 3] })
    ).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CANCEL_PENDING, { loanIds: [1.5] })
    ).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.LOANS_CANCEL_PENDING, { loanIds: ['1'] })
    ).toBe(false);
  });

  test('booleans must be actual booleans', () => {
    const base = {
      customerId: 1,
      loanIds: [1],
      checkoutDate: '2024-01-01',
      agreementDate: '2024-01-01',
      waiverAgreed: true,
      signatureData: 'data:image/png;base64,x',
    };
    expect(ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, base)).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, { ...base, returnBy: '2024-05-01' })
    ).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, { ...base, signatureData: '' })
    ).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, { ...base, witnessName: 'Staff Jane' })
    ).toBe(true);
    expect(
      ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, { ...base, witnessName: 'x'.repeat(300) })
    ).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, { ...base, waiverAgreed: 1 })
    ).toBe(false);
    expect(
      ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, { ...base, signatureData: 42 })
    ).toBe(false);
  });

  test('loans:inlineUpdate and equipment:sell validate their payloads', () => {
    expect(ipc.validatePayload(CHANNELS.LOANS_INLINE_UPDATE, { loanId: 1, field: 'due_date', value: '2024-05-01' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.LOANS_INLINE_UPDATE, { loanId: 1.5, field: 'due_date', value: '2024-05-01' })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.LOANS_INLINE_UPDATE, { loanId: 1, field: 'checked_out_date', value: '2024-01-01' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.EQUIPMENT_SELL, { equipmentId: 'AA-0001', salePrice: '25.00' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.EQUIPMENT_SELL, { equipmentId: 'AA-0001', salePrice: 25 })).toBe(false);
  });

  test('app:print validates the html payload and caps its size', () => {
    expect(ipc.validatePayload(CHANNELS.APP_PRINT, { html: '<h1>Report</h1>' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.APP_PRINT, { html: '' })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.APP_PRINT, {})).toBe(false);
    expect(ipc.validatePayload(CHANNELS.APP_PRINT, { html: 42 })).toBe(false);
    expect(ipc.validatePayload(CHANNELS.APP_PRINT, { html: 'x'.repeat(524288) })).toBe(true);
    expect(ipc.validatePayload(CHANNELS.APP_PRINT, { html: 'x'.repeat(524289) })).toBe(false);
  });

  test('payloads over MAX_PAYLOAD_BYTES are rejected', () => {
    const oversized = {
      customerId: 1,
      loanIds: [1],
      checkoutDate: '2024-01-01',
      agreementDate: '2024-01-01',
      waiverAgreed: true,
      signatureData: 'x'.repeat(MAX_PAYLOAD_BYTES + 1),
    };
    expect(JSON.stringify(oversized).length).toBeGreaterThan(MAX_PAYLOAD_BYTES);
    expect(ipc.validatePayload(CHANNELS.AGREEMENTS_SUBMIT, oversized)).toBe(false);
  });
});

describe('isTrustedSender', () => {
  test('fails closed before setTrustedWebContents is called', () => {
    ipc.setTrustedWebContents(null);
    expect(ipc.isTrustedSender(fakeEvent(1))).toBe(false);
  });

  test('matches the trusted webContents id and nothing else', () => {
    ipc.setTrustedWebContents({ id: 42 });
    expect(ipc.isTrustedSender(fakeEvent(42))).toBe(true);
    expect(ipc.isTrustedSender(fakeEvent(43))).toBe(false);
  });

  test('rejects null events, missing senders, and null senders', () => {
    ipc.setTrustedWebContents({ id: 42 });
    expect(ipc.isTrustedSender(null)).toBe(false);
    expect(ipc.isTrustedSender(undefined)).toBe(false);
    expect(ipc.isTrustedSender({})).toBe(false);
    expect(ipc.isTrustedSender({ sender: null })).toBe(false);
  });

  test('setTrustedWebContents(null) revokes trust', () => {
    ipc.setTrustedWebContents({ id: 42 });
    expect(ipc.isTrustedSender(fakeEvent(42))).toBe(true);
    ipc.setTrustedWebContents(null);
    expect(ipc.isTrustedSender(fakeEvent(42))).toBe(false);
  });
});

describe('sender roles', () => {
  test('the main window is trusted with the main role', () => {
    ipc.setTrustedWebContents({ id: 42 });
    expect(ipc.getSenderRole(fakeEvent(42))).toBe('main');
    expect(ipc.senderMayUseChannel(fakeEvent(42), CHANNELS.CUSTOMERS_DELETE)).toBe(true);
  });

  test('unknown senders have no role and no channels', () => {
    ipc.setTrustedWebContents({ id: 42 });
    expect(ipc.getSenderRole(fakeEvent(43))).toBeNull();
    expect(ipc.senderMayUseChannel(fakeEvent(43), CHANNELS.CUSTOMERS_LIST)).toBe(false);
    expect(ipc.getSenderRole(null)).toBeNull();
  });

  test('the signer window is trusted but limited to its allowlist', () => {
    ipc.setTrustedWebContents({ id: 42 });
    ipc.addSignerWebContents({ id: 99 });
    expect(ipc.isTrustedSender(fakeEvent(99))).toBe(true);
    expect(ipc.getSenderRole(fakeEvent(99))).toBe('signer');
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.SIGNING_GET_CONTEXT)).toBe(true);
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.SIGNING_SUBMIT)).toBe(true);
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.CUSTOMERS_LIST)).toBe(false);
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.AGREEMENTS_SUBMIT)).toBe(false);
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.APP_SHUTDOWN)).toBe(false);
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.SIGNING_CANCEL)).toBe(false);
    expect(ipc.senderMayUseChannel(fakeEvent(99), CHANNELS.SIGNING_START)).toBe(false);
  });

  test('setTrustedWebContents resets the map and drops signer trust', () => {
    ipc.setTrustedWebContents({ id: 42 });
    ipc.addSignerWebContents({ id: 99 });
    ipc.setTrustedWebContents({ id: 42 });
    expect(ipc.isTrustedSender(fakeEvent(99))).toBe(false);
  });

  test('removeTrustedWebContents revokes a single sender', () => {
    ipc.setTrustedWebContents({ id: 42 });
    ipc.addSignerWebContents({ id: 99 });
    ipc.removeTrustedWebContents({ id: 99 });
    expect(ipc.isTrustedSender(fakeEvent(99))).toBe(false);
    expect(ipc.isTrustedSender(fakeEvent(42))).toBe(true);
    ipc.removeTrustedWebContents({ id: 999 });
    ipc.removeTrustedWebContents(null);
  });
});

describe('IPC handler registration and gating pipeline', () => {
  let temp;

  beforeAll(() => {
    temp = initTempDb();
    ipc.registerIpcHandlers();
  });

  afterAll(() => {
    cleanupDir(temp.dir);
  });

  beforeEach(() => {
    auth.clearSession();
    ipc.setTrustedWebContents({ id: 1 });
  });

  test('every channel in the contract has a registered handler', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(typeof mockIpcHandlers[channel]).toBe('function');
    }
    expect(Object.keys(mockIpcHandlers).sort()).toEqual(Object.values(CHANNELS).sort());
  });

  test('untrusted senders are rejected before payload validation', () => {
    ipc.setTrustedWebContents(null);
    const result = mockIpcHandlers[CHANNELS.APP_GET_STATUS](fakeEvent(1), {});
    expect(result).toEqual({ ok: false, error: 'unauthorized sender' });
  });

  test('invalid payloads are rejected after sender validation', () => {
    const result = mockIpcHandlers[CHANNELS.APP_GET_STATUS](fakeEvent(1), { nope: 1 });
    expect(result).toEqual({ ok: false, error: 'invalid payload' });
  });

  test('auth-required channels reject unauthenticated callers', () => {
    const result = mockIpcHandlers[CHANNELS.CUSTOMERS_LIST](fakeEvent(1), {});
    expect(result).toEqual({ ok: false, error: 'not authenticated' });
  });

  test('public channels work without a session', () => {
    const result = mockIpcHandlers[CHANNELS.APP_GET_STATUS](fakeEvent(1), {});
    expect(result.ok).toBe(true);
    expect(result.isFirstRun).toBe(true);
    expect(result.user).toBeNull();
  });

  test('admin-gated channels reject non-admin sessions', () => {
    auth.setSession({ id: 1, username: 'staff', isAdmin: 0 });
    const result = mockIpcHandlers[CHANNELS.CUSTOMERS_DELETE](fakeEvent(1), { id: 1 });
    expect(result).toEqual({ ok: false, error: 'admin required' });
  });

  test('a full login flow works through the pipeline', () => {
    const register = mockIpcHandlers[CHANNELS.AUTH_REGISTER](fakeEvent(1), {
      username: 'pipelineuser',
      password: 'password1',
    });
    expect(register.ok).toBe(true);
    const login = mockIpcHandlers[CHANNELS.AUTH_LOGIN](fakeEvent(1), {
      username: 'pipelineuser',
      password: 'password1',
    });
    expect(login.ok).toBe(true);
    expect(auth.getSession().username).toBe('pipelineuser');
    const list = mockIpcHandlers[CHANNELS.CUSTOMERS_LIST](fakeEvent(1), {});
    expect(list.ok).toBe(true);
    auth.clearSession();
  });

  test('authenticated non-admin users can list equipment', () => {
    auth.setSession({ id: 2, username: 'staff', isAdmin: 0 });
    const result = mockIpcHandlers[CHANNELS.EQUIPMENT_LIST](fakeEvent(1), {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.items)).toBe(true);
  });

  test('the signing window cannot reach non-signing channels', () => {
    auth.setSession({ id: 1, username: 'staff', isAdmin: 1 });
    ipc.addSignerWebContents({ id: 7 });

    const customers = mockIpcHandlers[CHANNELS.CUSTOMERS_LIST](fakeEvent(7), {});
    expect(customers).toEqual({ ok: false, error: 'unauthorized channel' });

    const shutdown = mockIpcHandlers[CHANNELS.APP_SHUTDOWN](fakeEvent(7), {});
    expect(shutdown).toEqual({ ok: false, error: 'unauthorized channel' });

    const agreementsSubmit = mockIpcHandlers[CHANNELS.AGREEMENTS_SUBMIT](fakeEvent(7), {
      customerId: 1,
      loanIds: [1],
      checkoutDate: '2024-01-01',
      agreementDate: '2024-01-01',
      waiverAgreed: true,
    });
    expect(agreementsSubmit).toEqual({ ok: false, error: 'unauthorized channel' });

    const forgedSubmit = mockIpcHandlers[CHANNELS.SIGNING_SUBMIT](fakeEvent(7), {
      waiverAgreed: true,
      customerId: 1,
    });
    expect(forgedSubmit).toEqual({ ok: false, error: 'invalid payload' });
  });

  test('the main window keeps full channel access while a signer is open', () => {
    auth.setSession({ id: 1, username: 'staff', isAdmin: 1 });
    ipc.addSignerWebContents({ id: 7 });
    const result = mockIpcHandlers[CHANNELS.CUSTOMERS_LIST](fakeEvent(1), {});
    expect(result.ok).toBe(true);
    auth.clearSession();
  });
});
