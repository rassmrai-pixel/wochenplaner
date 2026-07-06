function toLocalDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value === 'string') {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  return new Date();
}

function dateKey(date) {
  const d = toLocalDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date, daysToAdd) {
  const d = toLocalDate(date);
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

function weekStartDate(date) {
  const d = toLocalDate(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function weekStartKey(date) { return dateKey(weekStartDate(date)); }

function formatShortDate(date) {
  return toLocalDate(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function formatLongDate(date) {
  return toLocalDate(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getISOWeekInfo(date) {
  const d = toLocalDate(date);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

function eachDateInRange(start, end) {
  const out = [];
  let d = toLocalDate(start);
  const last = toLocalDate(end);
  while (d <= last) {
    out.push(toLocalDate(d));
    d = addDays(d, 1);
  }
  return out;
}

function dateKeyToLocalDate(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function dayIndexInWeek(dateKeyValue, weekKeyValue) {
  const eventDate = dateKeyToLocalDate(dateKeyValue);
  const weekDate = dateKeyToLocalDate(weekKeyValue);
  return Math.round((eventDate - weekDate) / (24 * 60 * 60 * 1000));
}

