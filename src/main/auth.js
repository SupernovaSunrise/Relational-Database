const crypto = require('crypto');
const db = require('./db');

const LOGIN_FAILED_LIMIT = 5;
const LOGIN_FAILED_PERIOD = 300;
const MAX_PBKDF2_ITERATIONS = 10000000;
const MAX_SCRYPT_N = 524288;
const MAX_SCRYPT_R = 32;
const MAX_SCRYPT_P = 8;
const loginFailedLog = new Map();

let currentUser = null;

function hashPassword(password) {
  const iterations = 600000;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2:sha256:${iterations}$${salt}$${hash}`;
}

function deriveStoredHash(password, methodParts, salt, hashHex) {
  const prefix = methodParts[0];
  if (prefix === 'pbkdf2') {
    if (methodParts.length !== 3 || methodParts[1] !== 'sha256') return null;
    const iterations = Number(methodParts[2]);
    if (!Number.isInteger(iterations) || iterations <= 0 || iterations > MAX_PBKDF2_ITERATIONS) return null;
    if (!/^[0-9a-fA-F]{64}$/.test(hashHex)) return null;
    try {
      return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    } catch (err) {
      return null;
    }
  }
  if (prefix === 'scrypt') {
    if (methodParts.length !== 4) return null;
    const n = Number(methodParts[1]);
    const r = Number(methodParts[2]);
    const p = Number(methodParts[3]);
    if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return null;
    if (n > MAX_SCRYPT_N || r > MAX_SCRYPT_R || p > MAX_SCRYPT_P) return null;
    if (!/^[0-9a-fA-F]{128}$/.test(hashHex)) return null;
    try {
      return crypto.scryptSync(password, salt, 64, { N: n, r, p, maxmem: 132 * n * r * p });
    } catch (err) {
      return null;
    }
  }
  return null;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || typeof password !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [method, salt, hashHex] = parts;
  if (!salt || !/^[0-9a-fA-F]+$/.test(hashHex)) return false;
  const derived = deriveStoredHash(password, method.split(':'), salt, hashHex);
  if (!derived) return false;
  const stored = Buffer.from(hashHex, 'hex');
  return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
}

function getSession() {
  return currentUser;
}

function setSession(user) {
  currentUser = user;
}

function clearSession() {
  currentUser = null;
}

function isLoginBlocked(key) {
  const now = Date.now() / 1000;
  const recent = (loginFailedLog.get(key) || []).filter((t) => now - t < LOGIN_FAILED_PERIOD);
  if (recent.length === 0) {
    loginFailedLog.delete(key);
  } else {
    loginFailedLog.set(key, recent);
  }
  return recent.length >= LOGIN_FAILED_LIMIT;
}

function recordLoginFailure(key) {
  const now = Date.now() / 1000;
  const recent = (loginFailedLog.get(key) || []).filter((t) => now - t < LOGIN_FAILED_PERIOD);
  recent.push(now);
  loginFailedLog.set(key, recent);
}

function clearLoginFailures(key) {
  loginFailedLog.delete(key);
}

function registerHandler(event, payload) {
  const userCount = db.countUsers();
  const isPublic = userCount === 0;
  if (!isPublic && (!currentUser || !currentUser.isAdmin)) {
    return { ok: false, error: 'Only administrators can register new users.' };
  }
  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!username || !password) {
    return { ok: false, error: 'Username and password are required.' };
  }
  if (username.length < 3) {
    return { ok: false, error: 'Username must be at least 3 characters.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (db.getUserByUsername(username)) {
    return { ok: false, error: 'Username already exists.' };
  }
  const isAdmin = userCount === 0 ? 1 : 0;
  db.createUser(username, hashPassword(password), isAdmin);
  return { ok: true, message: 'Account created successfully. Please log in.' };
}

function loginHandler(event, payload) {
  const key = event.sender.id;
  if (isLoginBlocked(key)) {
    return {
      ok: false,
      error: 'Too many failed login attempts. Please wait a few minutes and try again.',
      blocked: true,
    };
  }
  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const user = db.getUserByUsername(username);
  if (user && verifyPassword(payload.password, user.passwordHash)) {
    clearLoginFailures(key);
    setSession({ id: user.id, username: user.username, isAdmin: user.isAdmin });
    return { ok: true, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } };
  }
  recordLoginFailure(key);
  return { ok: false, error: 'Invalid username or password.' };
}

function logoutHandler(event) {
  if (!currentUser) {
    return { ok: false, error: 'Not authenticated.' };
  }
  clearSession();
  return { ok: true };
}

function changePasswordHandler(event, payload) {
  if (!currentUser) {
    return { ok: false, error: 'Not authenticated.' };
  }
  const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
  const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
  if (!currentPassword || !newPassword) {
    return { ok: false, error: 'All fields are required.' };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  const user = db.getUserById(currentUser.id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  db.updatePassword(currentUser.id, hashPassword(newPassword));
  return { ok: true, message: 'Password changed successfully.' };
}

function getSessionHandler(event) {
  return { ok: true, user: currentUser };
}

module.exports = {
  hashPassword,
  verifyPassword,
  getSession,
  setSession,
  clearSession,
  isLoginBlocked,
  recordLoginFailure,
  clearLoginFailures,
  registerHandler,
  loginHandler,
  logoutHandler,
  changePasswordHandler,
  getSessionHandler,
  LOGIN_FAILED_LIMIT,
  LOGIN_FAILED_PERIOD,
};
