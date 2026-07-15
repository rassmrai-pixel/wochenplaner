const ICS_SYNC_TIMEOUT_MS = 60000;
const ICS_PAST_DAYS = 1;
const ICS_FUTURE_MONTHS = 24;
const ICS_MAX_OCCURRENCES_PER_SERIES = 5000;
const DEFAULT_ICS_SOURCE_ID = "default-ics";
const ICS_SYNC_DEBUG_TEST_TITLE = "ICS SYNC TEST 001";

const WINDOWS_TIMEZONE_MAP = {
  "W. Europe Standard Time": "Europe/Berlin"
};

const WEEKDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const WEEKDAY_NAMES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfoldIcsLines(icsText) {
  return String(icsText || "").replace(/\r?\n[ \t]/g, "");
}

function countByReason(skippedEvents) {
  return skippedEvents.reduce((summary, item) => {
    summary[item.reason] = (summary[item.reason] || 0) + 1;
    return summary;
  }, {});
}

function decodeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsProperty(line) {
  const colonIndex = String(line || "").indexOf(":");
  if (colonIndex < 0) return null;
  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const parts = left.split(";");
  const name = String(parts.shift() || "").trim().toUpperCase();
  const params = {};
  parts.forEach(part => {
    const eqIndex = part.indexOf("=");
    if (eqIndex < 0) {
      params[part.trim().toUpperCase()] = true;
      return;
    }
    const key = part.slice(0, eqIndex).trim().toUpperCase();
    const raw = part.slice(eqIndex + 1).trim();
    params[key] = raw.replace(/^"|"$/g, "");
  });
  return { name, params, value: value.trim(), raw: line };
}

function mailtoValue(value) {
  return String(value || "").replace(/^mailto:/i, "").trim().toLowerCase();
}

function parseIcsPersonProperty(property) {
  if (!property) return null;
  const email = mailtoValue(property.value);
  if (!email) return null;
  return {
    email,
    name: decodeIcsText(property.params?.CN || email),
    role: property.params?.ROLE || null,
    partstat: property.params?.PARTSTAT || null,
    rsvp: property.params?.RSVP || null
  };
}

function extractVEvents(icsText) {
  const unfolded = unfoldIcsLines(icsText);
  return unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
}

function parseEventBlock(block, index) {
  const properties = {};
  String(block || "").split(/\r?\n/).forEach(line => {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed === "BEGIN:VEVENT" || trimmed === "END:VEVENT") return;
    const property = parseIcsProperty(trimmed);
    if (!property?.name) return;
    if (!properties[property.name]) properties[property.name] = [];
    properties[property.name].push(property);
  });

  const first = name => properties[name]?.[0] || null;
  const values = name => properties[name] || [];
  const uid = first("UID")?.value || `event_${index}`;
  const organizer = parseIcsPersonProperty(first("ORGANIZER"));
  const attendees = values("ATTENDEE").map(parseIcsPersonProperty).filter(Boolean);
  return {
    index,
    raw: block,
    properties,
    uid,
    summary: decodeIcsText(first("SUMMARY")?.value || "Ohne Titel"),
    description: decodeIcsText(first("DESCRIPTION")?.value || ""),
    location: decodeIcsText(first("LOCATION")?.value || ""),
    organizer,
    organizerEmail: organizer?.email || null,
    organizerName: organizer?.name || null,
    attendees,
    status: String(first("STATUS")?.value || "").toUpperCase(),
    dtStart: first("DTSTART"),
    dtEnd: first("DTEND"),
    duration: first("DURATION")?.value || "",
    rrule: first("RRULE")?.value || "",
    rdates: values("RDATE"),
    exdates: values("EXDATE"),
    recurrenceId: first("RECURRENCE-ID"),
    sequence: first("SEQUENCE")?.value || "",
    dtstamp: first("DTSTAMP")?.value || "",
    lastModified: first("LAST-MODIFIED")?.value || "",
    className: first("CLASS")?.value || "",
    transp: first("TRANSP")?.value || "",
    allDayFlag: /^TRUE$/i.test(first("X-MICROSOFT-CDO-ALLDAYEVENT")?.value || ""),
    microsoftInstanceType: first("X-MICROSOFT-CDO-INSTTYPE")?.value || ""
  };
}

function normalizeTimezone(tzid) {
  return WINDOWS_TIMEZONE_MAP[tzid] || tzid || null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseDateOnlyValue(value) {
  const match = String(value || "").trim().match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    type: "date-only",
    isDateOnly: true,
    isDate: true,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: 0,
    minute: 0,
    second: 0,
    timezone: null,
    raw: String(value || "").trim()
  };
}

function dateKeyFromParts(parts) {
  return `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function formatDateOnly(dateOnly) {
  return dateKeyFromParts(dateOnly);
}

function addDaysToDateOnly(dateOnly, amount) {
  let year = Number(dateOnly.year);
  let month = Number(dateOnly.month);
  let day = Number(dateOnly.day) + Number(amount || 0);

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  while (day < 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day += daysInMonth(year, month);
  }

  return {
    ...dateOnly,
    type: "date-only",
    isDateOnly: true,
    isDate: true,
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    timezone: null,
    date: `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`,
    dateKey: `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`,
    key: `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`,
    time: null
  };
}

function expandDateOnlyRangeExclusive(startDateOnly, endDateOnly) {
  const dates = [];
  let cursor = startDateOnly;
  const endKey = formatDateOnly(endDateOnly);
  while (compareDateKeys(formatDateOnly(cursor), endKey) < 0) {
    dates.push(formatDateOnly(cursor));
    cursor = addDaysToDateOnly(cursor, 1);
  }
  return dates;
}

function timeFromParts(parts) {
  return `${pad2(parts.hour || 0)}:${pad2(parts.minute || 0)}`;
}

function dateTimeKey(parts) {
  return `${dateKeyFromParts(parts)}T${timeFromParts(parts)}:${pad2(parts.second || 0)}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return { year, month, day };
}

function utcDateFromKey(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysToDateKey(dateKey, amount) {
  const date = utcDateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function compareDateKeys(a, b) {
  return String(a).localeCompare(String(b));
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsToParts(parts, amount) {
  const monthIndex = (parts.year * 12) + (parts.month - 1) + amount;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return { ...parts, year, month, day: Math.min(parts.day, daysInMonth(year, month)) };
}

function addYearsToParts(parts, amount) {
  const year = parts.year + amount;
  return { ...parts, year, day: Math.min(parts.day, daysInMonth(year, parts.month)) };
}

function weekdayForDateKey(dateKey) {
  return utcDateFromKey(dateKey).getUTCDay();
}

function addMonthsToDate(date, amount) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}

function importWindow() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today.getTime());
  start.setUTCDate(start.getUTCDate() - ICS_PAST_DAYS);
  const end = addMonthsToDate(today, ICS_FUTURE_MONTHS);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function lastSunday(year, month) {
  const date = new Date(Date.UTC(year, month, 0));
  while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() - 1);
  return date.getUTCDate();
}

function berlinOffsetMinutes(parts) {
  const marchSwitch = lastSunday(parts.year, 3);
  const octoberSwitch = lastSunday(parts.year, 10);
  const key = Number(`${parts.month}${pad2(parts.day)}${pad2(parts.hour || 0)}${pad2(parts.minute || 0)}`);
  const dstStart = Number(`3${pad2(marchSwitch)}0200`);
  const dstEnd = Number(`10${pad2(octoberSwitch)}0300`);
  return key >= dstStart && key < dstEnd ? 120 : 60;
}

function partsToUtcMs(parts, timezone) {
  const mappedTimezone = normalizeTimezone(timezone);
  const offset = mappedTimezone === "Europe/Berlin" ? berlinOffsetMinutes(parts) : 0;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0) - offset * 60000;
}

function utcDateToBerlinParts(date) {
  const utcParts = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
  const firstOffset = berlinOffsetMinutes(utcParts);
  const shifted = new Date(date.getTime() + firstOffset * 60000);
  const shiftedParts = {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
  const secondOffset = berlinOffsetMinutes(shiftedParts);
  if (secondOffset === firstOffset) return shiftedParts;
  const corrected = new Date(date.getTime() + secondOffset * 60000);
  return {
    year: corrected.getUTCFullYear(),
    month: corrected.getUTCMonth() + 1,
    day: corrected.getUTCDate(),
    hour: corrected.getUTCHours(),
    minute: corrected.getUTCMinutes(),
    second: corrected.getUTCSeconds()
  };
}

function parseIcsDateValue(property) {
  if (!property?.value) return null;
  const value = property.value.trim();
  const timezone = normalizeTimezone(property.params?.TZID);
  const isDate = property.params?.VALUE === "DATE" || /^\d{8}$/.test(value);

  if (isDate) {
    const dateOnly = parseDateOnlyValue(value);
    if (!dateOnly) return null;
    const date = formatDateOnly(dateOnly);
    return { ...dateOnly, date, dateKey: date, time: null, key: date };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, isUtc] = match;
  let parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) };
  let resolvedTimezone = timezone;
  if (isUtc) {
    parts = utcDateToBerlinParts(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)));
    resolvedTimezone = "UTC";
  }
  return {
    ...parts,
    isDate: false,
    timezone: resolvedTimezone,
    raw: value,
    dateKey: dateKeyFromParts(parts),
    time: timeFromParts(parts),
    key: dateTimeKey(parts)
  };
}

function parseIcsDuration(value) {
  if (!value) return 0;
  const match = String(value).trim().match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const [, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
  return (((((Number(weeks) * 7 + Number(days)) * 24 + Number(hours)) * 60 + Number(minutes)) * 60) + Number(seconds)) * 1000;
}

function localDateTimeMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
}

function eventDurationMs(start, end, explicitDurationMs = 0) {
  if (explicitDurationMs) return explicitDurationMs;
  if (!start || !end) return 0;
  if (start.isDateOnly && end.isDateOnly) {
    return (localDateTimeMs(end) - localDateTimeMs(start));
  }
  return Math.max(0, localDateTimeMs(end) - localDateTimeMs(start));
}

function addDurationToDateTime(parsed, durationMs) {
  const date = new Date(localDateTimeMs(parsed) + durationMs);
  const parts = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
  return { ...parts, isDate: false, timezone: parsed.timezone, raw: "", dateKey: dateKeyFromParts(parts), time: timeFromParts(parts), key: dateTimeKey(parts) };
}

function recurrenceFrequency(event) {
  const rule = parseRRule(event?.rrule || '') || {};
  if (rule.FREQ) return String(rule.FREQ).toUpperCase();
  if (event?.rdates?.length) return 'RDATE';
  return '';
}

function parseRRule(value) {
  if (!value) return null;
  return String(value).split(";").reduce((rule, part) => {
    const [rawKey, rawValue = ""] = part.split("=");
    const key = rawKey.trim().toUpperCase();
    const val = rawValue.trim();
    if (!key) return rule;
    if (["INTERVAL", "COUNT"].includes(key)) rule[key] = Math.max(1, Number(val) || 1);
    else if (["BYDAY", "BYMONTH", "BYMONTHDAY"].includes(key)) rule[key] = val.split(",").map(item => item.trim()).filter(Boolean);
    else rule[key] = val;
    return rule;
  }, {});
}

function parseDateList(properties) {
  return (properties || []).flatMap(property => String(property.value || "")
    .split(",")
    .map(value => parseIcsDateValue({ ...property, value: value.trim() }))
    .filter(Boolean));
}

function occurrenceKey(parsed) {
  return parsed?.isDate ? parsed.dateKey : parsed?.key;
}

function eventDateBounds(event) {
  const start = parseIcsDateValue(event.dtStart);
  if (!start) return null;
  const durationMs = parseIcsDuration(event.duration);
  let end = parseIcsDateValue(event.dtEnd);
  if (!end && durationMs && !start.isDate) end = addDurationToDateTime(start, durationMs);
  if (!end && start.isDateOnly) end = addDaysToDateOnly(start, 1);
  if (!end && !start.isDate) end = addDurationToDateTime(start, 60 * 60 * 1000);
  return { start, end, durationMs: eventDurationMs(start, end, durationMs) };
}

function isAllDayEvent(event, start) {
  return Boolean(event.allDayFlag || start?.isDate);
}

function baseDetails(event) {
  return {
    index: event.index,
    uid: event.uid,
    summary: event.summary,
    rawDtstart: event.dtStart?.raw || event.dtStart?.value || "",
    rawDtend: event.dtEnd?.raw || event.dtEnd?.value || ""
  };
}

function groupEventsByUid(events) {
  const groups = new Map();
  events.forEach(event => {
    if (!groups.has(event.uid)) groups.set(event.uid, []);
    groups.get(event.uid).push(event);
  });
  return groups;
}

function withDerivedDateFields(parts) {
  return {
    ...parts,
    dateKey: dateKeyFromParts(parts),
    time: parts.isDate ? null : timeFromParts(parts),
    key: parts.isDate ? dateKeyFromParts(parts) : dateTimeKey(parts)
  };
}

function datePartsFromStart(start, dateKey) {
  const parts = parseDateKey(dateKey);
  return withDerivedDateFields({ ...start, year: parts.year, month: parts.month, day: parts.day });
}

function candidateMatchesRule(candidate, start, rule) {
  const dateKey = dateKeyFromParts(candidate);
  if (rule.BYMONTH?.length && !rule.BYMONTH.map(Number).includes(candidate.month)) return false;
  if (rule.BYMONTHDAY?.length && !rule.BYMONTHDAY.map(Number).includes(candidate.day)) return false;
  if (rule.BYDAY?.length && !rule.BYDAY.map(day => day.slice(-2)).includes(WEEKDAY_NAMES[weekdayForDateKey(dateKey)])) return false;
  return dateTimeKey(candidate) >= dateTimeKey(start);
}

function monthlyCandidates(cursor, start, rule) {
  const monthDays = rule.BYMONTHDAY?.length ? rule.BYMONTHDAY.map(Number) : [start.day];
  return monthDays
    .filter(day => day >= 1 && day <= daysInMonth(cursor.year, cursor.month))
    .map(day => withDerivedDateFields({ ...start, year: cursor.year, month: cursor.month, day }))
    .filter(candidate => candidateMatchesRule(candidate, start, rule));
}

function yearlyCandidates(cursor, start, rule) {
  const months = rule.BYMONTH?.length ? rule.BYMONTH.map(Number) : [start.month];
  const monthDays = rule.BYMONTHDAY?.length ? rule.BYMONTHDAY.map(Number) : [start.day];
  return months.flatMap(month => monthDays
    .filter(day => month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(cursor.year, month))
    .map(day => withDerivedDateFields({ ...start, year: cursor.year, month, day })))
    .filter(candidate => candidateMatchesRule(candidate, start, rule));
}

function weeklyCandidates(cursorDateKey, start, rule) {
  const byDays = rule.BYDAY?.length ? rule.BYDAY.map(day => day.slice(-2)) : [WEEKDAY_NAMES[weekdayForDateKey(start.dateKey)]];
  return byDays.map(day => {
    const diff = (WEEKDAY_INDEX[day] - weekdayForDateKey(cursorDateKey) + 7) % 7;
    return datePartsFromStart(start, addDaysToDateKey(cursorDateKey, diff));
  }).filter(candidate => candidateMatchesRule(candidate, start, rule));
}

function recurrenceUntil(rule, start) {
  if (!rule.UNTIL) return null;
  return parseIcsDateValue({ value: rule.UNTIL, params: /^\d{8}$/.test(rule.UNTIL) ? { VALUE: "DATE" } : {} }) || null;
}

function isAfterUntil(candidate, until, timezone) {
  if (!until) return false;
  if (until.isDate) return compareDateKeys(dateKeyFromParts(candidate), until.dateKey) > 0;
  return partsToUtcMs(candidate, timezone) > partsToUtcMs(until, until.timezone === "UTC" ? "Europe/Berlin" : until.timezone);
}

function isInWindow(candidate, window) {
  const key = dateKeyFromParts(candidate);
  return compareDateKeys(key, window.start) >= 0 && compareDateKeys(key, window.end) <= 0;
}

function expandRecurringEvent(event, window) {
  const bounds = eventDateBounds(event);
  if (!bounds) return [];
  const { start } = bounds;
  const rule = parseRRule(event.rrule);
  const rdates = parseDateList(event.rdates);
  if (!rule && !rdates.length) return [{ event, start, originalStart: start, end: bounds.end }];

  const frequency = String(rule?.FREQ || "").toUpperCase();
  const interval = Math.max(1, Number(rule?.INTERVAL) || 1);
  const countLimit = Number(rule?.COUNT) || Infinity;
  const until = recurrenceUntil(rule || {}, start);
  const occurrences = [];
  let generated = 0;
  let loopGuard = 0;
  const timezone = start.timezone === "UTC" ? "Europe/Berlin" : start.timezone;
  const durationMs = bounds.durationMs || eventDurationMs(start, bounds.end);

  function addCandidate(candidate) {
    if (generated >= countLimit || occurrences.length >= ICS_MAX_OCCURRENCES_PER_SERIES) return;
    if (isAfterUntil(candidate, until, timezone)) return;
    generated++;
    if (isInWindow(candidate, window)) {
      occurrences.push({ event, start: candidate, originalStart: candidate, end: addDurationToDateTime(candidate, durationMs) });
    }
  }

  if (rule) {
    if (frequency === "DAILY") {
      let dateKey = start.dateKey;
      while (generated < countLimit && occurrences.length < ICS_MAX_OCCURRENCES_PER_SERIES && loopGuard++ < ICS_MAX_OCCURRENCES_PER_SERIES * 2) {
        const candidate = datePartsFromStart(start, dateKey);
        if (compareDateKeys(dateKeyFromParts(candidate), window.end) > 0 && !until && generated > 0) break;
        addCandidate(candidate);
        if (isAfterUntil(candidate, until, timezone)) break;
        dateKey = addDaysToDateKey(dateKey, interval);
      }
    } else if (frequency === "WEEKLY") {
      let weekStart = addDaysToDateKey(start.dateKey, -((weekdayForDateKey(start.dateKey) - (WEEKDAY_INDEX[rule.WKST] ?? 1) + 7) % 7));
      while (generated < countLimit && occurrences.length < ICS_MAX_OCCURRENCES_PER_SERIES && loopGuard++ < ICS_MAX_OCCURRENCES_PER_SERIES) {
        weeklyCandidates(weekStart, start, rule).sort((a, b) => dateTimeKey(a).localeCompare(dateTimeKey(b))).forEach(addCandidate);
        if (compareDateKeys(weekStart, window.end) > 0 && !until && generated > 0) break;
        weekStart = addDaysToDateKey(weekStart, interval * 7);
      }
    } else if (frequency === "MONTHLY") {
      let cursor = { ...start };
      while (generated < countLimit && occurrences.length < ICS_MAX_OCCURRENCES_PER_SERIES && loopGuard++ < ICS_MAX_OCCURRENCES_PER_SERIES) {
        monthlyCandidates(cursor, start, rule).sort((a, b) => dateTimeKey(a).localeCompare(dateTimeKey(b))).forEach(addCandidate);
        if (compareDateKeys(dateKeyFromParts(cursor), window.end) > 0 && !until && generated > 0) break;
        cursor = addMonthsToParts(cursor, interval);
      }
    } else if (frequency === "YEARLY") {
      let cursor = { ...start };
      while (generated < countLimit && occurrences.length < ICS_MAX_OCCURRENCES_PER_SERIES && loopGuard++ < ICS_MAX_OCCURRENCES_PER_SERIES) {
        yearlyCandidates(cursor, start, rule).sort((a, b) => dateTimeKey(a).localeCompare(dateTimeKey(b))).forEach(addCandidate);
        if (cursor.year > Number(window.end.slice(0, 4)) + 1 && !until && generated > 0) break;
        cursor = addYearsToParts(cursor, interval);
      }
    }
  }

  rdates.forEach(rdate => {
    if (occurrences.length >= ICS_MAX_OCCURRENCES_PER_SERIES) return;
    const candidate = withDerivedDateFields({ ...start, year: rdate.year, month: rdate.month, day: rdate.day, hour: rdate.hour || start.hour, minute: rdate.minute || start.minute, second: rdate.second || start.second });
    if (isInWindow(candidate, window)) occurrences.push({ event, start: candidate, originalStart: candidate, end: addDurationToDateTime(candidate, durationMs) });
  });

  return occurrences;
}

function applyRecurrenceExceptions(masterOccurrences, events) {
  const byOriginalStart = new Map(masterOccurrences.map(item => [occurrenceKey(item.originalStart), item]));
  const exdateKeys = new Set(events.flatMap(event => parseDateList(event.exdates).map(occurrenceKey)));
  exdateKeys.forEach(key => byOriginalStart.delete(key));

  events.filter(event => event.recurrenceId).forEach(exception => {
    const recurrence = parseIcsDateValue(exception.recurrenceId);
    const key = occurrenceKey(recurrence);
    if (!key) return;
    if (/^CANCELLED$/i.test(exception.status)) {
      byOriginalStart.delete(key);
      return;
    }
    const bounds = eventDateBounds(exception);
    if (!bounds) return;
    byOriginalStart.set(key, { event: exception, start: bounds.start, originalStart: recurrence, end: bounds.end });
  });

  return [...byOriginalStart.values()];
}

function expandMultiDayEventForDisplay(item) {
  const { event, start, end, originalStart } = item;
  const allDay = isAllDayEvent(event, start);
  const occurrenceStartKey = occurrenceKey(originalStart || start);
  const sourceUid = event.uid;
  const base = {
    uid: sourceUid,
    sourceUid,
    recurrenceId: event.recurrenceId ? occurrenceKey(parseIcsDateValue(event.recurrenceId)) : null,
    occurrenceStart: occurrenceStartKey,
    originalStart: start.key || start.dateKey,
    originalEnd: end?.key || end?.dateKey || null,
    source: "ics",
    importSource: "ics",
    provider: "outlook",
    sourceId: DEFAULT_ICS_SOURCE_ID,
    externalCalendarId: DEFAULT_ICS_SOURCE_ID,
    recurrenceRule: event.rrule || null,
    recurrenceFrequency: recurrenceFrequency(event),
    recurringSeries: Boolean(event.rrule || event.rdates?.length),
    rdateCount: Array.isArray(event.rdates) ? event.rdates.length : 0,
    type: "external_event",
    title: event.summary,
    location: event.location,
    description: null,
    organizerEmail: event.organizerEmail || null,
    organizerName: event.organizerName || null,
    attendees: Array.isArray(event.attendees) ? event.attendees : [],
    status: event.status || null,
    sequence: event.sequence || null,
    dtstamp: event.dtstamp || null,
    lastModified: event.lastModified || null,
    className: event.className || null,
    transp: event.transp || null,
    microsoftInstanceType: event.microsoftInstanceType || null,
    editable: false,
    readOnly: true,
    isExternal: true,
    importedFromIcs: true
  };

  if (allDay) {
    const startDateOnly = start.isDateOnly ? start : parseDateOnlyValue(start.dateKey);
    const endDateOnly = end?.isDateOnly ? end : parseDateOnlyValue(end?.dateKey) || addDaysToDateOnly(startDateOnly, 1);
    const expandedDates = expandDateOnlyRangeExclusive(startDateOnly, endDateOnly);
    if (/deichbrand/i.test(event.summary || "")) {
      console.log("[ICS ALLDAY DEBUG] event-flow", JSON.stringify({
        title: event.summary,
        uid: sourceUid,
        sourceId: DEFAULT_ICS_SOURCE_ID,
        recurrenceId: event.recurrenceId?.value || null,
        raw: {
          dtstart: event.dtStart?.raw || event.dtStart?.value || "",
          dtend: event.dtEnd?.raw || event.dtEnd?.value || "",
          valueDate: event.dtStart?.params?.VALUE === "DATE",
          tzid: event.dtStart?.params?.TZID || null
        },
        parsed: {
          start: formatDateOnly(startDateOnly),
          end: formatDateOnly(endDateOnly),
          allDay: true,
          endExclusive: true
        },
        transformed: { expandedDates }
      }, null, 2));
    }
    return expandedDates.map(date => ({
        ...base,
        id: `${sourceUid}__${occurrenceStartKey}__${date}`,
        externalId: `${sourceUid}__${occurrenceStartKey}__${date}`,
        sourceKey: `${sourceUid}__${occurrenceStartKey}`,
        date,
        startTime: null,
        endTime: null,
        allDay: true,
        displayDate: date
      }));
  }

  if (start.dateKey === end.dateKey) {
    return [{
      ...base,
      id: `${sourceUid}__${occurrenceStartKey}`,
      externalId: `${sourceUid}__${occurrenceStartKey}`,
      sourceKey: `${sourceUid}__${occurrenceStartKey}`,
      date: start.dateKey,
      startTime: start.time,
      endTime: end.time,
      allDay: false,
      displayDate: start.dateKey
    }];
  }

  const days = [];
  for (let date = start.dateKey; compareDateKeys(date, end.dateKey) <= 0; date = addDaysToDateKey(date, 1)) {
    const isFirst = date === start.dateKey;
    const isLast = date === end.dateKey;
    days.push({
      ...base,
      id: `${sourceUid}__${occurrenceStartKey}__${date}`,
      externalId: `${sourceUid}__${occurrenceStartKey}__${date}`,
      sourceKey: `${sourceUid}__${occurrenceStartKey}`,
      date,
      startTime: isFirst ? start.time : "00:00",
      endTime: isLast ? end.time : "24:00",
      allDay: false,
      displayDate: date,
      splitFromMultiDay: true
    });
  }
  return days.filter(day => day.startTime !== day.endTime);
}

function importedEventEndMs(event) {
  const date = parseDateKey(event?.date);
  if (!date.year || !date.month || !date.day) return NaN;
  if (event.allDay) {
    const exclusiveEnd = parseDateKey(addDaysToDateKey(event.date, 1));
    return partsToUtcMs({ ...exclusiveEnd, hour: 0, minute: 0, second: 0 }, "Europe/Berlin");
  }
  const match = String(event.endTime || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  const totalMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endDate = parseDateKey(addDaysToDateKey(event.date, Math.floor(totalMinutes / 1440)));
  const minutesInDay = totalMinutes % 1440;
  return partsToUtcMs({
    ...endDate,
    hour: Math.floor(minutesInDay / 60),
    minute: minutesInDay % 60,
    second: 0
  }, "Europe/Berlin");
}

function isCurrentOrFutureImportedEvent(event, nowMs = Date.now()) {
  const endMs = importedEventEndMs(event);
  return Number.isFinite(endMs) && endMs > nowMs;
}

function parseIcsEvents(icsText) {
  console.log("[ICS] Parsing started");
  const window = importWindow();
  const eventBlocks = extractVEvents(icsText);
  const parsedEvents = eventBlocks.map(parseEventBlock);
  const totalVevents = parsedEvents.length;
  const skippedEvents = [];
  const importedEvents = [];

  console.log("[ICS] Total VEVENT blocks:", totalVevents);
  console.log("[ICS] Import range:", window.start, window.end);
  console.log("[ICS SYNC DEBUG] raw-search", {
    testTitleFound: String(icsText || "").includes(ICS_SYNC_DEBUG_TEST_TITLE),
    veventCount: eventBlocks.length
  });

  const skipEvent = (reason, details) => {
    skippedEvents.push({ reason, ...details });
    console.warn("[ICS] Event skipped", reason, details.summary || details.uid || details.index);
  };

  groupEventsByUid(parsedEvents).forEach(events => {
    const masters = events.filter(event => !event.recurrenceId);
    const exceptions = events.filter(event => event.recurrenceId);
    const recurringMasters = masters.filter(event => event.rrule || event.rdates.length);
    const normalMasters = masters.filter(event => !event.rrule && !event.rdates.length);

    recurringMasters.forEach(master => {
      if (!master.dtStart) {
        skipEvent("missing DTSTART", baseDetails(master));
        return;
      }
      const occurrences = applyRecurrenceExceptions(expandRecurringEvent(master, window), [master, ...exceptions]);
      occurrences.forEach(item => importedEvents.push(...expandMultiDayEventForDisplay(item)));
    });

    normalMasters.forEach(event => {
      if (/^CANCELLED$/i.test(event.status)) {
        skipEvent("cancelled event", baseDetails(event));
        return;
      }
      const bounds = eventDateBounds(event);
      if (!bounds) {
        skipEvent("invalid or missing date", baseDetails(event));
        return;
      }
      const included = !(compareDateKeys(bounds.start.dateKey, window.end) > 0 || compareDateKeys(bounds.end.dateKey, window.start) < 0);
      if (String(event.summary || "").includes(ICS_SYNC_DEBUG_TEST_TITLE)) {
        console.log("[ICS SYNC DEBUG] date-filter", {
          title: event.summary,
          rawStart: event.dtStart?.raw || event.dtStart?.value || null,
          parsedStart: bounds.start?.key || bounds.start?.dateKey || null,
          localStart: bounds.start?.dateKey && bounds.start?.time ? `${bounds.start.dateKey} ${bounds.start.time}` : bounds.start?.dateKey || null,
          rangeStart: window.start,
          rangeEnd: window.end,
          included
        });
      }
      if (!included) return;
      importedEvents.push(...expandMultiDayEventForDisplay({ event, start: bounds.start, originalStart: bounds.start, end: bounds.end }));
    });

    if (!recurringMasters.length) {
      exceptions.forEach(event => {
        if (/^CANCELLED$/i.test(event.status)) return;
        const bounds = eventDateBounds(event);
        if (!bounds) return;
        importedEvents.push(...expandMultiDayEventForDisplay({ event, start: bounds.start, originalStart: parseIcsDateValue(event.recurrenceId) || bounds.start, end: bounds.end }));
      });
    }
  });

  const currentOrFutureEvents = importedEvents.filter(event => isCurrentOrFutureImportedEvent(event));
  const pastEventsSkipped = importedEvents.length - currentOrFutureEvents.length;
  const uniqueEvents = [];
  const seen = new Set();
  currentOrFutureEvents.forEach(event => {
    const key = `${event.sourceId}::${event.externalId}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueEvents.push(event);
  });

  const skipReasonsSummary = countByReason(skippedEvents);
  const allDayImported = uniqueEvents.filter(event => event.allDay).length;
  console.log("[ICS] Imported events:", uniqueEvents.length);
  console.log("[ICS] Past events skipped:", pastEventsSkipped);
  console.log("[ICS] Skipped events:", skippedEvents.length);
  console.log("[ICS SYNC DEBUG] parsed-events", {
    parsedCount: uniqueEvents.length,
    matchingEvents: uniqueEvents
      .filter(event => String(event.title || "").includes(ICS_SYNC_DEBUG_TEST_TITLE))
      .map(event => ({
        uid: event.uid,
        title: event.title,
        date: event.date,
        start: event.startTime,
        end: event.endTime,
        externalId: event.externalId
      }))
  });
  console.table(skipReasonsSummary);

  return {
    events: uniqueEvents,
    skippedEvents,
    skippedCount: skippedEvents.length,
    skipReasonsSummary,
    recurringSkipped: 0,
    allDaySkipped: 0,
    allDayImported,
    pastEventsSkipped,
    totalVevents,
    rangeStart: window.start,
    rangeEnd: window.end
  };
}

export {
  unfoldIcsLines,
  parseIcsProperty,
  parseIcsDateValue,
  parseDateOnlyValue,
  formatDateOnly,
  addDaysToDateOnly,
  expandDateOnlyRangeExclusive,
  importedEventEndMs,
  isCurrentOrFutureImportedEvent,
  parseRRule,
  parseIcsEvents,
  expandRecurringEvent,
  applyRecurrenceExceptions,
  expandMultiDayEventForDisplay
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { icsUrl } = req.body || {};

    if (!icsUrl || typeof icsUrl !== "string") {
      return res.status(400).json({ error: "ICS URL fehlt." });
    }

    if (!icsUrl.startsWith("https://")) {
      return res.status(400).json({ error: "Nur HTTPS-Links sind erlaubt." });
    }

    console.log("[ICS] Sync started");
    console.log("[ICS] Fetching URL", (() => { try { return new URL(icsUrl).host; } catch { return "invalid-url"; } })());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ICS_SYNC_TIMEOUT_MS);
    let icsResponse;

    try {
      icsResponse = await fetch(icsUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("[ICS] Sync failed", error);
        return res.status(408).json({ error: "ICS Sync Timeout: Kalender antwortet nicht rechtzeitig. Bitte später erneut versuchen." });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    console.log("[ICS] Fetch response", icsResponse.status, icsResponse.ok);

    const icsText = await icsResponse.text();
    console.log("[ICS] Text length", icsText.length);
    console.log("[ICS SYNC DEBUG] fetch-result", {
      source: (() => { try { return new URL(icsUrl).host; } catch { return "invalid-url"; } })(),
      success: icsResponse.ok,
      status: icsResponse.status,
      contentLength: icsText.length,
      firstCharacters: icsText.slice(0, 200),
      syncedAt: new Date().toISOString()
    });

    if (!icsResponse.ok) {
      return res.status(400).json({
        error: "ICS-Link konnte nicht geladen werden.",
        status: icsResponse.status
      });
    }

    if (!icsText.includes("BEGIN:VCALENDAR")) {
      return res.status(400).json({ error: "Der Link liefert keine gültige ICS-Datei." });
    }

    const diagnostics = parseIcsEvents(icsText);
    console.log("[ICS] Parsed events", diagnostics.events.length);
    console.log("[ICS] Sync finished");

    return res.status(200).json({
      events: diagnostics.events,
      count: diagnostics.events.length,
      skippedEvents: diagnostics.skippedEvents,
      skippedCount: diagnostics.skippedCount,
      skipReasonsSummary: diagnostics.skipReasonsSummary,
      recurringSkipped: diagnostics.recurringSkipped,
      allDaySkipped: diagnostics.allDaySkipped,
      allDayImported: diagnostics.allDayImported,
      pastEventsSkipped: diagnostics.pastEventsSkipped,
      totalVevents: diagnostics.totalVevents,
      rangeStart: diagnostics.rangeStart,
      rangeEnd: diagnostics.rangeEnd
    });
  } catch (error) {
    console.error("[ICS] Sync failed", error);
    return res.status(500).json({ error: "Serverfehler beim ICS-Import." });
  }
}
