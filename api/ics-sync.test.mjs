import assert from "node:assert/strict";
import { parseIcsEvents } from "./ics-sync.js";

const RealDate = Date;
globalThis.Date = class FixedDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ["2025-07-11T12:00:00Z"]));
  }
  static now() { return new RealDate("2025-07-11T12:00:00Z").getTime(); }
  static UTC(...args) { return RealDate.UTC(...args); }
  static parse(value) { return RealDate.parse(value); }
};

const calendar = body => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;
const eventsFor = body => parseIcsEvents(calendar(body)).events;

const weekly = eventsFor(`BEGIN:VEVENT
UID:series
SUMMARY:Daily Sales Meeting
DTSTART;TZID=W. Europe Standard Time:20250710T080000
DTEND;TZID=W. Europe Standard Time:20250710T081500
RRULE:FREQ=WEEKLY;UNTIL=20250718T060000Z;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;WKST=MO
EXDATE;TZID=W. Europe Standard Time:20250715T080000
END:VEVENT
BEGIN:VEVENT
UID:series
RECURRENCE-ID;TZID=W. Europe Standard Time:20250711T080000
SUMMARY:Daily Sales Meeting moved
DTSTART;TZID=W. Europe Standard Time:20250711T083000
DTEND;TZID=W. Europe Standard Time:20250711T084500
X-MICROSOFT-CDO-INSTTYPE:3
END:VEVENT
BEGIN:VEVENT
UID:series
RECURRENCE-ID;TZID=W. Europe Standard Time:20250714T080000
STATUS:CANCELLED
DTSTART;TZID=W. Europe Standard Time:20250714T080000
DTEND;TZID=W. Europe Standard Time:20250714T081500
END:VEVENT`);

assert.ok(weekly.some(event => event.date === "2025-07-10" && event.startTime === "08:00"));
assert.ok(weekly.some(event => event.date === "2025-07-11" && event.startTime === "08:30"));
assert.ok(!weekly.some(event => event.date === "2025-07-11" && event.startTime === "08:00"));
assert.ok(!weekly.some(event => event.date === "2025-07-14"));
assert.ok(!weekly.some(event => event.date === "2025-07-15"));
assert.ok(!weekly.some(event => [0, 6].includes(new Date(`${event.date}T00:00:00Z`).getUTCDay())));

const pastSingle = eventsFor(`BEGIN:VEVENT
UID:past-single
SUMMARY:Alter Einzeltermin
DTSTART;TZID=W. Europe Standard Time:20250709T080000
DTEND;TZID=W. Europe Standard Time:20250709T090000
END:VEVENT`);

assert.equal(pastSingle.length, 0);

const shortSeries = eventsFor(`BEGIN:VEVENT
UID:short-series
SUMMARY:Short Series
DTSTART;TZID=W. Europe Standard Time:20250710T130000
DTEND;TZID=W. Europe Standard Time:20250710T131500
RRULE:FREQ=DAILY;COUNT=3
END:VEVENT`);

assert.deepEqual(
  shortSeries.map(event => [event.date, event.startTime, event.endTime]),
  [["2025-07-10", "13:00", "13:15"], ["2025-07-11", "13:00", "13:15"], ["2025-07-12", "13:00", "13:15"]]
);
assert.ok(!shortSeries.some(event => event.endTime === "15:15"));

const birthday = eventsFor(`BEGIN:VEVENT
UID:birthday
SUMMARY:Geburtstag
DTSTART;VALUE=DATE:20251022
DTEND;VALUE=DATE:20251023
RRULE:FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=22
END:VEVENT`);

assert.ok(birthday.some(event => event.date === "2025-10-22"));
assert.ok(birthday.some(event => event.date === "2026-10-22"));

const trip = eventsFor(`BEGIN:VEVENT
UID:trip
SUMMARY:Warschau
DTSTART;VALUE=DATE:20250905
DTEND;VALUE=DATE:20250908
X-MICROSOFT-CDO-ALLDAYEVENT:TRUE
END:VEVENT`);

assert.deepEqual(trip.map(event => event.date), ["2025-09-05", "2025-09-06", "2025-09-07"]);

const deichbrand = eventsFor(`BEGIN:VEVENT
UID:deichbrand
SUMMARY:Deichbrand
DTSTART;VALUE=DATE:20260718
DTEND;VALUE=DATE:20260720
X-MICROSOFT-CDO-ALLDAYEVENT:TRUE
END:VEVENT`);

assert.deepEqual(deichbrand.map(event => event.date), ["2026-07-18", "2026-07-19"]);
assert.deepEqual(deichbrand.map(event => new Date(`${event.date}T00:00:00Z`).getUTCDay()), [6, 0]);
assert.ok(!deichbrand.some(event => event.date === "2026-07-20"));

const folded = eventsFor(`BEGIN:VEVENT
UID:folded
SUMMARY:Folded
DTSTART;TZID=W. Europe Standard Time:20250710T080000
DTEND;TZID=W. Europe Standard Time:20250710T081500
RRULE:FREQ=WEEKLY;UNTIL=20250717T060000Z;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;WK
 ST=MO
EXDATE;TZID=W. Europe Standard Time:20250711T080000,20250714T080000
END:VEVENT`);

assert.ok(!folded.some(event => event.date === "2025-07-11"));
assert.ok(!folded.some(event => event.date === "2025-07-14"));

const utc = eventsFor(`BEGIN:VEVENT
UID:utc
SUMMARY:UTC
DTSTART:20250710T060000Z
DTEND:20250710T061500Z
END:VEVENT`);

assert.equal(utc[0].startTime, "08:00");
assert.equal(utc[0].endTime, "08:15");

const overnight = eventsFor(`BEGIN:VEVENT
UID:night
SUMMARY:Night
DTSTART;TZID=W. Europe Standard Time:20260710T220000
DTEND;TZID=W. Europe Standard Time:20260711T020000
END:VEVENT`);

assert.equal(overnight.length, 2);
assert.deepEqual(
  overnight.map(event => [event.date, event.startTime, event.endTime]),
  [["2026-07-10", "22:00", "24:00"], ["2026-07-11", "00:00", "02:00"]]
);

console.log("ICS parser tests passed");
