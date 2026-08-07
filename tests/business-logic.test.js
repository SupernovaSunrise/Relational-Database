const bl = require('../src/shared/business-logic');
const fixture = require('./fixtures/legacy-reference.json');

describe('calculateDueDate parity with the legacy fixture (2020-2040)', () => {
  test('matches the fixture output for every reference case', () => {
    const mismatches = [];
    for (const [key, expected] of Object.entries(fixture.due_results)) {
      const colon = key.indexOf(':');
      const date = colon === -1 ? key : key.slice(0, colon);
      const period = colon === -1 ? undefined : Number(key.slice(colon + 1));
      const actual = bl.calculateDueDate(date, period);
      if (actual !== expected) {
        mismatches.push({ key, expected, actual });
      }
    }
    expect(mismatches).toEqual([]);
  });

  test.each([
    ['2024-03-01', '2024-08-21'],
    ['2024-05-20', '2024-11-12'],
    ['2026-07-07', '2026-12-29'],
    ['2020-01-01', '2020-06-23'],
    ['2024-12-20', '2025-06-13'],
    ['2025-12-31', '2026-06-24'],
    ['2029-01-01', '2029-06-22'],
    ['2032-02-29', '2032-08-18'],
    ['2036-12-25', '2037-06-17'],
    ['2024-11-28:7', '2024-12-09'],
    ['2030-06-19:60', '2030-09-13'],
  ])('calculateDueDate(%s) -> %s', (date, expected) => {
    const colon = date.indexOf(':');
    if (colon === -1) {
      expect(bl.calculateDueDate(date)).toBe(expected);
    } else {
      expect(bl.calculateDueDate(date.slice(0, colon), Number(date.slice(colon + 1)))).toBe(expected);
    }
  });

  test('weekend checkout dates are accepted as the start day and count toward the period', () => {
    expect(bl.calculateDueDate('2024-07-06')).toBe('2024-12-27');
    expect(bl.calculateDueDate('2024-07-04')).toBe('2024-12-26');
  });

  test('returns empty string for blank or non-date input', () => {
    expect(bl.calculateDueDate('')).toBe('');
    expect(bl.calculateDueDate(null)).toBe('');
    expect(bl.calculateDueDate(undefined)).toBe('');
    expect(bl.calculateDueDate('not-a-date')).toBe('');
  });
});

describe('federal holidays', () => {
  test('produces exactly 11 holidays per year for 2020-2040', () => {
    for (const year of Object.keys(fixture.holidays_by_year)) {
      expect(bl.federalHolidays(Number(year)).size).toBe(11);
    }
  });

  test('matches the fixture holiday set for every year 2020-2040', () => {
    for (const [year, expected] of Object.entries(fixture.holidays_by_year)) {
      expect(Array.from(bl.federalHolidays(Number(year))).sort()).toEqual(expected);
    }
  });

  test('includes the canonical 2024 federal holiday dates', () => {
    expect(Array.from(bl.federalHolidays(2024)).sort()).toEqual([
      '2024-01-01',
      '2024-01-15',
      '2024-02-19',
      '2024-05-27',
      '2024-06-19',
      '2024-07-04',
      '2024-09-02',
      '2024-10-14',
      '2024-11-11',
      '2024-11-28',
      '2024-12-25',
    ]);
  });

  test('observes weekend holidays on the adjacent weekday', () => {
    expect(bl.federalHolidays(2026).has('2026-07-03')).toBe(true);
    expect(bl.federalHolidays(2026).has('2026-07-04')).toBe(false);
    expect(bl.federalHolidays(2032).has('2032-07-05')).toBe(true);
    expect(bl.federalHolidays(2032).has('2032-06-18')).toBe(true);
    expect(bl.federalHolidays(2032).has('2032-12-24')).toBe(true);
  });

  test('isBusinessDay excludes weekends and holidays', () => {
    const holidays = bl.allHolidaysForSpan('2024-07-01', 30);
    expect(bl.isBusinessDay('2024-07-04', holidays)).toBe(false);
    expect(bl.isBusinessDay('2024-07-06', holidays)).toBe(false);
    expect(bl.isBusinessDay('2024-07-07', holidays)).toBe(false);
    expect(bl.isBusinessDay('2024-07-08', holidays)).toBe(true);
  });

  test('addBusinessDays skips weekends and holidays', () => {
    const holidays = bl.allHolidaysForSpan('2024-03-01', 120);
    expect(bl.addBusinessDays('2024-03-01', 120, holidays)).toBe('2024-08-21');
    expect(bl.addBusinessDays('2024-07-01', 5, holidays)).toBe('2024-07-09');
  });

  test('calculateBusinessDays counts only business days in a span', () => {
    const holidays = bl.allHolidaysForSpan('2024-07-01', 30);
    expect(bl.calculateBusinessDays('2024-07-01', '2024-07-09', holidays)).toBe(5);
  });
});

describe('normalizeDateInput', () => {
  test('matches the fixture normalize_date_input cases', () => {
    for (const [raw, expected] of Object.entries(fixture.normalize_results)) {
      expect(bl.normalizeDateInput(raw)).toBe(expected);
    }
  });

  test.each([
    ['', ''],
    ['2026-07-07', '2026-07-07'],
    ['07/07/2026', '2026-07-07'],
    ['7/7/2026', '2026-07-07'],
    ['2026/07/07', '2026-07-07'],
    [' 2026-07-07 ', '2026-07-07'],
  ])('normalizeDateInput(%j) -> %s', (raw, expected) => {
    expect(bl.normalizeDateInput(raw)).toBe(expected);
  });

  test('null and undefined normalize to empty string', () => {
    expect(bl.normalizeDateInput(null)).toBe('');
    expect(bl.normalizeDateInput(undefined)).toBe('');
  });

  test('unknown formats pass through unchanged', () => {
    expect(bl.normalizeDateInput('yesterday')).toBe('yesterday');
    expect(bl.normalizeDateInput('2026-13-45')).toBe('2026-13-45');
  });

  test('slashed dates roll over to the date UTC Date.UTC resolves (Python raises instead)', () => {
    expect(bl.normalizeDateInput('13/45/2026')).toBe('2027-02-14');
    expect(bl.normalizeDateInput('02/30/2026')).toBe('2026-03-02');
  });
});

describe('phone helpers', () => {
  test('matches the fixture normalize_phone/format_phone cases', () => {
    for (const [raw, expected] of Object.entries(fixture.phone_results)) {
      expect([bl.normalizePhone(raw), bl.formatPhone(raw)]).toEqual(expected);
    }
  });

  test('normalizePhone strips non-digits and drops a leading 1', () => {
    expect(bl.normalizePhone('(406) 555-1234')).toBe('4065551234');
    expect(bl.normalizePhone('14065551234')).toBe('4065551234');
    expect(bl.normalizePhone('1-406-555-1234')).toBe('4065551234');
    expect(bl.normalizePhone('')).toBe('');
    expect(bl.normalizePhone(null)).toBe('');
    expect(bl.normalizePhone(undefined)).toBe('');
  });

  test('formatPhone formats 10 digits and leaves everything else untouched', () => {
    expect(bl.formatPhone('4065551234')).toBe('(406) 555-1234');
    expect(bl.formatPhone('14065551234')).toBe('(406) 555-1234');
    expect(bl.formatPhone('(406) 555-1234')).toBe('(406) 555-1234');
    expect(bl.formatPhone('555')).toBe('555');
    expect(bl.formatPhone('')).toBe('');
  });
});

describe('escapeLike', () => {
  test('matches the fixture escape_like cases', () => {
    for (const [raw, expected] of Object.entries(fixture.escape_results)) {
      expect(bl.escapeLike(raw)).toBe(expected);
    }
  });

  test('escapes backslash, percent, and underscore', () => {
    expect(bl.escapeLike('a_b%c\\d')).toBe('a\\_b\\%c\\\\d');
    expect(bl.escapeLike('100%')).toBe('100\\%');
    expect(bl.escapeLike('plain')).toBe('plain');
  });
});

describe('todayIso', () => {
  test('returns the current local date in ISO format', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    expect(bl.todayIso()).toBe(expected);
    expect(bl.todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('legacy pytest scenarios', () => {
  test('customer agreement saving persists the entered checkout date with the corrected due date', () => {
    expect(bl.calculateDueDate('2024-03-01')).toBe('2024-08-21');
  });

  test('adding equipment during the agreement flow uses the entered checkout date for the new loan', () => {
    expect(bl.calculateDueDate('2024-03-01')).toBe('2024-08-21');
  });
});
