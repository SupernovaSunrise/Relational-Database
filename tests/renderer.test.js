const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM, VirtualConsole } = require('jsdom');

const RENDERER_DIR = path.join(__dirname, '..', 'src', 'renderer');
const INDEX_URL = pathToFileURL(path.join(RENDERER_DIR, 'index.html')).href;
const SIGN_URL = pathToFileURL(path.join(RENDERER_DIR, 'sign.html')).href;

function htmlWithInlineScripts(file) {
  const html = fs.readFileSync(path.join(RENDERER_DIR, file), 'utf8');
  return html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
    const code = fs.readFileSync(path.join(RENDERER_DIR, src), 'utf8');
    return '<script>\n' + code + '\n</script>';
  });
}

function indexHtmlWithInlineScripts() {
  return htmlWithInlineScripts('index.html');
}

jest.setTimeout(30000);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs = 10000, step = 25) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await wait(step);
  }
  return fn();
}

function makeDmeStub(calls) {
  const ok = (payload) => () => Promise.resolve(Object.assign({ ok: true }, payload || {}));
  return {
    appGetStatus: ok({ isFirstRun: false, user: { username: 'tester', isAdmin: 1 } }),
    appShutdown: ok(),
    appPrint: ok(),
    appConfirm: (message) => {
      calls.confirms.push(message);
      return Promise.resolve({ ok: true, confirmed: true });
    },
    authRegister: ok(),
    authLogin: ok(),
    authLogout: ok(),
    authChangePassword: ok(),
    customersList: ok({ items: [] }),
    customersSearch: ok({ items: [] }),
    customersAdd: ok(),
    customersDelete: ok(),
    customersInlineUpdate: ok(),
    equipmentList: ok({ items: [] }),
    equipmentAdd: ok(),
    equipmentDelete: ok(),
    equipmentSell: ok(),
    equipmentInlineUpdate: ok(),
    loansGetMasterData: ok({
      rows: [{
        equipment_id: 'AA-0001',
        item_name: 'Wheelchair',
        customer_id: null,
        customer_name: null,
        customer_phone: null,
        loan_id: null,
        checked_out_date: null,
        due_date: null,
      }],
      todayStr: '2026-09-21',
    }),
    loansCheckout: ok(),
    loansReturn: ok(),
    loansExtend: ok(),
    loansCancelPending: ok(),
    loansInlineUpdate: ok(),
    agreementsGetLoan: ok(),
    agreementsGetCustomer: ok(),
    agreementsSubmit: ok(),
    signingStart: (payload) => {
      calls.signingStarts.push(payload);
      return Promise.resolve({ ok: true, started: false, reason: 'no-display' });
    },
    signingGetStatus: ok({ enabled: true, secondaryDisplayName: null, active: false, loanIds: [] }),
    signingSetEnabled: (enabled) => {
      calls.signingEnabled.push(enabled);
      return Promise.resolve({ ok: true, enabled: enabled });
    },
    signingSetWitness: (witnessName) => {
      calls.signingWitness.push(witnessName);
      return Promise.resolve({ ok: true });
    },
    signingGetContext: ok({
      customer: { name: 'Jane Veteran', phone: '(555) 123-4567', zip_code: '59901' },
      items: [{ equipment_id: 'AA-0001', item_name: 'Wheelchair', due_date: '2026-01-01' }],
      checkoutDate: '2026-01-01',
      returnBy: '2026-01-01',
      checkoutPeriodDays: 120,
    }),
    signingSubmit: ok(),
    signingCancel: ok(),
    signingAbandon: ok({ active: false }),
    onSigningEvent: (listener) => {
      calls.signingListeners.push(listener);
      return function () {
        const index = calls.signingListeners.indexOf(listener);
        if (index !== -1) calls.signingListeners.splice(index, 1);
      };
    },
    reportsGetYears: ok({ years: ['2026', '2025', '2024'] }),
    reportsGetData: (payload) => {
      const isCheckout = payload && payload.reportType === 'checkout';
      return Promise.resolve({
        ok: true,
        reportTitle: 'Test Report',
        analyticsSummary: null,
        analyticsMonths: ['January'],
        dailyGuests: [],
        monthlyStats: [],
        reportData: isCheckout
          ? [{
              id: 7,
              checkout_date: '2026-09-01',
              equipment_id: 'AA-0001',
              item_name: 'Wheelchair',
              customer_zip_code: '59901',
            }]
          : [],
      });
    },
    reportsDeleteCheckout: (id) => {
      calls.checkoutDeletes.push(id);
      return Promise.resolve({ ok: true });
    },
    reportsDeleteItemSale: ok(),
    importExportExportCustomers: ok(),
    importExportExportEquipment: ok(),
    importExportExportCheckoutLog: ok(),
    importExportExportMaster: ok(),
    importExportImportCustomers: ok(),
    importExportImportEquipment: ok(),
  };
}

function bootRenderer(overrides) {
  return bootHtml(INDEX_URL, indexHtmlWithInlineScripts(), overrides);
}

function bootHtml(url, html, overrides) {
  const pageErrors = [];
  const calls = {
    confirms: [],
    nativeConfirms: 0,
    checkoutDeletes: [],
    itemSaleDeletes: [],
    signingStarts: [],
    signingEnabled: [],
    signingWitness: [],
    signingSubmits: [],
    signingListeners: [],
  };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    pageErrors.push(err);
  });

  const dom = new JSDOM(html, {
    url: url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      const base = makeDmeStub(calls);
      base.signingSubmit = (waiverAgreed, signatureData) => {
        calls.signingSubmits.push({ waiverAgreed, signatureData });
        return Promise.resolve({ ok: true });
      };
      window.dme = Object.assign(base, overrides || {});
      window.confirm = () => {
        calls.nativeConfirms += 1;
        return true;
      };
      window.scrollTo = () => {};
      if (window.HTMLElement) {
        window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
      }
      window.addEventListener('error', (event) => {
        const detail = event && (event.error || event.message);
        if (detail) pageErrors.push(detail);
      });
    },
  });

  return { dom, pageErrors, calls };
}

function errorsOf(pageErrors, pattern) {
  return pageErrors.filter((err) => pattern.test(String((err && err.message) || err)));
}

describe('renderer smoke and navigation', () => {
  let dom;
  let pageErrors;
  let calls;

  beforeEach(async () => {
    ({ dom, pageErrors, calls } = bootRenderer());
    const booted = await waitFor(() => {
      const search = dom.window.document.getElementById('master-search');
      return search !== null && !dom.window.document.getElementById('app-nav').hidden;
    });
    expect(booted).toBe(true);
  });

  afterEach(() => {
    if (dom && dom.window) dom.window.close();
  });

  it('boots to the Home view and renders the checkout form', () => {
    const doc = dom.window.document;
    expect(doc.getElementById('checkout-customer')).not.toBeNull();
    expect(doc.getElementById('checkout-date')).not.toBeNull();
    expect(doc.getElementById('master-add-customer')).not.toBeNull();
    expect(doc.getElementById('master-add-equipment')).not.toBeNull();
  });

  it('renders controls on every view after navigation', async () => {
    const cases = [
      ['#/customers', 'customer-search'],
      ['#/equipment', 'equipment-search'],
      ['#/reports', 'report-year'],
      ['#/settings', 'current-password'],
      ['#/master', 'checkout-customer'],
    ];
    for (const [hash, id] of cases) {
      dom.window.location.hash = hash;
      const found = await waitFor(() => dom.window.document.getElementById(id) !== null);
      expect({ hash, rendered: found, id }).toEqual({ hash, rendered: true, id });
    }
  });

  it('leaving Home between a search keystroke and the animation frame does not throw', async () => {
    dom.window.location.hash = '#/master';
    const ready = await waitFor(() => dom.window.document.getElementById('master-search') !== null);
    expect(ready).toBe(true);
    const before = pageErrors.length;

    const searchInput = dom.window.document.getElementById('master-search');
    searchInput.value = 'AA';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    dom.window.location.hash = '#/reports';
    const reportsReady = await waitFor(() => dom.window.document.getElementById('report-year') !== null);
    expect(reportsReady).toBe(true);

    await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
    await wait(40);

    const newErrors = pageErrors.slice(before);
    expect(errorsOf(newErrors, /Cannot read properties of null|querySelectorAll/)).toEqual([]);
  });

  it('re-entering Home after another view does not throw (wrapper teardown is clean)', async () => {
    dom.window.location.hash = '#/reports';
    await waitFor(() => dom.window.document.getElementById('report-year') !== null);
    const before = pageErrors.length;

    dom.window.location.hash = '#/master';
    const ready = await waitFor(() => dom.window.document.getElementById('master-search') !== null);
    expect(ready).toBe(true);
    await wait(50);

    const newErrors = pageErrors.slice(before);
    expect(errorsOf(newErrors, /Cannot read properties of null|querySelectorAll|render/)).toEqual([]);
  });

  it('confirming a delete goes through app:confirm (never window.confirm) and leaves fields interactive', async () => {
    dom.window.location.hash = '#/reports';
    await waitFor(() => dom.window.document.getElementById('report-year') !== null);

    const checkoutTab = dom.window.document.querySelector('#report-tabs .tab-btn[data-tab="checkout"]');
    checkoutTab.click();
    const rowReady = await waitFor(() => dom.window.document.querySelector('button[data-action="delete-checkout"]') !== null);
    expect(rowReady).toBe(true);

    const yearSelect = dom.window.document.getElementById('report-year');
    yearSelect.focus();
    expect(dom.window.document.activeElement).toBe(yearSelect);

    const deleteBtn = dom.window.document.querySelector('button[data-action="delete-checkout"]');
    deleteBtn.click();

    await waitFor(() => calls.checkoutDeletes.length === 1);
    expect(calls.confirms).toEqual(['Delete this checkout log entry?']);
    expect(calls.nativeConfirms).toBe(0);
    expect(calls.checkoutDeletes).toEqual([7]);
    expect(errorsOf(pageErrors, /Cannot read properties of null|querySelectorAll/)).toEqual([]);

    const refreshedSelect = dom.window.document.getElementById('report-year');
    refreshedSelect.focus();
    expect(dom.window.document.activeElement).toBe(refreshedSelect);
  });
});

describe('second display signing window', () => {
  let dom;
  let pageErrors;
  let calls;

  beforeEach(async () => {
    ({ dom, pageErrors, calls } = bootHtml(SIGN_URL, htmlWithInlineScripts('sign.html')));
    const rendered = await waitFor(() => dom.window.document.getElementById('sign-form') !== null);
    expect(rendered).toBe(true);
  });

  afterEach(() => {
    if (dom && dom.window) dom.window.close();
  });

  it('renders the agreement for the signing session', () => {
    const doc = dom.window.document;
    expect(doc.body.className).toBe('sign-body');
    expect(doc.querySelector('nav')).toBeNull();
    expect(doc.getElementById('waiver_agreed')).not.toBeNull();
    expect(doc.getElementById('sigCanvas')).not.toBeNull();
    expect(doc.getElementById('sign-submit-btn')).not.toBeNull();
    expect(doc.body.textContent).toContain('Jane Veteran');
    expect(doc.body.textContent).toContain('AA-0001');
    expect(doc.body.textContent).toContain('Wheelchair');
    expect(doc.body.textContent).toContain('2026-01-01');
    expect(errorsOf(pageErrors, /Cannot read|is not a function|is not defined/)).toEqual([]);
  });

  it('offers no cancel, witness or date controls to the customer', () => {
    const doc = dom.window.document;
    expect(doc.querySelector('[data-action="signing-cancel"]')).toBeNull();
    expect(doc.getElementById('signing-witness')).toBeNull();
    expect(doc.getElementById('checkout_date')).toBeNull();
    expect(doc.getElementById('return_by')).toBeNull();
  });

  it('refuses to submit until the terms are agreed', async () => {
    const doc = dom.window.document;
    doc.getElementById('sign-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(30);
    expect(calls.signingSubmits).toEqual([]);
    expect(doc.getElementById('sign-flash').textContent).toContain('Please check the box');

    const checkbox = doc.getElementById('waiver_agreed');
    checkbox.checked = true;
    doc.getElementById('sign-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(30);
    expect(calls.signingSubmits).toEqual([{ waiverAgreed: true, signatureData: '' }]);
  });

  it('shows a fatal message when there is no active signing session', async () => {
    dom.window.close();
    const boot = bootHtml(SIGN_URL, htmlWithInlineScripts('sign.html'), {
      signingGetContext: () => Promise.resolve({ ok: false, error: 'No signing session is in progress.' }),
    });
    const rendered = await waitFor(() =>
      boot.dom.window.document.body.textContent.includes('Unable to Load Agreement')
    );
    expect(rendered).toBe(true);
    expect(boot.dom.window.document.body.textContent).toContain('No signing session is in progress.');
    boot.dom.window.close();
  });
});

describe('checkout handoff to the second display', () => {
  let dom;
  let pageErrors;
  let calls;

  const CHECKOUT_RESULT = {
    ok: true,
    customerId: 1,
    loanIds: [1],
    loanIdsCsv: '1',
    checkoutDate: '2026-09-21',
    dueDate: '2026-12-31',
  };

  function bootWithSigningStart(signResult, extraOverrides) {
    const overrides = Object.assign(
      {
        customersSearch: () =>
          Promise.resolve({ ok: true, items: [{ id: 1, name: 'Jane Veteran', phone: '(406) 555-1234', zip_code: '59901' }] }),
        loansCheckout: () => Promise.resolve(Object.assign({}, CHECKOUT_RESULT)),
        signingStart: (payload) => {
          boot.calls.signingStarts.push(payload);
          return Promise.resolve(signResult);
        },
      },
      extraOverrides || {}
    );
    const boot = bootHtml(INDEX_URL, indexHtmlWithInlineScripts(), overrides);
    return boot;
  }

  async function checkout(boot) {
    await waitFor(() => boot.dom.window.document.getElementById('checkout-btn') !== null);
    const doc = boot.dom.window.document;
    const checkbox = doc.querySelector('input[data-action="checkout-pick"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new boot.dom.window.Event('change', { bubbles: true }));
    doc.querySelector('#checkout-customer').value = 'Jane';
    doc.getElementById('checkout-btn').click();
    await wait(120);
    return doc;
  }

  afterEach(() => {
    if (dom && dom.window) dom.window.close();
  });

  it('opens the signing window on the second display and shows the waiting panel', async () => {
    const boot = bootWithSigningStart({ ok: true, started: true, displayName: 'Second Display (1280 x 800)' });
    dom = boot.dom; pageErrors = boot.pageErrors; calls = boot.calls;
    const doc = await checkout(boot);

    expect(calls.signingStarts).toHaveLength(1);
    expect(calls.signingStarts[0]).toEqual({
      customerId: 1,
      loanIds: [1],
      checkoutDate: '2026-09-21',
      dueDate: '2026-12-31',
    });
    const panel = doc.getElementById('signing-section');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Waiting for Customer Signature');
    expect(panel.textContent).toContain('Second Display (1280 x 800)');
    expect(panel.querySelector('[data-action="signing-sign-here"]')).not.toBeNull();
    expect(panel.querySelector('[data-action="signing-cancel"]')).not.toBeNull();
    expect(doc.getElementById('agreement-form')).toBeNull();
    expect(errorsOf(pageErrors, /Cannot read|is not a function/)).toEqual([]);
  });

  it('falls back to the inline agreement when there is no second display', async () => {
    const boot = bootWithSigningStart({ ok: true, started: false, reason: 'no-display' });
    dom = boot.dom; pageErrors = boot.pageErrors; calls = boot.calls;
    const doc = await checkout(boot);

    expect(calls.signingStarts).toHaveLength(1);
    await waitFor(() => boot.dom.window.document.getElementById('agreement-form') !== null);
    const agreementDoc = boot.dom.window.document;
    expect(agreementDoc.getElementById('agreement-form')).not.toBeNull();
    expect(agreementDoc.getElementById('sigCanvas')).not.toBeNull();
    expect(agreementDoc.getElementById('agreement-cancel-btn')).not.toBeNull();
    expect(agreementDoc.getElementById('agreement-print-btn')).not.toBeNull();
    expect(agreementDoc.getElementById('witness_name')).not.toBeNull();
  });

  it('cleans up the pending loans when the signing window cannot start', async () => {
    const deletes = [];
    const boot = bootWithSigningStart(
      { ok: false, error: 'A signing session is already in progress.' },
      {
        loansCancelPending: (loanIds) => {
          deletes.push(loanIds);
          return Promise.resolve({ ok: true });
        },
      }
    );
    dom = boot.dom; pageErrors = boot.pageErrors; calls = boot.calls;
    const doc = await checkout(boot);

    expect(deletes).toEqual([[1]]);
    expect(doc.getElementById('signing-section').hidden).toBe(true);
    expect(doc.getElementById('flash-container').textContent).toContain('already in progress');
  });

  it('clears the panel and refreshes when the customer finishes on the tablet', async () => {
    const boot = bootWithSigningStart({ ok: true, started: true, displayName: 'Second Display' });
    dom = boot.dom; pageErrors = boot.pageErrors; calls = boot.calls;
    const doc = await checkout(boot);
    expect(doc.getElementById('signing-section').hidden).toBe(false);

    await waitFor(() => calls.signingListeners.length > 0);
    calls.signingListeners.forEach((listener) => listener({ type: 'completed', loanIds: [1] }));
    await wait(80);

    expect(doc.getElementById('signing-section').hidden).toBe(true);
    expect(doc.getElementById('flash-container').textContent).toContain('recorded successfully');
  });

  it('sends the witness name typed by staff while the customer signs', async () => {
    const boot = bootWithSigningStart({ ok: true, started: true, displayName: 'Second Display' });
    dom = boot.dom; pageErrors = boot.pageErrors; calls = boot.calls;
    const doc = await checkout(boot);
    await waitFor(() => doc.getElementById('signing-witness') !== null);

    const witness = doc.getElementById('signing-witness');
    witness.value = 'Staff Jane';
    witness.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await wait(30);
    expect(calls.signingWitness).toEqual(['Staff Jane']);
  });
});