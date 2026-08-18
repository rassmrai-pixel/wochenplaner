const DEFAULT_TIMEZONE = 'Europe/Berlin';
const SLOTS_PER_DAY = 96;
const MAX_ATTENDEES = 10;
const DEFAULT_ORGANIZER_EMAIL = 'calendar@notify.webmines.de';

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uwynzmdsveplxfqgwzqp.supabase.co',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  };
}

function emailConfig() {
  const organizerEmail = process.env.CALENDAR_ORGANIZER_EMAIL || process.env.CALENDAR_FROM_EMAIL || DEFAULT_ORGANIZER_EMAIL;
  return {
    provider: 'resend-http',
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromEmail: organizerEmail,
    organizerName: process.env.CALENDAR_ORGANIZER_NAME || 'Wochenplaner',
    organizerEmail
  };
}

function missingEmailConfig(email) {
  const missing = [];
  if (!email.resendApiKey) missing.push('RESEND_API_KEY');
  if (!email.fromEmail) missing.push('CALENDAR_ORGANIZER_EMAIL oder CALENDAR_FROM_EMAIL');
  return missing;
}

function inviteErrorUserMessage(errorCode) {
  const messages = {
    MISSING_SENDER_EMAIL: 'Für den Versand fehlt eine Absender-E-Mail-Adresse.',
    AUTH_ERROR: 'Die Anmeldung konnte nicht geprüft werden.',
    SESSION_EXPIRED: 'Die Sitzung ist abgelaufen. Bitte erneut anmelden.',
    INVALID_RECIPIENT: 'Mindestens eine Teilnehmeradresse ist ungültig oder fehlt.',
    NETWORK_ERROR: 'Der Maildienst konnte nicht erreicht werden.',
    RESEND_ERROR: 'Der Mailanbieter hat die Einladung abgelehnt.',
    SERVER_ERROR: 'Der Server konnte die Einladung nicht senden.',
    RATE_LIMIT: 'Es wurden zu viele Einladungen in kurzer Zeit versendet.',
    UNKNOWN_ERROR: 'Die Kalendereinladung konnte nicht gesendet werden.'
  };
  return messages[errorCode] || messages.UNKNOWN_ERROR;
}

function retryableInviteError(errorCode) {
  return ['NETWORK_ERROR', 'RESEND_ERROR', 'SERVER_ERROR', 'UNKNOWN_ERROR'].includes(errorCode);
}

function codedError(message, statusCode, errorCode, extra = {}) {
  return Object.assign(new Error(message), {
    statusCode,
    errorCode,
    code: errorCode,
    userMessage: extra.userMessage || inviteErrorUserMessage(errorCode),
    technicalMessage: extra.technicalMessage || message,
    retryable: extra.retryable ?? retryableInviteError(errorCode),
    ...extra
  });
}

function classifyProviderError(status, body) {
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'RESEND_ERROR';
  const normalized = String(body || '').toLowerCase();
  if (status === 400 && /recipient|to|email|invalid/.test(normalized)) return 'INVALID_RECIPIENT';
  return 'RESEND_ERROR';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve({}); }
  }
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function compactUtcDateTime(value) {
  const date = value ? new Date(value) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getUTCFullYear()}${pad2(safe.getUTCMonth() + 1)}${pad2(safe.getUTCDate())}T${pad2(safe.getUTCHours())}${pad2(safe.getUTCMinutes())}${pad2(safe.getUTCSeconds())}Z`;
}

function addDaysToDateKey(dateKey, amount) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function compactDate(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return '19700101';
  return `${String(year).padStart(4, '0')}${pad2(month)}${pad2(day)}`;
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

function escapeIcsParam(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resendCalendarContentType(method) {
  return `text/calendar; charset=utf-8; method=${method}`;
}

function buildResendEmailPayload({ to, subject, text, html, ics, method, email }) {
  const filename = method === 'CANCEL' ? 'absage.ics' : 'einladung.ics';
  return {
    from: `${email.organizerName} <${email.fromEmail}>`,
    to,
    subject,
    text,
    html,
    attachments: [{
      filename,
      content: Buffer.from(ics, 'utf8').toString('base64'),
      contentType: resendCalendarContentType(method),
      content_type: resendCalendarContentType(method)
    }],
    headers: {
      'Content-Class': 'urn:content-classes:calendarmessage'
    }
  };
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

function stableUid(event, host) {
  const safeId = String(event.invitationUid || event.id || `event-${Date.now()}`).replace(/[^a-zA-Z0-9_.@-]/g, '-');
  if (safeId.includes('@')) return safeId;
  const domain = String(process.env.CALENDAR_INVITE_UID_DOMAIN || host || 'planner.local').replace(/[^a-zA-Z0-9.-]/g, '') || 'planner.local';
  return `${safeId}@${domain}`;
}

function validateAttendees(event) {
  const rawParticipants = Array.isArray(event.participants) ? event.participants : event.attendees;
  const attendees = Array.isArray(rawParticipants) ? rawParticipants : [];
  const seen = new Set();
  return attendees
    .map(att => ({
      ...att,
      email: normalizeEmail(att.email),
      name: String(att.name || '').trim(),
      status: att.status || att.invitationStatus || 'pending',
      invitationStatus: att.invitationStatus || att.status || 'pending'
    }))
    .filter(att => {
      if (!isValidEmail(att.email) || seen.has(att.email)) return false;
      seen.add(att.email);
      return true;
    })
    .slice(0, MAX_ATTENDEES);
}

function eventDateKey(event, weekKey) {
  return event.date || event.displayDate || dateForWeekDay(weekKey, event.day);
}

function isUnsupportedEvent(event) {
  return Boolean(
    event.allDay ||
    event.isExternal ||
    event.importSource === 'ics' ||
    event.provider === 'ics' ||
    event.rrule ||
    event.recurrenceId
  );
}

function buildInviteIcs({ event, weekKey, method, sequence, uid, message, organizerName, organizerEmail, host }) {
  const start = Number(event.start);
  const end = Number(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw codedError('Ungültige Terminzeit.', 400, 'INVALID_RECIPIENT');
  }
  const attendees = validateAttendees(event);
  if (!attendees.length) throw codedError('Keine gültigen Teilnehmer.', 400, 'INVALID_RECIPIENT');
  const dateKey = eventDateKey(event, weekKey);
  const summary = event.label || event.title || 'Termin';
  const description = [message, event.description].filter(Boolean).join('\n\n') || summary;
  const location = event.location || '';
  const dtstamp = compactUtcDateTime(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wochenplaner//Calendar Invitation//DE',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    `X-WR-CALNAME:${escapeIcsText('Wochenplaner')}`,
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
    'BEGIN:VEVENT',
    `UID:${uid || stableUid(event, host)}`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    `SUMMARY:${escapeIcsText(summary)}`,
    `DTSTART;TZID=${DEFAULT_TIMEZONE}:${compactLocalDateTime(dateKey, start)}`,
    `DTEND;TZID=${DEFAULT_TIMEZONE}:${compactLocalDateTime(dateKey, end)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `ORGANIZER;CN="${escapeIcsParam(organizerName)}":mailto:${normalizeEmail(organizerEmail)}`
  ];
  attendees.forEach(att => {
    const cn = escapeIcsParam(att.name || att.email);
    lines.push(`ATTENDEE;CN="${cn}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${att.email}`);
  });
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

async function requireUser(req, config) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!match) throw codedError('Nicht angemeldet.', 401, 'AUTH_ERROR');
  const endpoint = `${config.url.replace(/\/$/, '')}/auth/v1/user`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${match[1]}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const redactSensitive = value => String(value || '')
      .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
      .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, 'sb_[REDACTED]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
      .slice(0, 500);
    let responsePreview = '';
    try {
      const parsed = JSON.parse(responseText);
      responsePreview = redactSensitive(JSON.stringify({
        code: parsed?.code || null,
        error: parsed?.error || null,
        message: parsed?.message || parsed?.msg || parsed?.error_description || null
      }));
    } catch {
      responsePreview = redactSensitive(responseText);
    }
    const projectRef = (() => {
      try { return new URL(config.url).hostname.split('.')[0] || 'unknown'; }
      catch { return 'invalid-url'; }
    })();
    const keyType = config.key.startsWith('sb_secret_')
      ? 'secret'
      : (config.key.startsWith('sb_publishable_')
          ? 'publishable'
          : (config.key.split('.').length === 3 ? 'legacy-jwt' : 'unknown'));
    console.error('[CalendarInvite] Supabase user verification failed', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      responsePreview,
      projectRef,
      expectedProjectRef: 'uwynzmdsveplxfqgwzqp',
      matchesExpectedProject: projectRef === 'uwynzmdsveplxfqgwzqp',
      keyType
    });
    throw codedError('Sitzung konnte nicht geprüft werden.', 401, 'SESSION_EXPIRED');
  }
  return response.json();
}

async function loadPlannerState(userId, config) {
  const params = new URLSearchParams();
  params.set('select', 'data');
  params.set('user_id', `eq.${userId}`);
  params.set('limit', '1');
  const response = await fetch(`${config.url.replace(/\/$/, '')}/rest/v1/planner_state?${params.toString()}`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw codedError('Planner-State konnte nicht geladen werden.', 502, 'SERVER_ERROR');
  const rows = await response.json();
  const state = rows?.[0]?.data;
  if (!state) throw codedError('Planner-State nicht gefunden.', 404, 'UNKNOWN_ERROR');
  return state;
}

async function savePlannerState(userId, state, config) {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/rest/v1/planner_state?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ data: state, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw codedError('Einladungsstatus konnte nicht gespeichert werden.', 502, 'SERVER_ERROR');
}

function findEventRecord(state, eventId, preferredWeekKey) {
  const buckets = [];
  if (preferredWeekKey && Array.isArray(state.weekEventsByWeek?.[preferredWeekKey])) buckets.push([preferredWeekKey, state.weekEventsByWeek[preferredWeekKey]]);
  Object.entries(state.weekEventsByWeek || {}).forEach(([weekKey, events]) => {
    if (weekKey !== preferredWeekKey && Array.isArray(events)) buckets.push([weekKey, events]);
  });
  for (const [weekKey, events] of buckets) {
    const index = events.findIndex(event => event.id === eventId);
    if (index >= 0) return { weekKey, events, index, event: events[index] };
  }
  return null;
}

async function sendViaResend({ to, subject, text, html, ics, method, email }) {
  const missing = missingEmailConfig(email);
  if (missing.length) {
    const missingSender = missing.some(item => /CALENDAR_(ORGANIZER|FROM)_EMAIL/i.test(item));
    throw codedError(`Mailversand ist serverseitig nicht konfiguriert. Fehlende Environment Variables: ${missing.join(', ')}.`, 500, missingSender ? 'MISSING_SENDER_EMAIL' : 'SERVER_ERROR', {
      missingConfig: missing,
      provider: 'resend-http',
      retryable: !missingSender
    });
  }

  const payload = buildResendEmailPayload({ to, subject, text, html, ics, method, email });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${email.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.text().catch(() => '');
  if (!response.ok) {
    const errorCode = classifyProviderError(response.status, body);
    throw codedError(`Mailanbieter hat den Versand abgelehnt (${response.status}).`, response.status === 429 ? 429 : 502, errorCode, {
      providerBody: body.slice(0, 300),
      technicalMessage: body.slice(0, 500) || `Resend HTTP ${response.status}`,
      retryable: errorCode !== 'RATE_LIMIT' && errorCode !== 'INVALID_RECIPIENT'
    });
  }
}


async function sendCalendarInvitationHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const method = String(body.method || 'REQUEST').toUpperCase();
    if (!['REQUEST', 'CANCEL'].includes(method)) throw codedError('Ungültige Einladungsaktion.', 400, 'INVALID_RECIPIENT');
    const eventId = String(body.eventId || '').trim();
    const weekKey = String(body.weekKey || '').trim();
    if (!eventId) throw codedError('Termin fehlt.', 400, 'INVALID_RECIPIENT');

    const config = supabaseConfig();
    if (!config.url || !config.key) throw codedError('Supabase ist serverseitig nicht konfiguriert.', 500, 'SERVER_ERROR');

    const user = await requireUser(req, config);
    const state = await loadPlannerState(user.id, config);
    const record = findEventRecord(state, eventId, weekKey);
    if (!record) throw codedError('Termin nicht gefunden.', 404, 'UNKNOWN_ERROR');
    const event = record.event;
    if (isUnsupportedEvent(event)) throw codedError('Einladungen sind für eigene Termine mit Uhrzeit verfügbar.', 400, 'INVALID_RECIPIENT');
    const attendees = validateAttendees(event);
    if (!attendees.length) throw codedError('Keine gültigen Teilnehmer.', 400, 'INVALID_RECIPIENT');
    if ((Array.isArray(event.participants || event.attendees) ? (event.participants || event.attendees).length : 0) > MAX_ATTENDEES) throw codedError(`Maximal ${MAX_ATTENDEES} Teilnehmer pro Termin.`, 400, 'INVALID_RECIPIENT');

    event.participants = attendees.map(att => ({ ...att }));
    event.attendees = attendees.map(att => ({ ...att }));
    const email = emailConfig();
    const now = new Date().toISOString();
    const previousSequence = Number(event.invitationSequence || 0);
    const sequence = method === 'CANCEL' || event.invitationSentAt || event.invitationUpdatedAt ? previousSequence + 1 : previousSequence;
    const fromDomain = normalizeEmail(email.fromEmail).split('@')[1] || req.headers.host;
    const hasSentInvitation = Boolean(event.invitationSentAt || event.invitationUpdatedAt);
    const invitationUid = hasSentInvitation && event.invitationUid ? event.invitationUid : stableUid(event, fromDomain);
    const message = String(body.message || event.inviteMessage || '').trim();
    event.inviteMessage = message;
    event.invitationUid = invitationUid;
    event.invitationSequence = sequence;
    event.organizerEmail = email.fromEmail;
    event.organizerName = email.organizerName;

    const ics = buildInviteIcs({
      event,
      weekKey: record.weekKey,
      method,
      sequence,
      uid: invitationUid,
      message,
      organizerName: email.organizerName,
      organizerEmail: email.fromEmail,
      host: req.headers.host
    });
    const title = event.label || event.title || 'Termin';
    const subject = method === 'CANCEL' ? `Absage: ${title}` : `Einladung: ${title}`;
    const text = method === 'CANCEL'
      ? `Der Termin "${title}" wurde abgesagt.\n\nDiese Nachricht wurde aus dem Wochenplaner gesendet.`
      : `Du wurdest zum Termin "${title}" eingeladen.\n\nDiese Nachricht wurde aus dem Wochenplaner gesendet.`;
    const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

    await sendViaResend({
      to: attendees.map(att => att.email),
      subject,
      text,
      html,
      ics,
      method,
      email
    });

    event.invitationStatus = 'sent';
    event.invitationSentAt = method === 'CANCEL' ? event.invitationSentAt : (event.invitationSentAt || now);
    event.invitationUpdatedAt = now;
    event.invitationError = null;
    event.attendees = attendees.map(att => ({
      ...att,
      status: method === 'CANCEL' ? 'cancelled' : 'sent',
      invitationStatus: method === 'CANCEL' ? 'cancelled' : 'sent',
      invitationError: null,
      invitationSentAt: now
    }));
    event.participants = event.attendees.map(att => ({ ...att }));
    record.events[record.index] = event;
    await savePlannerState(user.id, state, config);

    return json(res, 200, {
      ok: true,
      method,
      invitationUid,
      sequence,
      organizerEmail: event.organizerEmail,
      organizerName: event.organizerName,
      status: event.invitationStatus
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[CalendarInvite] failed', { status, message: error.message, code: error.code, providerBody: error.providerBody });
    const errorCode = error.errorCode || error.code || (status === 401 ? 'SESSION_EXPIRED' : (status === 429 ? 'RATE_LIMIT' : (status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN_ERROR')));
    return json(res, status, {
      error: error.userMessage || inviteErrorUserMessage(errorCode),
      errorCode,
      userMessage: error.userMessage || inviteErrorUserMessage(errorCode),
      technicalMessage: error.technicalMessage || error.message || String(error),
      retryable: error.retryable ?? retryableInviteError(errorCode),
      provider: error.provider || (error.providerBody ? 'resend-http' : undefined),
      missingConfig: error.missingConfig || undefined
    });
  }
}

module.exports = sendCalendarInvitationHandler;
module.exports._test = {
  buildInviteIcs,
  validateAttendees,
  findEventRecord,
  isUnsupportedEvent,
  missingEmailConfig,
  escapeIcsText,
  escapeHtml,
  foldLine,
  resendCalendarContentType,
  buildResendEmailPayload
};
