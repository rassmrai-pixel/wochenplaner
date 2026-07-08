
const ICS_SYNC_TIMEOUT_MS = 60000;

function unfoldIcsLines(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function getIcsField(block, fieldName) {
  const regex = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, "mi");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}

function getIcsProperty(block, fieldName) {
  const regex = new RegExp(`^(${fieldName}(?:;[^:]*)?):(.*)$`, "mi");
  const match = block.match(regex);
  if (!match) return { line: "", value: "", params: "" };

  const nameWithParams = match[1] || fieldName;
  return {
    line: match[0] || "",
    value: (match[2] || "").trim(),
    params: nameWithParams.slice(fieldName.length)
  };
}

function countByReason(skippedEvents) {
  return skippedEvents.reduce((summary, item) => {
    summary[item.reason] = (summary[item.reason] || 0) + 1;
    return summary;
  }, {});
}

function cleanIcsText(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDate(value) {
  if (!value) return null;

  const clean = String(value).trim();

  // Format: 20260704
  if (/^\d{8}$/.test(clean)) {
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  // Format: 20260704T100000Z oder 20260704T100000
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, isUtc] = match;

  if (isUtc) {
    return new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ));
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
}

function parseIcsDuration(value) {
  if (!value) return 0;
  const match = String(value).trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
  return (((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
}

function formatIcsDateValue(value) {
  const clean = String(value || "").trim();
  if (!/^\d{8}$/.test(clean)) return "";
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

function parseIcsEvents(icsText) {
  console.log("[ICS] Parsing started");
  const unfolded = unfoldIcsLines(icsText);
  const eventBlocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const totalVevents = eventBlocks.length;
  const skippedEvents = [];
  const rangeStart = null;
  const rangeEnd = null;

  console.log("[ICS] Total VEVENT blocks:", totalVevents);
  console.log("[ICS] Import range:", rangeStart, rangeEnd);

  const skipEvent = (reason, details) => {
    skippedEvents.push({ reason, ...details });
    console.warn("[ICS] Event skipped", reason, details.summary || details.uid || details.index);
    return null;
  };

  const events = eventBlocks
    .map((block, index) => {
      const uid = getIcsField(block, "UID") || `event_${index}`;
      const summary = cleanIcsText(getIcsField(block, "SUMMARY") || "Ohne Titel");
      const location = cleanIcsText(getIcsField(block, "LOCATION") || "");
      const description = cleanIcsText(getIcsField(block, "DESCRIPTION") || "");
      const status = getIcsField(block, "STATUS");
      const rrule = getIcsField(block, "RRULE");
      const rdate = getIcsField(block, "RDATE");
      const dtStart = getIcsProperty(block, "DTSTART");
      const dtEnd = getIcsProperty(block, "DTEND");
      const durationRaw = getIcsField(block, "DURATION");
      const hasTzid = /TZID=/i.test(dtStart.params) || /TZID=/i.test(dtEnd.params);
      const hasUtc = /Z$/i.test(dtStart.value) || /Z$/i.test(dtEnd.value);
      const isAllDay = /VALUE=DATE/i.test(dtStart.params) || /^\d{8}$/.test(dtStart.value);
      const baseDetails = {
        index,
        uid,
        summary,
        rawDtstart: dtStart.line || dtStart.value,
        rawDtend: dtEnd.line || dtEnd.value
      };

      if (rrule || rdate) {
        console.warn("[ICS] Recurring event skipped", summary || uid);
        return skipEvent("RRULE not supported", baseDetails);
      }

      if (/^CANCELLED$/i.test(status)) {
        return skipEvent("cancelled event", baseDetails);
      }

      if (!dtStart.value) {
        return skipEvent("missing DTSTART", baseDetails);
      }

      if (isAllDay) {
        const allDayDate = formatIcsDateValue(dtStart.value);
        if (!allDayDate) {
          return skipEvent("invalid date", baseDetails);
        }

        return {
          id: `ics_${uid}`,
          uid,
          source: "ics",
          importSource: "ics",
          provider: "ics",
          externalId: uid,
          sourceId: "default-ics",
          type: "external_event",
          title: summary,
          date: allDayDate,
          startTime: null,
          endTime: null,
          allDay: true,
          location,
          description,
          editable: false,
          readOnly: true,
          isExternal: true
        };
      }

      if (!dtEnd.value && !durationRaw) {
        return skipEvent("missing DTEND and missing DURATION", baseDetails);
      }

      const start = parseIcsDate(dtStart.value);
      let end = parseIcsDate(dtEnd.value);
      const durationMs = parseIcsDuration(durationRaw);
      if (!end && durationMs && start) end = new Date(start.getTime() + durationMs);

      if (!start || Number.isNaN(start.getTime())) {
        return skipEvent("invalid date", baseDetails);
      }

      if (!end || Number.isNaN(end.getTime())) {
        return skipEvent("invalid date", baseDetails);
      }

      if (hasTzid || hasUtc) {
        console.log("[ICS] Date parse debug", {
          title: summary,
          rawDtstart: dtStart.line || dtStart.value,
          rawDtend: dtEnd.line || dtEnd.value,
          parsedDate: formatDate(start),
          parsedStart: formatTime(start),
          parsedEnd: formatTime(end),
          hasTzid,
          hasUtc
        });
      }

      return {
        id: `ics_${uid}`,
        uid,
        source: "ics",
        importSource: "ics",
        provider: "outlook",
        externalId: uid,
        sourceId: "default-ics",
        type: "external_event",
        title: summary,
        date: formatDate(start),
        startTime: formatTime(start),
        endTime: end ? formatTime(end) : "",
        location,
        description,
        editable: false
      };
    })
    .filter(Boolean);

  const skipReasonsSummary = countByReason(skippedEvents);
  const allDayImported = events.filter(event => event.allDay).length;
  console.log("[ICS] Imported events:", events.length);
  console.log("[ICS] Skipped events:", skippedEvents.length);
  console.table(skipReasonsSummary);

  return {
    events,
    skippedEvents,
    skippedCount: skippedEvents.length,
    skipReasonsSummary,
    recurringSkipped: skipReasonsSummary["RRULE not supported"] || 0,
    allDaySkipped: skipReasonsSummary["all-day event not supported"] || 0,
    allDayImported,
    totalVevents,
    rangeStart,
    rangeEnd
  };
}

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
    console.log("[ICS] Fetching URL", icsUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ICS_SYNC_TIMEOUT_MS);
    let icsResponse;

    try {
      icsResponse = await fetch(icsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0"
        },
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

    if (!icsResponse.ok) {
      return res.status(400).json({
        error: "ICS-Link konnte nicht geladen werden.",
        status: icsResponse.status
      });
    }

    const icsText = await icsResponse.text();
    console.log("[ICS] Text length", icsText.length);

    if (!icsText.includes("BEGIN:VCALENDAR")) {
      return res.status(400).json({ error: "Der Link liefert keine gültige ICS-Datei." });
    }

    const diagnostics = parseIcsEvents(icsText);
    const {
      events,
      skippedEvents,
      skippedCount,
      skipReasonsSummary,
      recurringSkipped,
      allDaySkipped,
      allDayImported,
      totalVevents,
      rangeStart,
      rangeEnd
    } = diagnostics;
    console.log("[ICS] Parsed events", events.length);
    console.log("[ICS] Total VEVENT blocks:", totalVevents);
    console.log("[ICS] Imported events:", events.length);
    console.log("[ICS] Skipped events:", skippedEvents.length);
    if (recurringSkipped) console.warn("[ICS] Recurring events skipped", recurringSkipped);
    console.log("[ICS] Sync finished");

    return res.status(200).json({
      events,
      count: events.length,
      skippedEvents,
      skippedCount,
      skipReasonsSummary,
      recurringSkipped,
      allDaySkipped,
      allDayImported,
      totalVevents,
      rangeStart,
      rangeEnd
    });
  } catch (error) {
    console.error("[ICS] Sync failed", error);
    return res.status(500).json({ error: "Serverfehler beim ICS-Import." });
  }
}
