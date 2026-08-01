const fs = require('fs');
const path = require('path');
const db = require('../db');

function buildPrintDocument(fragment) {
  const cssPath = path.join(__dirname, '..', '..', 'renderer', 'css', 'app.css');
  let css = '';
  try {
    css = fs.readFileSync(cssPath, 'utf8');
  } catch (err) {
    db.log('warn', `print preview css not found at ${cssPath}`);
  }
  const toolbar =
    '<div class="preview-toolbar">' +
      '<button type="button" onclick="window.print()">Print</button>' +
      '<button type="button" onclick="window.close()">Close</button>' +
    '</div>';
  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:;">' +
      '<title>Print Preview</title>' +
      '<style>' +
        css +
        '.preview-toolbar{position:fixed;top:0;left:0;right:0;z-index:1000;background:#fff;border-bottom:1px solid #ccc;padding:8px 16px;text-align:right;}' +
        '.preview-toolbar button{margin-left:8px;}' +
        '.preview-body{padding-top:56px;}' +
        '@media screen{.no-print{display:none !important;}}' +
        '@media print{.preview-toolbar{display:none !important;}}' +
      '</style>' +
    '</head>' +
    '<body>' +
      toolbar +
      '<div class="preview-body">' +
        fragment +
      '</div>' +
    '</body>' +
    '</html>'
  );
}

function printPreviewHandler(event, payload) {
  const electron = require('electron');
  const { BrowserWindow } = electron;
  const html = payload && typeof payload.html === 'string' ? payload.html : '';
  if (!html) return { ok: false, error: 'No printable content provided.' };
  const parent = BrowserWindow.fromWebContents(event.sender);
  const dir = electron.app.getPath('temp');
  const filePath = path.join(dir, `dme-print-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(filePath, buildPrintDocument(html), 'utf8');
  const win = new BrowserWindow({
    parent: parent || undefined,
    width: 1000,
    height: 1200,
    title: 'Print Preview',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (navEvent, url) => {
    if (url !== win.webContents.getURL()) navEvent.preventDefault();
  });
  win.on('closed', () => {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {}
  });
  win.loadFile(filePath).catch((err) => {
    db.log('error', `print preview load failed: ${err && err.message ? err.message : err}`);
  });
  return { ok: true };
}

module.exports = { printPreviewHandler };
