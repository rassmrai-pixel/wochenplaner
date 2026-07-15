const tls = require('tls');

const DEFAULT_TIMEZONE = 'Europe/Berlin';
const SLOTS_PER_DAY = 96;
const MAX_ATTENDEES = 10;

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
  return {
    provider: 'resend-smtp',
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.CALENDAR_FROM_EMAIL || '',
    organizerName: process.env.CALENDAR_ORGANIZER_NAME || 'Wochenplaner',
    organizerEmail: process.env.CALENDAR_FROM_EMAIL || '',
    smtpHost: process.env.CALENDAR_SMTP_HOST || 'smtp.resend.com',
    smtpPort: Number(process.env.CALENDAR_SMTP_PORT || 465),
    smtpUser: process.env.CALENDAR_SMTP_USER || 'resend'
  };
}

function missingEmailConfig(email) {
  const missing = [];
  if (!email.resendApiKey) missing.push('RESEND_API_KEY');
  if (!email.fromEmail) missing.push('CALENDAR_FROM_EMAIL');
  return missing;
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

function stripHeaderValue(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function formatMailbox(name, email) {
  const safeEmail = normalizeEmail(email);
  const safeName = stripHeaderValue(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return safeName ? `"${safeName}" <${safeEmail}>` : safeEmail;
}

function encodeMimeWord(value) {
  const text = stripHeaderValue(value);
  if (!/[^\x20-\x7E]/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function base64Mime(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, '$&\r\n')
    .trimEnd();
}

function dotStuff(message) {
  return String(message).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        socket.off('data', onData);
        socket.off('error', onError);
        resolve({ code: Number(last.slice(0, 3)), message: buffer });
      }
    };
    const onError = error => {
      socket.off('data', onData);
      reject(error);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function smtpCommand(socket, command, expected) {
  if (command) socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  const expectedCodes = Array.isArray(expected) ? expected : [expected];
  if (!expectedCodes.includes(response.code)) {
    throw Object.assign(new Error(`SMTP-Antwort unerwartet (${response.code}).`), { statusCode: 502, providerBody: response.message.slice(0, 300) });
  }
  return response;
}

function buildCalendarMimeMessage({ to, subject, text, html, ics, method, email }) {
  const alternativeBoundary = `alt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const from = formatMailbox(email.organizerName, email.fromEmail);
  const messageIdDomain = normalizeEmail(email.fromEmail).split('@')[1] || 'wochenplaner.local';
  const encodedSubject = encodeMimeWord(subject);
  const headerLines = [
    `From: ${from}`,
    `To: ${to.map(addr => formatMailbox('', addr)).join(', ')}`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@${messageIdDomain}>`,
    'MIME-Version: 1.0',
    'Content-Class: urn:content-classes:calendarmessage',
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`
  ];

  const calendarContentType = `text/calendar; method=${method}; charset=UTF-8`;
  const parts = [
    ...headerLines,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Mime(text),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Mime(html),
    `--${alternativeBoundary}`,
    `Content-Type: ${calendarContentType}`,
    'Content-Class: urn:content-classes:calendarmessage',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: inline',
    '',
    base64Mime(ics),
    `--${alternativeBoundary}--`,
    ''
  ];
  return parts.join('\r\n');
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
    throw Object.assign(new Error('Ungültige Terminzeit.'), { statusCode: 400 });
  }
  const attendees = validateAttendees(event);
  if (!attendees.length) throw Object.assign(new Error('Keine gültigen Teilnehmer.'), { statusCode: 400 });
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
  if (!match) throw Object.assign(new Error('Nicht angemeldet.'), { statusCode: 401 });
  const response = await fetch(`${config.url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${match[1]}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw Object.assign(new Error('Sitzung konnte nicht geprüft werden.'), { statusCode: 401 });
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
  if (!response.ok) throw Object.assign(new Error('Planner-State konnte nicht geladen werden.'), { statusCode: 502 });
  const rows = await response.json();
  const state = rows?.[0]?.data;
  if (!state) throw Object.assign(new Error('Planner-State nicht gefunden.'), { statusCode: 404 });
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
  if (!response.ok) throw Object.assign(new Error('Einladungsstatus konnte nicht gespeichert werden.'), { statusCode: 502 });
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
    throw Object.assign(new Error(`Mailversand ist serverseitig nicht konfiguriert. Fehlende Environment Variables: ${missing.join(', ')}.`), {
      statusCode: 500,
      code: 'MAIL_CONFIG_MISSING',
      missingConfig: missing
    });
  }

  const message = buildCalendarMimeMessage({ to, subject, text, html, ics, method, email });
  const socket = tls.connect({
    host: email.smtpHost,
    port: email.smtpPort,
    servername: email.smtpHost,
    timeout: 15000
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
      socket.once('timeout', () => reject(new Error('SMTP-Verbindung hat zu lange gedauert.')));
    });
    await smtpCommand(socket, null, 220);
    await smtpCommand(socket, `EHLO ${email.smtpHost}`, 250);
    await smtpCommand(socket, 'AUTH LOGIN', 334);
    await smtpCommand(socket, Buffer.from(email.smtpUser, 'utf8').toString('base64'), 334);
    await smtpCommand(socket, Buffer.from(email.resendApiKey, 'utf8').toString('base64'), 235);
    await smtpCommand(socket, `MAIL FROM:<${normalizeEmail(email.fromEmail)}>`, 250);
    for (const recipient of to) {
      await smtpCommand(socket, `RCPT TO:<${normalizeEmail(recipient)}>`, [250, 251]);
    }
    await smtpCommand(socket, 'DATA', 354);
    socket.write(`${dotStuff(message)}\r\n.\r\n`);
    await smtpCommand(socket, null, 250);
    await smtpCommand(socket, 'QUIT', 221);
  } catch (error) {
    throw Object.assign(new Error(error.message || 'Mailanbieter hat den Versand abgelehnt.'), {
      statusCode: error.statusCode || 502,
      providerBody: error.providerBody
    });
  } finally {
    socket.destroy();
  }
}

async function sendCalendarInvitationHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }
  const config = supabaseConfig();
  if (!config.url || !config.key) return json(res, 500, { error: 'Supabase ist serverseitig nicht konfiguriert.' });

  try {
    const body = await readJsonBody(req);
    const method = String(body.method || 'REQUEST').toUpperCase();
    if (!['REQUEST', 'CANCEL'].includes(method)) throw Object.assign(new Error('Ungültige Einladungsaktion.'), { statusCode: 400 });
    const eventId = String(body.eventId || '').trim();
    const weekKey = String(body.weekKey || '').trim();
    if (!eventId) throw Object.assign(new Error('Termin fehlt.'), { statusCode: 400 });

    const user = await requireUser(req, config);
    const state = await loadPlannerState(user.id, config);
    const record = findEventRecord(state, eventId, weekKey);
    if (!record) throw Object.assign(new Error('Termin nicht gefunden.'), { statusCode: 404 });
    const event = record.event;
    if (isUnsupportedEvent(event)) throw Object.assign(new Error('Einladungen sind für eigene Termine mit Uhrzeit verfügbar.'), { statusCode: 400 });
    const attendees = validateAttendees(event);
    if (!attendees.length) throw Object.assign(new Error('Keine gültigen Teilnehmer.'), { statusCode: 400 });
    if ((Array.isArray(event.participants || event.attendees) ? (event.participants || event.attendees).length : 0) > MAX_ATTENDEES) throw Object.assign(new Error(`Maximal ${MAX_ATTENDEES} Teilnehmer pro Termin.`), { statusCode: 400 });

    event.participants = attendees.map(att => ({ ...att }));
    event.attendees = attendees.map(att => ({ ...att }));
    const email = emailConfig();
    const now = new Date().toISOString();
    const previousSequence = Number(event.invitationSequence || 0);
    const sequence = method === 'CANCEL' || event.invitationSentAt || event.invitationUpdatedAt ? previousSequence + 1 : previousSequence;
    const invitationUid = event.invitationUid || stableUid(event, req.headers.host);
    const message = String(body.message || event.inviteMessage || '').trim();
    event.inviteMessage = message;
    event.invitationUid = invitationUid;
    event.invitationSequence = sequence;

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

    event.invitationStatus = method === 'CANCEL' ? 'cancelled' : (event.invitationSentAt ? 'updated' : 'sent');
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
      status: event.invitationStatus
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[CalendarInvite] failed', { status, message: error.message, code: error.code, providerBody: error.providerBody });
    const payload = { error: status >= 500 ? (error.message || 'Einladung konnte nicht gesendet werden.') : error.message };
    if (error.code === 'MAIL_CONFIG_MISSING') {
      payload.code = error.code;
      payload.provider = 'resend-smtp';
      payload.missingConfig = error.missingConfig || [];
    }
    return json(res, status, payload);
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
  buildCalendarMimeMessage
};
