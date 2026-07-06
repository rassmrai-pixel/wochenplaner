function timeLabel(slot) {
  const clamped = clamp(slot, 0, slotsPerDay);
  const minutes = clamped * 15;
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function eventTime(ev) { return `${timeLabel(ev.start)}–${timeLabel(ev.end)}`; }

function timeValueToSlot(value, fallbackSlot = 36) {
  if (!value) return fallbackSlot;

  const raw = String(value).trim();
  let hours = null;
  let minutes = null;

  if (raw.includes('T')) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      hours = parsed.getHours();
      minutes = parsed.getMinutes();
    }
  } else {
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      hours = Number(match[1]);
      minutes = Number(match[2]);
    }
  }

  if (hours === null || minutes === null) return fallbackSlot;
  return clamp(Math.round(((hours * 60) + minutes) / 15), 0, slotsPerDay);
}

