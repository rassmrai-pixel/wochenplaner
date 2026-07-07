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










function statsForItems(items, type) {
  const filtered = type ? items.filter(item => item.type === type) : items;
  const total = filtered.reduce((sum, item) => sum + (Number.isFinite(item.totalWeight) ? item.totalWeight : 1), 0);
  const done = filtered.reduce((sum, item) => {
    const weight = Number.isFinite(item.totalWeight) ? item.totalWeight : 1;
    if (Number.isFinite(item.doneWeight)) return sum + item.doneWeight;
    if (Number.isFinite(item.score)) return sum + Math.max(0, Math.min(1, item.score)) * weight;
    return sum + (item.done ? 1 : 0);
  }, 0);
  return { total, done, percent: makePercent(done, total) };
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
