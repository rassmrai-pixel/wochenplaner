
function unfoldIcsLines(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function getIcsField(block, fieldName) {
  const regex = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, "mi");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
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
  let recurringSkipped = 0;

  const events = eventBlocks
    .map((block, index) => {
      const uid = getIcsField(block, "UID") || `event_${index}`;
      const summary = cleanIcsText(getIcsField(block, "SUMMARY") || "Ohne Titel");
      const location = cleanIcsText(getIcsField(block, "LOCATION") || "");
      const description = cleanIcsText(getIcsField(block, "DESCRIPTION") || "");
      const rrule = getIcsField(block, "RRULE");
      const rdate = getIcsField(block, "RDATE");

      if (rrule || rdate) {
        recurringSkipped++;
        console.warn("[ICS] Recurring event skipped", summary || uid);
        return null;
      }

      const dtStartRaw = getIcsField(block, "DTSTART");
      const dtEndRaw = getIcsField(block, "DTEND");

      const start = parseIcsDate(dtStartRaw);
      const end = parseIcsDate(dtEndRaw);

      if (!start) return null;

      return {
        id: `ics_${uid}`,
        source: "ics",
        provider: "outlook",
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

  return { events, recurringSkipped };
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
    const timeout = setTimeout(() => controller.abort(), 20000);
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
        return res.status(408).json({ error: "ICS Sync Timeout: Die Kalender-URL antwortet nicht." });
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

    const { events, recurringSkipped } = parseIcsEvents(icsText);
    console.log("[ICS] Parsed events", events.length);
    if (recurringSkipped) console.warn("[ICS] Recurring events skipped", recurringSkipped);
    console.log("[ICS] Sync finished");

    return res.status(200).json({
      events,
      count: events.length,
      recurringSkipped
    });
  } catch (error) {
    console.error("[ICS] Sync failed", error);
    return res.status(500).json({ error: "Serverfehler beim ICS-Import." });
  }
}
