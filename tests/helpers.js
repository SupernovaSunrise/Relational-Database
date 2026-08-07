const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/main/db');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dme-test-'));
}

function initTempDb() {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 'database.db');
  db.initDb(dbPath);
  return { dir, dbPath };
}

function cleanupDir(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {}
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fakeEvent(senderId) {
  return { sender: { id: senderId } };
}

module.exports = { makeTempDir, initTempDb, cleanupDir, todayIso, fakeEvent };
