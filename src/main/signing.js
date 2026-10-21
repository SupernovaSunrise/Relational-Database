const fs = require('fs');
const path = require('path');
const db = require('./db');
const agreements = require('./features/agreements');
const loans = require('./features/loans');
const { EVENTS } = require('../shared/ipc-contract');

const SETTING_KEY = 'tabletSigningEnabled';
const SETTING_DEFAULT = '1';

let trust = null;
let getMainWindow = null;
let active = null;
let screenListenersBound = false;

function electronApi() {
  return require('electron');
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isEnabled() {
  return db.getSetting(SETTING_KEY, SETTING_DEFAULT) !== '0';
}

function getScreen() {
  try {
    const { screen } = electronApi();
    return screen && typeof screen.getAllDisplays === 'function' ? screen : null;
  } catch (err) {
    return null;
  }
}

function displayName(display) {
  const size = display && display.size;
  const scale = (display && display.scaleFactor) || 1;
  if (size && typeof size.width === 'number' && typeof size.height === 'number') {
    return `Second Display (${Math.round(size.width * scale)} x ${Math.round(size.height * scale)})`;
  }
  return 'Second Display';
}

function findDisplayById(id) {
  const screen = getScreen();
  if (!screen) return null;
  const displays = screen.getAllDisplays() || [];
  return displays.find((display) => display && display.id === id) || null;
}

function pickSecondaryDisplay() {
  const screen = getScreen();
  if (!screen) return null;
  let displays;
  try {
    displays = screen.getAllDisplays();
  } catch (err) {
    return null;
  }
  if (!Array.isArray(displays) || displays.length < 2) return null;
  let primaryId = null;
  try {
    primaryId = screen.getPrimaryDisplay().id;
  } catch (err) {
    primaryId = null;
  }
  const secondary = displays.find((display) => display && display.id !== primaryId && display.bounds);
  if (!secondary) return null;
  return { id: secondary.id, name: displayName(secondary) };
}

function displayBounds(display) {
  const bounds = (display && display.bounds) || {};
  return {
    x: Math.round(bounds.x || 0),
    y: Math.round(bounds.y || 0),
    width: Math.round(bounds.width || 1024),
    height: Math.round(bounds.height || 768),
  };
}

function getWindowIcon() {
  try {
    const electron = electronApi();
    const iconPath = electron.app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '..', '..', 'icon.ico');
    return fs.existsSync(iconPath) ? iconPath : null;
  } catch (err) {
    return null;
  }
}

function emitMain(payload) {
  if (!getMainWindow) return;
  try {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(EVENTS.SIGNING_EVENT, payload);
  } catch (err) {
    db.log('warn', `signing event dispatch failed: ${err && err.message ? err.message : err}`);
  }
}

function finishSession(outcome, opts) {
  if (!active) return;
  active.outcome = outcome;
  if (opts && opts.silent) active.silent = true;
  const win = active.window;
  if (win && !win.isDestroyed()) win.close();
}

function onSignerClosed(session) {
  if (active === session) active = null;
  if (trust && session.webContents) trust.removeTrustedWebContents(session.webContents);
  if (!session.announced || session.silent) return;
  const outcome = session.outcome || 'interrupted';
  if (outcome === 'interrupted') {
    try {
      loans.cancelPendingHandler(null, { loanIds: session.loanIds.slice() });
    } catch (err) {
      db.log('error', `failed to cancel pending loans after signing interruption: ${err && err.message ? err.message : err}`);
    }
  }
  emitMain({ type: outcome, loanIds: session.loanIds.slice() });
}

function loansAreOwnedAndPending(session) {
  return db.withDb((conn) => {
    const placeholders = session.loanIds.map(() => '?').join(',');
    const rows = conn
      .prepare(`SELECT id, customer_id, agreement_pending FROM loans WHERE id IN (${placeholders})`)
      .all(...session.loanIds);
    if (rows.length !== session.loanIds.length) return false;
    return rows.every(
      (row) => row.customer_id === session.customerId && row.agreement_pending === 1
    );
  });
}

function startHandler(event, payload) {
  if (!isEnabled()) {
    return { ok: true, started: false, reason: 'disabled' };
  }
  const display = pickSecondaryDisplay();
  if (!display) {
    return { ok: true, started: false, reason: 'no-display' };
  }
  if (active) {
    return { ok: false, error: 'A signing session is already in progress.' };
  }
  const loanIds = Array.isArray(payload.loanIds)
    ? payload.loanIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (!loanIds.length) {
    return { ok: false, error: 'No pending loans to sign.' };
  }
  if (!Number.isInteger(payload.customerId) || payload.customerId <= 0) {
    return { ok: false, error: 'Customer not found.' };
  }
  const session = {
    window: null,
    webContents: null,
    customerId: payload.customerId,
    loanIds,
    checkoutDate: payload.checkoutDate,
    dueDate: payload.dueDate || '',
    witnessName: '',
    displayId: display.id,
    outcome: null,
    announced: false,
    silent: false,
  };
  if (!loansAreOwnedAndPending(session)) {
    return { ok: false, error: 'Those items are no longer available for signing.' };
  }

  const { BrowserWindow } = electronApi();
  const target = findDisplayById(display.id);
  if (!target) {
    return { ok: true, started: false, reason: 'no-display' };
  }
  const bounds = displayBounds(target);
  db.log('info', `Opening signing window on display ${display.id} (${display.name})`);
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    fullscreen: true,
    show: false,
    backgroundColor: '#ffffff',
    title: 'Customer Signature',
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });

  session.window = win;
  session.webContents = win.webContents;

  if (trust) trust.addSignerWebContents(win.webContents);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (navEvent, url) => {
    if (url !== win.webContents.getURL()) navEvent.preventDefault();
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    db.log('error', `signing renderer gone: ${details && details.reason ? details.reason : 'unknown'}`);
    if (active === session) active = null;
    if (!win.isDestroyed()) win.destroy();
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    db.log('error', `signing page load failed: ${code} ${desc}`);
  });
  win.on('closed', () => onSignerClosed(session));

  active = session;

  return win
    .loadFile(path.join(__dirname, '..', 'renderer', 'sign.html'))
    .then(() => {
      if (win.isDestroyed() || active !== session) {
        return { ok: false, error: 'Signing window was closed.' };
      }
      session.announced = true;
      win.show();
      return { ok: true, started: true, displayName: display.name };
    })
    .catch((err) => {
      db.log('error', `signing window failed to open: ${err && err.message ? err.message : err}`);
      if (active === session) active = null;
      if (trust) trust.removeTrustedWebContents(win.webContents);
      if (!win.isDestroyed()) win.destroy();
      return { ok: false, error: 'Could not open the signing display.' };
    });
}

function getStatusHandler() {
  const display = pickSecondaryDisplay();
  return {
    ok: true,
    enabled: isEnabled(),
    secondaryDisplayName: display ? display.name : null,
    active: !!active,
    loanIds: active ? active.loanIds.slice() : [],
    customerId: active ? active.customerId : null,
  };
}

function setEnabledHandler(event, payload) {
  db.setSetting(SETTING_KEY, payload.enabled ? '1' : '0');
  if (!payload.enabled) finishSession('interrupted');
  return { ok: true, enabled: isEnabled() };
}

function setWitnessHandler(event, payload) {
  if (!active) {
    return { ok: false, error: 'No signing session is in progress.' };
  }
  active.witnessName = String(payload.witnessName || '').trim().slice(0, 255);
  return { ok: true };
}

function buildContext(session) {
  const items = [];
  let customer = null;
  let checkoutPeriodDays = 120;
  for (const loanId of session.loanIds) {
    const res = agreements.getLoanHandler(null, { loanId });
    if (!res || !res.ok) continue;
    if (!customer) {
      customer = res.customer;
      checkoutPeriodDays = res.checkoutPeriodDays;
    }
    items.push({
      equipment_id: res.item.equipment_id,
      item_name: res.item.item_name,
      due_date: res.item.due_date,
    });
  }
  if (!customer || !items.length) {
    return { ok: false, error: 'Loan not found.' };
  }
  return {
    ok: true,
    customer: { name: customer.name, phone: customer.phone, zip_code: customer.zip_code },
    items,
    checkoutDate: session.checkoutDate,
    returnBy: session.dueDate || (items[0] && items[0].due_date) || '',
    checkoutPeriodDays,
    witnessName: session.witnessName || '',
  };
}

function getContextHandler() {
  if (!active) {
    return { ok: false, error: 'No signing session is in progress.' };
  }
  return buildContext(active);
}

function submitHandler(event, payload) {
  if (!active) {
    return { ok: false, error: 'No signing session is in progress.' };
  }
  if (!payload.waiverAgreed) {
    return { ok: false, error: 'You must agree to the General Terms of Use and Loan Agreement.' };
  }
  const session = active;
  if (!loansAreOwnedAndPending(session)) {
    return { ok: false, error: 'This agreement is no longer current. Please ask staff for assistance.' };
  }
  const result = agreements.submitHandler(null, {
    customerId: session.customerId,
    loanIds: session.loanIds,
    checkoutDate: session.checkoutDate,
    returnBy: session.dueDate || '',
    agreementDate: todayIso(),
    waiverAgreed: true,
    witnessName: session.witnessName,
    signatureData: payload.signatureData || '',
  });
  if (!result || !result.ok) {
    return result && result.error ? result : { ok: false, error: 'Failed to save agreement.' };
  }
  const updated = result.updatedLoanIds || [];
  if (updated.length !== session.loanIds.length) {
    db.log('warn', `signing submit matched ${updated.length} of ${session.loanIds.length} loans`);
    return { ok: false, error: 'This agreement is no longer current. Please ask staff for assistance.' };
  }
  finishSession('completed');
  return { ok: true, message: result.message };
}

function cancelHandler() {
  if (!active) {
    return { ok: true, message: 'Nothing to cancel.' };
  }
  const result = loans.cancelPendingHandler(null, { loanIds: active.loanIds.slice() });
  finishSession('cancelled');
  return result;
}

function abandonHandler() {
  if (!active) {
    return { ok: true, active: false };
  }
  const handoff = {
    ok: true,
    active: true,
    customerId: active.customerId,
    loanIds: active.loanIds.slice(),
    checkoutDate: active.checkoutDate,
    dueDate: active.dueDate,
  };
  finishSession('handoff', { silent: true });
  return handoff;
}

function closeSigning() {
  finishSession('interrupted');
}

function initSigning(trustApi, getMainWindowFn) {
  trust = trustApi || null;
  getMainWindow = getMainWindowFn || null;
  bindScreenListeners();
}

function bindScreenListeners() {
  if (screenListenersBound) return;
  const screen = getScreen();
  if (!screen || typeof screen.on !== 'function') return;
  screenListenersBound = true;
  screen.on('display-removed', (_event, displayId) => {
    if (!active || active.displayId !== displayId) return;
    db.log('info', 'Signing display disconnected; closing the signing window.');
    finishSession('interrupted');
  });
}

function resetSigningState() {
  active = null;
  screenListenersBound = false;
  trust = null;
  getMainWindow = null;
}

module.exports = {
  initSigning,
  startHandler,
  getStatusHandler,
  setEnabledHandler,
  setWitnessHandler,
  getContextHandler,
  submitHandler,
  cancelHandler,
  abandonHandler,
  closeSigning,
  resetSigningState,
  isEnabled,
  SETTING_KEY,
};