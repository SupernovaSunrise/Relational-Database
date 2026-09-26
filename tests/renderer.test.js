const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM, VirtualConsole } = require('jsdom');

const RENDERER_DIR = path.join(__dirname, '..', 'src', 'renderer');
const INDEX_URL = pathToFileURL(path.join(RENDERER_DIR, 'index.html')).href;

function indexHtmlWithInlineScripts() {
  const html = fs.readFileSync(path.join(RENDERER_DIR, 'index.html'), 'utf8');
  return html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
    const code = fs.readFileSync(path.join(RENDERER_DIR, src), 'utf8');
    return '<script>\n' + code + '\n</script>';
  });
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
  const pageErrors = [];
  const calls = { confirms: [], nativeConfirms: 0, checkoutDeletes: [], itemSaleDeletes: [] };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    pageErrors.push(err);
  });

  const dom = new JSDOM(indexHtmlWithInlineScripts(), {
    url: INDEX_URL,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      const base = makeDmeStub(calls);
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