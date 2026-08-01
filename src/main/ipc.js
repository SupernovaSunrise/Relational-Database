const { app, ipcMain } = require('electron');
const { CHANNELS, PAYLOADS, REQUIRED_AUTH, REQUIRED_ADMIN, MAX_PAYLOAD_BYTES } = require('../shared/ipc-contract');
const db = require('./db');
const auth = require('./auth');
const customers = require('./features/customers');
const equipment = require('./features/equipment');
const loans = require('./features/loans');
const agreements = require('./features/agreements');
const reports = require('./features/reports');
const importExport = require('./features/import-export');
const print = require('./features/print');

let trustedWebContentsId = null;

function setTrustedWebContents(webContents) {
  trustedWebContentsId = webContents ? webContents.id : null;
}

function isTrustedSender(event) {
  if (!event || !event.sender) return false;
  if (trustedWebContentsId === null) return false;
  return event.sender.id === trustedWebContentsId;
}

function parseType(spec) {
  const match = /^([a-z]+)(\[\])?(?::(\d+))?(\?)?$/.exec(spec);
  if (!match) return null;
  const base = match[1] + (match[2] || '');
  const max = match[3] ? Number(match[3]) : null;
  const optional = !!match[4];
  const allowed = new Set(['string', 'number', 'boolean', 'string[]', 'number[]', 'object']);
  if (!allowed.has(base)) return null;
  if (max !== null && base !== 'string' && !base.endsWith('[]')) return null;
  return { base, max, optional };
}

function fieldIsValid(field, spec) {
  const parsed = parseType(spec);
  if (!parsed) return false;
  const { base, max } = parsed;
  switch (base) {
    case 'string':
      if (typeof field !== 'string') return false;
      if (max !== null && field.length > max) return false;
      return true;
    case 'number':
      if (typeof field !== 'number' || !Number.isInteger(field)) return false;
      return true;
    case 'boolean':
      return typeof field === 'boolean';
    case 'string[]':
      if (!Array.isArray(field)) return false;
      if (max !== null && field.length > max) return false;
      return field.every((item) => typeof item === 'string' && (max === null || item.length <= max));
    case 'number[]':
      if (!Array.isArray(field)) return false;
      if (max !== null && field.length > max) return false;
      return field.every((item) => typeof item === 'number' && Number.isInteger(item));
    case 'object':
      return typeof field === 'object' && field !== null && !Array.isArray(field);
    default:
      return false;
  }
}

function validatePayload(channel, payload) {
  const spec = PAYLOADS[channel];
  if (spec === undefined) return false;
  const value = payload === undefined || payload === null ? {} : payload;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  if (JSON.stringify(value).length > MAX_PAYLOAD_BYTES) return false;
  for (const key of Object.keys(value)) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) return false;
  }
  for (const [key, type] of Object.entries(spec)) {
    const field = value[key];
    if (field === undefined || field === null) {
      if (type.endsWith('?')) continue;
      return false;
    }
    if (!fieldIsValid(field, type)) return false;
  }
  return true;
}

function registerChannel(channel, handler) {
  ipcMain.handle(channel, (event, payload) => {
    if (!isTrustedSender(event)) return { ok: false, error: 'unauthorized sender' };
    if (!validatePayload(channel, payload)) return { ok: false, error: 'invalid payload' };
    if (!REQUIRED_AUTH.has(channel) && !auth.getSession()) return { ok: false, error: 'not authenticated' };
    if (REQUIRED_ADMIN.has(channel) && !(auth.getSession() && auth.getSession().isAdmin)) {
      return { ok: false, error: 'admin required' };
    }
    try {
      const result = handler(event, payload);
      if (result && typeof result.then === 'function') {
        return result.catch((err) => {
          db.log('error', `${channel} handler failed: ${err && err.message ? err.message : err}`);
          return { ok: false, error: 'internal error' };
        });
      }
      return result;
    } catch (err) {
      db.log('error', `${channel} handler failed: ${err && err.message ? err.message : err}`);
      return { ok: false, error: 'internal error' };
    }
  });
}

function registerIpcHandlers() {
  registerChannel(CHANNELS.APP_GET_STATUS, () => {
    return { ok: true, isFirstRun: db.countUsers() === 0, user: auth.getSession() };
  });

  registerChannel(CHANNELS.APP_SHUTDOWN, () => {
    db.log('info', 'Shutdown requested via IPC');
    setTimeout(() => app.quit(), 100);
    return { ok: true };
  });

  registerChannel(CHANNELS.APP_PRINT_PREVIEW, print.printPreviewHandler);

  registerChannel(CHANNELS.AUTH_REGISTER, auth.registerHandler);
  registerChannel(CHANNELS.AUTH_LOGIN, auth.loginHandler);
  registerChannel(CHANNELS.AUTH_LOGOUT, auth.logoutHandler);
  registerChannel(CHANNELS.AUTH_GET_SESSION, auth.getSessionHandler);
  registerChannel(CHANNELS.AUTH_CHANGE_PASSWORD, auth.changePasswordHandler);

  registerChannel(CHANNELS.CUSTOMERS_LIST, customers.listHandler);
  registerChannel(CHANNELS.CUSTOMERS_SEARCH, customers.searchHandler);
  registerChannel(CHANNELS.CUSTOMERS_GET, customers.getHandler);
  registerChannel(CHANNELS.CUSTOMERS_ADD, customers.addHandler);
  registerChannel(CHANNELS.CUSTOMERS_DELETE, customers.deleteHandler);
  registerChannel(CHANNELS.CUSTOMERS_INLINE_UPDATE, customers.inlineUpdateHandler);

  registerChannel(CHANNELS.EQUIPMENT_LIST, equipment.listHandler);
  registerChannel(CHANNELS.EQUIPMENT_ADD, equipment.addHandler);
  registerChannel(CHANNELS.EQUIPMENT_DELETE, equipment.deleteHandler);
  registerChannel(CHANNELS.EQUIPMENT_SELL, equipment.sellHandler);
  registerChannel(CHANNELS.EQUIPMENT_INLINE_UPDATE, equipment.inlineUpdateHandler);

  registerChannel(CHANNELS.LOANS_GET_MASTER_DATA, loans.getMasterDataHandler);
  registerChannel(CHANNELS.LOANS_CHECKOUT, loans.checkoutHandler);
  registerChannel(CHANNELS.LOANS_RETURN, loans.returnHandler);
  registerChannel(CHANNELS.LOANS_GET_BY_CUSTOMER, loans.getByCustomerHandler);
  registerChannel(CHANNELS.LOANS_GET_PENDING, loans.getPendingHandler);
  registerChannel(CHANNELS.LOANS_CANCEL_PENDING, loans.cancelPendingHandler);
  registerChannel(CHANNELS.LOANS_INLINE_UPDATE, loans.inlineUpdateHandler);

  registerChannel(CHANNELS.AGREEMENTS_GET_LOAN, agreements.getLoanHandler);
  registerChannel(CHANNELS.AGREEMENTS_GET_CUSTOMER, agreements.getCustomerHandler);
  registerChannel(CHANNELS.AGREEMENTS_SUBMIT, agreements.submitHandler);

  registerChannel(CHANNELS.REPORTS_GET_YEARS, reports.getYearsHandler);
  registerChannel(CHANNELS.REPORTS_GET_DATA, reports.getDataHandler);
  registerChannel(CHANNELS.REPORTS_DELETE_CHECKOUT, reports.deleteCheckoutHandler);
  registerChannel(CHANNELS.REPORTS_DELETE_ITEM_SALE, reports.deleteItemSaleHandler);

  registerChannel(CHANNELS.IMPORT_EXPORT_EXPORT_CUSTOMERS, importExport.exportCustomersHandler);
  registerChannel(CHANNELS.IMPORT_EXPORT_EXPORT_EQUIPMENT, importExport.exportEquipmentHandler);
  registerChannel(CHANNELS.IMPORT_EXPORT_EXPORT_CHECKOUT_LOG, importExport.exportCheckoutLogHandler);
  registerChannel(CHANNELS.IMPORT_EXPORT_EXPORT_MASTER, importExport.exportMasterHandler);
  registerChannel(CHANNELS.IMPORT_EXPORT_IMPORT_CUSTOMERS, importExport.importCustomersHandler);
  registerChannel(CHANNELS.IMPORT_EXPORT_IMPORT_EQUIPMENT, importExport.importEquipmentHandler);
}

module.exports = { registerIpcHandlers, setTrustedWebContents, validatePayload, isTrustedSender };
