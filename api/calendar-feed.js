const DEFAULT_TIMEZONE = 'Europe/Berlin';
const SLOTS_PER_DAY = 96;
const DEFAULT_FEED_SETTINGS = {
  enabled: false,
  token: null,
  exportRoutines: true,
  exportTimedTodos: true,
  exportAllDayTodos: true,
  includeCompleted: true,
  exportSpecialEvents: true
};

function jsonError(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: message }));
}

function normalizeToken(value) {
  const token = String(value || '').trim();
  return token.length >= 32 ? token : '';
}

function getQueryToken(req) {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '', `https://${host}`);
    return normalizeToken(url.searchParams.get('token'));
  } catch {
    return '';
  }
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uwynzmdsveplxfqgwzqp.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return {
    url,
    key,
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasLegacyServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
    hasExplicitUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  };
}

function tokenPreview(token) {
  const value = String(token || '');
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '';
}

async function loadStateByFeedToken(token) {
  const config = supabaseConfig();
  const { url, key } = config;
  if (!url || !key) {
    console.error('[CalendarFeed] Supabase config missing', {
      hasUrl: Boolean(url),
      hasExplicitUrl: config.hasExplicitUrl,
      hasServiceRoleKey: config.hasServiceRoleKey,
      hasLegacyServiceKey: config.hasLegacyServiceKey
    });
    throw Object.assign(new Error('Calendar feed is not configured'), { statusCode: 500 });
  }

  console.info('[CalendarFeed] Resolving token', {
    token: tokenPreview(token),
    hasExplicitUrl: config.hasExplicitUrl,
    keyType: key.startsWith('sb_secret_') ? 'secret' : 'legacy-or-other'
  });

  const params = new URLSearchParams();
  params.set('select', 'user_id,data');
  params.set('data->calendarFeed->>token', `eq.${token}`);
  params.set('limit', '1');

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/planner_state?${params.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[CalendarFeed] Supabase query failed', {
      status: response.status,
      statusText: response.statusText,
      bodyPreview: body.slice(0, 300)
    });
    throw Object.assign(new Error('Could not load calendar feed'), { statusCode: 502 });
  }

  const rows = await response.json();
  const state = rows?.[0]?.data || null;
  const feed = normalizeFeedSettings(state?.calendarFeed);
  if (!state || feed.token !== token) {
    console.warn('[CalendarFeed] Token not found', { token: tokenPreview(token), rows: Array.isArray(rows) ? rows.length : null });
    throw Object.assign(new Error('Invalid calendar token'), { statusCode: 404 });
  }
  if (!feed.enabled) {
    console.warn('[CalendarFeed] Feed disabled', { token: tokenPreview(token) });
    throw Object.assign(new Error('Calendar feed is disabled'), { statusCode: 403 });
  }
  console.info('[CalendarFeed] Token resolved', { token: tokenPreview(token) });
  return { state, feed };
}

function normalizeFeedSettings(input) {
  const feed = { ...DEFAULT_FEED_SETTINGS, ...(input && typeof input === 'object' ? input : {}) };
  feed.enabled = Boolean(feed.enabled);
  feed.token = normalizeToken(feed.token) || null;
  feed.exportRoutines = feed.exportRoutines !== false;
  feed.exportTimedTodos = feed.exportTimedTodos !== false;
  feed.exportAllDayTodos = true;
  feed.includeCompleted = feed.includeCompleted !== false;
  feed.exportSpecialEvents = feed.exportSpecialEvents !== false;
  return feed;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function dateKeyToUtcDate(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) return new Date();
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addDaysToDateKey(dateKey, amount) {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function compactDate(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) return '19700101';
  return `${String(parts.year).padStart(4, '0')}${pad2(parts.month)}${pad2(parts.day)}`;
}

function slotToTime(slot) {
  const clamped = Math.max(0, Math.min(SLOTS_PER_DAY, Number(slot) || 0));
  const minutes = clamped * 15;
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

function compactLocalDateTime(dateKey, slot) {
  const time = slotToTime(slot);
  return `${compactDate(dateKey)}T${pad2(time.hour)}${pad2(time.minute)}00`;
}

function compactUtcDateTime(value) {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getUTCFullYear()}${pad2(safe.getUTCMonth() + 1)}${pad2(safe.getUTCDate())}T${pad2(safe.getUTCHours())}${pad2(safe.getUTCMinutes())}${pad2(safe.getUTCSeconds())}Z`;
}

function weekStartDateKey(dateKey) {
  const date = dateKeyToUtcDate(dateKey);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dateForWeekDay(weekKey, dayIndex) {
  return addDaysToDateKey(weekKey, Math.max(0, Math.min(6, Number(dayIndex) || 0)));
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldLine(line) {
  const chars = Array.from(String(line));
  const lines = [];
  let current = '';
  chars.forEach(char => {
    if (Buffer.byteLength(current + char, 'utf8') > 73) {
      lines.push(current);
      current = ` ${char}`;
    } else {
      current += char;
    }
  });
  lines.push(current);
  return lines.join('\r\n');
}

function isIntegratedChild(ev) {
  return Boolean(ev?.stackedIntoId || ev?.parentId);
}

function isImportedExternalEvent(ev) {
  return Boolean(
    ev?.importSource === 'ics' ||
    ev?.provider === 'ics' ||
    ev?.importedFromIcs ||
    ev?.isExternal ||
    ev?.externalId ||
    ev?.externalCalendarId
  );
}

function isDone(ev) {
  return Boolean(ev?.completed || ev?.done || ev?.missed);
}

function stableUid(id, domain) {
  const safeId = String(id || `event-${Date.now()}`).replace(/[^a-zA-Z0-9_.@-]/g, '-');
  if (safeId.includes('@')) return safeId;
  return `${safeId}@${domain}`;
}

function eventCalendarUid(ev, domain) {
  return ev?.invitationUid || ev?.calendarUid || stableUid(ev?.id, domain);
}

function shouldExportEvent(ev, feed, timedTodoEventIds) {
  if (!ev || isImportedExternalEvent(ev)) return false;
  if (!feed.includeCompleted && isDone(ev)) return false;
  if (ev.source === 'routine' && feed.exportRoutines === false) return false;
  if (timedTodoEventIds.has(ev.id) && feed.exportTimedTodos === false) return false;
  return true;
}

function eventDateKey(ev, weekKey) {
  return ev.date || ev.displayDate || dateForWeekDay(weekKey, ev.day);
}

function veventForPlannerEvent(ev, weekKey, feed, timedTodoEventIds, domain) {
  if (!shouldExportEvent(ev, feed, timedTodoEventIds)) return [];
  if (isIntegratedChild(ev)) return [];

  const dateKey = eventDateKey(ev, weekKey);
  const updated = ev.updatedAt || ev.lastModified || ev.dtstamp || ev.createdAt || new Date().toISOString();
  const lines = [
    'BEGIN:VEVENT',
    `UID:${eventCalendarUid(ev, domain)}`,
    `DTSTAMP:${compactUtcDateTime(updated)}`,
    `LAST-MODIFIED:${compactUtcDateTime(updated)}`,
    `SUMMARY:${escapeIcsText(ev.title || ev.label || 'Termin')}`
  ];

  if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
  if (ev.completed || ev.done) lines.push('STATUS:COMPLETED');

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(dateKey)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDaysToDateKey(dateKey, 1))}`);
  } else {
    const start = Number(ev.start);
    const end = Number(ev.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const endDateKey = end > start ? dateKey : addDaysToDateKey(dateKey, 1);
    lines.push(`DTSTART;TZID=${DEFAULT_TIMEZONE}:${compactLocalDateTime(dateKey, start)}`);
    lines.push(`DTEND;TZID=${DEFAULT_TIMEZONE}:${compactLocalDateTime(endDateKey, end)}`);
  }

  lines.push('END:VEVENT');
  return lines;
}

function veventForAllDayTodo(todo, feed, domain) {
  if (!feed.exportAllDayTodos) return [];
  if (!feed.includeCompleted && (todo.done || todo.status === 'done')) return [];
  if (!todo.plannedWeekStart || todo.plannedDay === null || todo.plannedDay === undefined || todo.plannedEventId) return [];
  const dateKey = dateForWeekDay(todo.plannedWeekStart, todo.plannedDay);
  const updated = todo.updatedAt || todo.createdAt || new Date().toISOString();
  return [
    'BEGIN:VEVENT',
    `UID:${stableUid(`todo-${todo.id}`, domain)}`,
    `DTSTAMP:${compactUtcDateTime(updated)}`,
    `LAST-MODIFIED:${compactUtcDateTime(updated)}`,
    `SUMMARY:${escapeIcsText(todo.text || 'To-do')}`,
    `DTSTART;VALUE=DATE:${compactDate(dateKey)}`,
    `DTEND;VALUE=DATE:${compactDate(addDaysToDateKey(dateKey, 1))}`,
    todo.done || todo.status === 'done' ? 'STATUS:COMPLETED' : null,
    'END:VEVENT'
  ].filter(Boolean);
}

function specialEventTypeLabel(type) {
  return {
    birthday: 'Geburtstag',
    anniversary: 'Jahrestag',
    jubilee: 'Jubiläum',
    reminder: 'Erinnerung',
    other: 'Sonstiges'
  }[type] || 'Ereignis';
}

function specialEventOccurrenceDate(event, year) {
  const parts = parseDateKey(event?.date);
  if (!parts) return null;
  const occurrenceYear = event.repeatsYearly === false ? parts.year : year;
  return `${occurrenceYear}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function veventForSpecialEvent(event, occurrenceDate, domain) {
  const updated = event.updatedAt || event.createdAt || new Date().toISOString();
  const title = event.title || specialEventTypeLabel(event.type);
  const summary = `☝🏼 ${title}`;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${stableUid(`special-${event.id}-${occurrenceDate}`, domain)}`,
    `DTSTAMP:${compactUtcDateTime(updated)}`,
    `LAST-MODIFIED:${compactUtcDateTime(updated)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `CATEGORIES:${escapeIcsText(specialEventTypeLabel(event.type))}`,
    `DTSTART;VALUE=DATE:${compactDate(occurrenceDate)}`,
    `DTEND;VALUE=DATE:${compactDate(addDaysToDateKey(occurrenceDate, 1))}`
  ];
  if (event.note) lines.push(`DESCRIPTION:${escapeIcsText(event.note)}`);
  lines.push('END:VEVENT');
  return lines;
}

function specialEventLines(state, feed, domain) {
  if (!feed.exportSpecialEvents) return [];
  const events = Array.isArray(state.specialEvents) ? state.specialEvents : [];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];
  const lines = [];
  events.forEach(event => {
    years.forEach(year => {
      const occurrenceDate = specialEventOccurrenceDate(event, year);
      if (!occurrenceDate) return;
      lines.push(...veventForSpecialEvent(event, occurrenceDate, domain));
    });
  });
  return lines;
}

function calendarDomain(req) {
  return process.env.CALENDAR_FEED_UID_DOMAIN || req.headers.host || 'planner.local';
}

function buildIcs(state, feed, req) {
  const domain = calendarDomain(req);
  const timedTodoEventIds = new Set((state.todos || []).map(todo => todo.plannedEventId).filter(Boolean));
  const eventLines = [];

  Object.entries(state.weekEventsByWeek || {}).forEach(([weekKey, events]) => {
    (Array.isArray(events) ? events : []).forEach(ev => {
      eventLines.push(...veventForPlannerEvent(ev, weekKey, feed, timedTodoEventIds, domain));
    });
  });

  (state.todos || []).forEach(todo => {
    eventLines.push(...veventForAllDayTodo(todo, feed, domain));
  });

  eventLines.push(...specialEventLines(state, feed, domain));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Perfekte Woche Planer//Calendar Feed//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Wochenplaner',
    `X-WR-TIMEZONE:${DEFAULT_TIMEZONE}`,
    'BEGIN:VTIMEZONE',
    `TZID:${DEFAULT_TIMEZONE}`,
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...eventLines,
    'END:VCALENDAR'
  ];

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

async function calendarFeedHandler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return jsonError(res, 405, 'Method not allowed');
  }

  const token = getQueryToken(req);
  if (!token) return jsonError(res, 401, 'Missing or invalid calendar token');

  try {
    const { state, feed } = await loadStateByFeedToken(token);
    const ics = buildIcs(state, feed, req);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="wochenplaner.ics"');
    res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    if (req.method === 'HEAD') return res.end();
    return res.end(ics);
  } catch (error) {
    return jsonError(res, error.statusCode || 500, error.statusCode ? error.message : 'Calendar feed failed');
  }
}

module.exports = calendarFeedHandler;
module.exports._test = {
  buildIcs,
  normalizeFeedSettings,
  shouldExportEvent,
  veventForPlannerEvent,
  veventForAllDayTodo,
  specialEventLines,
  escapeIcsText,
  foldLine
};
