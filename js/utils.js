function clone(x) { return JSON.parse(JSON.stringify(x)); }

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min)); }

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch])); }

function makePercent(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

function progressColorClass(percent, total) {
  if (!total) return '';
  if (percent >= 100) return 'progress-darkgreen';
  if (percent >= 75) return 'progress-lightgreen';
  if (percent >= 50) return 'progress-yellow';
  if (percent >= 25) return 'progress-orange';
  return 'progress-red';
}

function subtaskStats(todo) {
  const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : [];
  const total = subtasks.length;
  const done = subtasks.filter(sub => sub.done).length;
  return { total, done, percent: makePercent(done, total) };
}

function eventSubtaskStats(ev) {
  const subtasks = Array.isArray(ev?.subtasks) ? ev.subtasks : [];
  const total = subtasks.length;
  const done = subtasks.filter(sub => sub.done).length;
  return { total, done, percent: makePercent(done, total) };
}

function profileInitials(value) {
  const raw = String(value || '').trim();
  if (!raw) return '?';
  const beforeAt = raw.split('@')[0] || raw;
  const parts = beforeAt.split(/[._\-\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return beforeAt.slice(0, 2).toUpperCase();
}

function normalizeHexColor(value, fallback = '#22c55e') {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return fallback;
}

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

function statsForItems(items, type) {
  const filtered = type ? items.filter(item => item.type === type) : items;
  const done = filtered.filter(item => item.done).length;
  return { total: filtered.length, done, percent: makePercent(done, filtered.length) };
}

function heatLevel(percent, total) {
  if (!total) return 'empty';
  if (percent >= 90) return 'level-4';
  if (percent >= 70) return 'level-3';
  if (percent >= 45) return 'level-2';
  if (percent > 0) return 'level-1';
  return 'level-0';
}

function bestStreakFromBuckets(buckets, threshold = 80) {
  let best = 0;
  let current = 0;
  buckets.forEach(bucket => {
    if (bucket.total.total > 0 && bucket.total.percent >= threshold) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  });
  return best;
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

