const auth = require('../src/main/auth');
const db = require('../src/main/db');
const { initTempDb, cleanupDir, fakeEvent } = require('./helpers');

const WERKZEUG_PBKDF2_VECTOR =
  'pbkdf2:sha256:600000$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d';
const WERKZEUG_SCRYPT_VECTOR =
  'scrypt:32768:8:1$TNqyKKs38tot6cGC$21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a183';

describe('verifyPassword against real werkzeug output', () => {
  test('accepts a werkzeug 2.3.7 pbkdf2:sha256 hash', () => {
    expect(auth.verifyPassword('Password123!', WERKZEUG_PBKDF2_VECTOR)).toBe(true);
  });

  test('accepts a werkzeug 3.1.3 scrypt hash', () => {
    expect(auth.verifyPassword('scryptTest99', WERKZEUG_SCRYPT_VECTOR)).toBe(true);
  });

  test('rejects wrong passwords for both hash formats', () => {
    expect(auth.verifyPassword('wrong', WERKZEUG_PBKDF2_VECTOR)).toBe(false);
    expect(auth.verifyPassword('wrong', WERKZEUG_SCRYPT_VECTOR)).toBe(false);
    expect(auth.verifyPassword('scryptTest99', WERKZEUG_PBKDF2_VECTOR)).toBe(false);
    expect(auth.verifyPassword('Password123!', WERKZEUG_SCRYPT_VECTOR)).toBe(false);
  });

  test('treats the salt as a UTF-8 string, not hex-decoded', () => {
    const saltHexDecoded = Buffer.from('SRKk1htZZg5e4sYG', 'utf8').toString('hex');
    const tampered = `pbkdf2:sha256:600000$${saltHexDecoded}$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d`;
    expect(auth.verifyPassword('Password123!', tampered)).toBe(false);
  });

  test('rejects a tampered salt and a tampered hash', () => {
    const badSalt = WERKZEUG_PBKDF2_VECTOR.replace('SRKk1htZZg5e4sYG', 'TRKk1htZZg5e4sYG');
    const badHash = WERKZEUG_PBKDF2_VECTOR.replace('3320d828', '3320d829');
    expect(auth.verifyPassword('Password123!', badSalt)).toBe(false);
    expect(auth.verifyPassword('Password123!', badHash)).toBe(false);
  });

  test('rejects malformed hashes', () => {
    expect(auth.verifyPassword('x', null)).toBe(false);
    expect(auth.verifyPassword('x', 12345)).toBe(false);
    expect(auth.verifyPassword('x', { method: 'pbkdf2' })).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:600000')).toBe(false);
    expect(auth.verifyPassword('x', 'a$b$c$d')).toBe(false);
    expect(auth.verifyPassword(123, WERKZEUG_PBKDF2_VECTOR)).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:600000$$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:600000$SRKk1htZZg5e4sYG$zzzz')).toBe(false);
  });

  test('rejects wrong-length or non-hex hash components', () => {
    const shortHash = WERKZEUG_PBKDF2_VECTOR.replace(
      '3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d',
      '3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9'
    );
    expect(auth.verifyPassword('Password123!', shortHash)).toBe(false);
    const scryptShort = WERKZEUG_SCRYPT_VECTOR.replace(
      '21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a183',
      '21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a18'
    );
    expect(auth.verifyPassword('scryptTest99', scryptShort)).toBe(false);
  });

  test('rejects excessive pbkdf2 iterations', () => {
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:10000001$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:600000.5$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:abc$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:0$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
  });

  test('rejects non-sha256 pbkdf2 methods and malformed method parts', () => {
    expect(auth.verifyPassword('x', 'pbkdf2:md5:600000$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
    expect(auth.verifyPassword('x', 'pbkdf2:sha256:600000:extra$SRKk1htZZg5e4sYG$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
    expect(auth.verifyPassword('x', 'unknown:1$salt$3320d8289504f515ad17d774e14b98103012dc02735cf677aac154c8302a2c9d')).toBe(false);
  });

  test('rejects excessive scrypt parameters', () => {
    const n = 'scrypt:524289:8:1$TNqyKKs38tot6cGC$21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a183';
    const r = 'scrypt:32768:33:1$TNqyKKs38tot6cGC$21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a183';
    const p = 'scrypt:32768:8:9$TNqyKKs38tot6cGC$21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a183';
    const badShape = 'scrypt:32768:8:1:9$TNqyKKs38tot6cGC$21ddd3e19ba08bf92607c1a8932c19b6e04af00997447884a839a77e0bc2e2b9bfb62ae89c3af8c39aabd1486dab0d638352e35a377ba01a908cc80ea664a183';
    expect(auth.verifyPassword('scryptTest99', n)).toBe(false);
    expect(auth.verifyPassword('scryptTest99', r)).toBe(false);
    expect(auth.verifyPassword('scryptTest99', p)).toBe(false);
    expect(auth.verifyPassword('scryptTest99', badShape)).toBe(false);
  });
});

describe('hashPassword and roundtrip', () => {
  test('produces a werkzeug-compatible pbkdf2:sha256:600000 hash string', () => {
    const hashed = auth.hashPassword('Password123!');
    expect(hashed).toMatch(/^pbkdf2:sha256:600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  });

  test('roundtrips through verifyPassword', () => {
    const hashed = auth.hashPassword('correct horse battery staple');
    expect(auth.verifyPassword('correct horse battery staple', hashed)).toBe(true);
    expect(auth.verifyPassword('wrong', hashed)).toBe(false);
  });
});

describe('registerHandler validation order', () => {
  let temp;

  beforeEach(() => {
    auth.clearSession();
    temp = initTempDb();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('first user on an empty database is public and becomes admin', () => {
    const result = auth.registerHandler(fakeEvent(1), { username: 'firstuser', password: 'password1' });
    expect(result.ok).toBe(true);
    const user = db.getUserByUsername('firstuser');
    expect(user.isAdmin).toBe(1);
    expect(db.countUsers()).toBe(1);
  });

  test('empty username or password fails first', () => {
    const result = auth.registerHandler(fakeEvent(1), { username: '', password: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Username and password are required.');
  });

  test('username shorter than 3 characters fails', () => {
    const result = auth.registerHandler(fakeEvent(1), { username: 'ab', password: 'password1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Username must be at least 3 characters.');
  });

  test('password shorter than 8 characters fails', () => {
    const result = auth.registerHandler(fakeEvent(1), { username: 'validname', password: '1234567' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Password must be at least 8 characters.');
  });

  test('duplicate username fails', () => {
    auth.registerHandler(fakeEvent(1), { username: 'validname', password: 'password1' });
    auth.setSession({ id: 1, username: 'validname', isAdmin: 1 });
    const result = auth.registerHandler(fakeEvent(1), { username: 'validname', password: 'password2' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Username already exists.');
  });

  test('the admin gate precedes field validation once users exist', () => {
    auth.registerHandler(fakeEvent(1), { username: 'firstuser', password: 'password1' });
    auth.clearSession();
    const empty = auth.registerHandler(fakeEvent(2), { username: '', password: '' });
    expect(empty.ok).toBe(false);
    expect(empty.error).toBe('Only administrators can register new users.');
  });

  test('non-admin sessions cannot register new users', () => {
    auth.registerHandler(fakeEvent(1), { username: 'admin', password: 'password1' });
    auth.setSession({ id: 1, username: 'admin', isAdmin: 1 });
    auth.registerHandler(fakeEvent(1), { username: 'staff', password: 'password1' });
    auth.clearSession();
    auth.setSession({ id: 2, username: 'staff', isAdmin: 0 });
    const result = auth.registerHandler(fakeEvent(3), { username: 'third', password: 'password1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Only administrators can register new users.');
  });

  test('admin sessions can register users who are not admins', () => {
    auth.registerHandler(fakeEvent(1), { username: 'admin', password: 'password1' });
    auth.setSession({ id: 1, username: 'admin', isAdmin: 1 });
    const result = auth.registerHandler(fakeEvent(1), { username: 'staff', password: 'password1' });
    expect(result.ok).toBe(true);
    expect(db.getUserByUsername('staff').isAdmin).toBe(0);
  });

  test('username is trimmed before saving', () => {
    const result = auth.registerHandler(fakeEvent(1), { username: '  padded  ', password: 'password1' });
    expect(result.ok).toBe(true);
    expect(db.getUserByUsername('padded')).not.toBeNull();
  });
});

describe('loginHandler and the rate limiter', () => {
  let temp;

  beforeEach(() => {
    auth.clearSession();
    auth.clearLoginFailures(7);
    auth.clearLoginFailures(8);
    auth.clearLoginFailures(9);
    auth.clearLoginFailures(10);
    temp = initTempDb();
    auth.registerHandler(fakeEvent(1), { username: 'alice', password: 'password1' });
    auth.clearSession();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('successful login sets the session and returns the user', () => {
    const result = auth.loginHandler(fakeEvent(7), { username: 'alice', password: 'password1' });
    expect(result.ok).toBe(true);
    expect(result.user.username).toBe('alice');
    expect(result.user.isAdmin).toBe(1);
    expect(auth.getSession()).toEqual({ id: 1, username: 'alice', isAdmin: 1 });
  });

  test('wrong password records a failure and returns an error', () => {
    const result = auth.loginHandler(fakeEvent(7), { username: 'alice', password: 'wrongpass' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid username or password.');
    expect(auth.getSession()).toBeNull();
    expect(auth.isLoginBlocked(7)).toBe(false);
  });

  test('five failed attempts block the sender even with the correct password', () => {
    for (let i = 0; i < 5; i++) {
      auth.loginHandler(fakeEvent(7), { username: 'alice', password: 'wrongpass' });
    }
    expect(auth.isLoginBlocked(7)).toBe(true);
    const blocked = auth.loginHandler(fakeEvent(7), { username: 'alice', password: 'password1' });
    expect(blocked.ok).toBe(false);
    expect(blocked.blocked).toBe(true);
    expect(blocked.error).toBe('Too many failed login attempts. Please wait a few minutes and try again.');
  });

  test('a different sender id is not affected by another sender failing', () => {
    for (let i = 0; i < 5; i++) {
      auth.loginHandler(fakeEvent(7), { username: 'alice', password: 'wrongpass' });
    }
    const result = auth.loginHandler(fakeEvent(8), { username: 'alice', password: 'password1' });
    expect(result.ok).toBe(true);
  });

  test('a successful login clears the failure log for that sender', () => {
    for (let i = 0; i < 4; i++) {
      auth.loginHandler(fakeEvent(9), { username: 'alice', password: 'wrongpass' });
    }
    const ok = auth.loginHandler(fakeEvent(9), { username: 'alice', password: 'password1' });
    expect(ok.ok).toBe(true);
    for (let i = 0; i < 5; i++) {
      auth.loginHandler(fakeEvent(9), { username: 'alice', password: 'wrongpass' });
    }
    expect(auth.isLoginBlocked(9)).toBe(true);
  });

  test('failures expire after the five-minute window', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) {
        auth.loginHandler(fakeEvent(10), { username: 'alice', password: 'wrongpass' });
      }
      expect(auth.isLoginBlocked(10)).toBe(true);
      jest.advanceTimersByTime(auth.LOGIN_FAILED_PERIOD * 1000 + 1000);
      expect(auth.isLoginBlocked(10)).toBe(false);
      const result = auth.loginHandler(fakeEvent(10), { username: 'alice', password: 'password1' });
      expect(result.ok).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('session management', () => {
  beforeEach(() => {
    auth.clearSession();
  });

  afterEach(() => {
    auth.clearSession();
  });

  test('get/set/clear session', () => {
    expect(auth.getSession()).toBeNull();
    auth.setSession({ id: 3, username: 'bob', isAdmin: 0 });
    expect(auth.getSession()).toEqual({ id: 3, username: 'bob', isAdmin: 0 });
    auth.clearSession();
    expect(auth.getSession()).toBeNull();
  });
});

describe('logoutHandler', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
  });

  afterEach(() => {
    auth.clearSession();
    cleanupDir(temp.dir);
  });

  test('logout without a session fails', () => {
    auth.clearSession();
    const result = auth.logoutHandler(fakeEvent(1));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Not authenticated.');
  });

  test('logout clears the session', () => {
    auth.setSession({ id: 1, username: 'alice', isAdmin: 1 });
    const result = auth.logoutHandler(fakeEvent(1));
    expect(result.ok).toBe(true);
    expect(auth.getSession()).toBeNull();
  });
});

describe('changePasswordHandler', () => {
  let temp;

  beforeEach(() => {
    auth.clearSession();
    temp = initTempDb();
    auth.registerHandler(fakeEvent(1), { username: 'alice', password: 'password1' });
    auth.setSession({ id: 1, username: 'alice', isAdmin: 1 });
  });

  afterEach(() => {
    auth.clearSession();
    cleanupDir(temp.dir);
  });

  test('requires authentication', () => {
    auth.clearSession();
    const result = auth.changePasswordHandler(fakeEvent(1), {
      currentPassword: 'password1',
      newPassword: 'password2',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Not authenticated.');
  });

  test('requires both fields', () => {
    const result = auth.changePasswordHandler(fakeEvent(1), { currentPassword: '', newPassword: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('All fields are required.');
  });

  test('requires a new password of at least 8 characters', () => {
    const result = auth.changePasswordHandler(fakeEvent(1), {
      currentPassword: 'password1',
      newPassword: 'short',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('New password must be at least 8 characters.');
  });

  test('rejects a wrong current password', () => {
    const result = auth.changePasswordHandler(fakeEvent(1), {
      currentPassword: 'wrongpass',
      newPassword: 'password2',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Current password is incorrect.');
  });

  test('changes the password so only the new password logs in', () => {
    const result = auth.changePasswordHandler(fakeEvent(1), {
      currentPassword: 'password1',
      newPassword: 'brandnew9',
    });
    expect(result.ok).toBe(true);
    auth.clearSession();
    const oldLogin = auth.loginHandler(fakeEvent(5), { username: 'alice', password: 'password1' });
    expect(oldLogin.ok).toBe(false);
    const newLogin = auth.loginHandler(fakeEvent(5), { username: 'alice', password: 'brandnew9' });
    expect(newLogin.ok).toBe(true);
  });

  test('the stored hash is re-verifiable as a new werkzeug-style hash', () => {
    auth.changePasswordHandler(fakeEvent(1), { currentPassword: 'password1', newPassword: 'brandnew9' });
    const user = db.getUserByUsername('alice');
    expect(user.passwordHash).toMatch(/^pbkdf2:sha256:600000\$/);
    expect(auth.verifyPassword('brandnew9', user.passwordHash)).toBe(true);
  });
});

describe('db user CRUD used by auth', () => {
  let temp;

  beforeEach(() => {
    temp = initTempDb();
  });

  afterEach(() => {
    cleanupDir(temp.dir);
  });

  test('createUser, getUserByUsername, getUserById, updatePassword, countUsers', () => {
    const id = db.createUser('carol', 'hash1', 1);
    expect(id).toBe(1);
    expect(db.countUsers()).toBe(1);
    const byName = db.getUserByUsername('carol');
    expect(byName).toEqual({ id: 1, username: 'carol', passwordHash: 'hash1', isAdmin: 1 });
    expect(db.getUserById(1)).toEqual({ id: 1, username: 'carol', passwordHash: 'hash1', isAdmin: 1 });
    expect(db.getUserByUsername('nope')).toBeNull();
    expect(db.getUserById(999)).toBeNull();
    db.updatePassword(1, 'hash2');
    expect(db.getUserById(1).passwordHash).toBe('hash2');
  });
});
