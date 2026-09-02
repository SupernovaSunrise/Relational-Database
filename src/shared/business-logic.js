const CHECKOUT_PERIOD_DAYS = 120;
const EQUIPMENT_ID_PATTERN = /^[A-Z]{2}-\d{4}$/;

const MONDAY = 0;
const SATURDAY = 5;
const SUNDAY = 6;

function toIso(year, month, day) {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { iso: new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10), jsDay };
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function pythonWeekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function nthWeekdayOfMonth(year, month, weekday, n) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const matches = [];
  for (let day = 1; day <= daysInMonth; day++) {
    if (pythonWeekday(toIso(year, month, day).iso) === weekday) {
      matches.push(day);
    }
  }
  return toIso(year, month, matches[n - 1]).iso;
}

function lastWeekdayOfMonth(year, month, weekday) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const matches = [];
  for (let day = 1; day <= daysInMonth; day++) {
    if (pythonWeekday(toIso(year, month, day).iso) === weekday) {
      matches.push(day);
    }
  }
  return toIso(year, month, matches[matches.length - 1]).iso;
}

function federalHolidays(year) {
  const holidays = new Set();

  function observed(iso) {
    const wd = pythonWeekday(iso);
    if (wd === SATURDAY) return addDays(iso, -1);
    if (wd === SUNDAY) return addDays(iso, 1);
    return iso;
  }

  holidays.add(observed(toIso(year, 1, 1).iso));
  holidays.add(nthWeekdayOfMonth(year, 1, MONDAY, 3));
  holidays.add(nthWeekdayOfMonth(year, 2, MONDAY, 3));
  holidays.add(lastWeekdayOfMonth(year, 5, MONDAY));
  holidays.add(observed(toIso(year, 6, 19).iso));
  holidays.add(observed(toIso(year, 7, 4).iso));
  holidays.add(nthWeekdayOfMonth(year, 9, MONDAY, 1));
  holidays.add(nthWeekdayOfMonth(year, 10, MONDAY, 2));
  holidays.add(observed(toIso(year, 11, 11).iso));
  holidays.add(nthWeekdayOfMonth(year, 11, 3, 4));
  holidays.add(observed(toIso(year, 12, 25).iso));

  return holidays;
}

function allHolidaysForSpan(startIso, days) {
  const holidays = new Set();
  const end = addDays(startIso, days + 60);
  const startYear = Number(startIso.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  for (let year = startYear; year <= endYear; year++) {
    for (const holiday of federalHolidays(year)) {
      holidays.add(holiday);
    }
  }
  return holidays;
}

function isBusinessDay(iso, holidays) {
  const wd = pythonWeekday(iso);
  return wd < 5 && !holidays.has(iso);
}

function calculateBusinessDays(startIso, endIso, holidays) {
  let count = 0;
  let current = startIso;
  while (current < endIso) {
    if (isBusinessDay(current, holidays)) count++;
    current = addDays(current, 1);
  }
  return count;
}

function addBusinessDays(startIso, days, holidays) {
  let current = startIso;
  let added = 0;
  while (added < days) {
    current = addDays(current, 1);
    if (isBusinessDay(current, holidays)) added++;
  }
  return current;
}

function calculateDueDate(checkoutDate, checkoutPeriodDays = CHECKOUT_PERIOD_DAYS) {
  const normalized = normalizeDateInput(checkoutDate);
  if (!normalized) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const [y, m, d] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(parsed.getTime())) return '';
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return '';
  const raw = addDays(normalized, checkoutPeriodDays);
  const holidays = allHolidaysForSpan(normalized, checkoutPeriodDays + 30);
  let due = raw;
  while (!isBusinessDay(due, holidays)) {
    due = addDays(due, 1);
  }
  return due;
}

function normalizePhone(phone) {
  const digits = String(phone == null ? '' : phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function formatPhone(phone) {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return text;
    return date.toISOString().slice(0, 10);
  }
  const dashMatch = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (dashMatch) {
    const [, year, month, day] = dashMatch.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return text;
    return date.toISOString().slice(0, 10);
  }
  return text;
}

function escapeLike(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

module.exports = {
  CHECKOUT_PERIOD_DAYS,
  EQUIPMENT_ID_PATTERN,
  federalHolidays,
  allHolidaysForSpan,
  isBusinessDay,
  calculateBusinessDays,
  addBusinessDays,
  calculateDueDate,
  normalizePhone,
  formatPhone,
  todayIso,
  normalizeDateInput,
  escapeLike,
};
