const fs = require('fs');
const path = require('path');
const db = require('../db');

function buildPrintDocument(fragment) {
  const cssPath = path.join(__dirname, '..', '..', 'renderer', 'css', 'app.css');
  let css = '';
  try {
    css = fs.readFileSync(cssPath, 'utf8');
  } catch (err) {
    db.log('warn', `print css not found at ${cssPath}`);
  }
  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:;">' +
      '<title>Print</title>' +
      '<style>' +
        css +
        '@media screen{.no-print{display:none !important;}}' +
      '</style>' +
    '</head>' +
    '<body>' +
      fragment +
    '</body>' +
    '</html>'
  );
}

function printPdfHandler(event, payload) {
  const electron = require('electron');
  const { BrowserWindow, shell } = electron;
  const html = payload && typeof payload.html === 'string' ? payload.html : '';
  if (!html) return { ok: false, error: 'No printable content provided.' };
  const dir = electron.app.getPath('temp');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const htmlPath = path.join(dir, `dme-print-${suffix}.html`);
  const pdfPath = path.join(dir, `dme-print-${suffix}.pdf`);
  fs.writeFileSync(htmlPath, buildPrintDocument(html), 'utf8');
  const win = new BrowserWindow({
    show: false,
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
  win.webContents.on('did-fail-load', (_event, code, desc) => {
    db.log('error', `print page load failed: ${code} ${desc}`);
  });
  return win
    .loadFile(htmlPath)
    .then(() =>
      win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'Letter',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      })
    )
    .then((data) => {
      fs.writeFileSync(pdfPath, data);
      if (!win.isDestroyed()) win.destroy();
      try {
        fs.unlinkSync(htmlPath);
      } catch (err) {}
      return shell.openPath(pdfPath);
    })
    .then((openError) => {
      if (openError) {
        db.log('error', `print open failed: ${openError}`);
        return { ok: false, error: `Could not open the generated PDF: ${openError}` };
      }
      setTimeout(() => {
        try {
          fs.unlinkSync(pdfPath);
        } catch (err) {}
      }, 300000);
      return { ok: true };
    })
    .catch((err) => {
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch (destroyErr) {}
      try {
        fs.unlinkSync(htmlPath);
      } catch (unlinkErr) {}
      try {
        fs.unlinkSync(pdfPath);
      } catch (unlinkErr) {}
      db.log('error', `print failed: ${err && err.message ? err.message : err}`);
      return { ok: false, error: 'Print failed.' };
    });
}

module.exports = { printPreviewHandler: printPdfHandler };
