import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function extract(name, nextName) {
  const pattern = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\s*(?:async\\s+)?function ${nextName}\\b`);
  const match = appSource.match(pattern);
  assert.ok(match, `Function ${name} not found`);
  return match[0].replace(new RegExp(`\\n\\s*(?:async\\s+)?function ${nextName}\\b[\\s\\S]*$`), "");
}

const entryTypeSource = extract("eventEntryType", "isExternalReadOnlyEvent");
const typeContext = {
  state: {
    categories: {
      commute: { habit: true },
      neutral: { habit: false }
    }
  },
  isExternalIcsEvent: event => Boolean(event?.importSource === "ics")
};
vm.createContext(typeContext);
vm.runInContext(entryTypeSource, typeContext);

const calendarDrive = { source: "extra", entryType: "calendar", categoryId: "commute" };
assert.equal(typeContext.eventEntryType(calendarDrive), "calendar");
assert.equal(typeContext.isTimedTodoEvent(calendarDrive), false);
assert.equal(typeContext.isHabitEvent(calendarDrive), false);
assert.equal(typeContext.isTrackableCalendarEvent(calendarDrive), false);

const timedTodoDrive = { source: "extra", entryType: "timedTodo", categoryId: "commute" };
assert.equal(typeContext.isTimedTodoEvent(timedTodoDrive), true);
assert.equal(typeContext.isTrackableCalendarEvent(timedTodoDrive), true);

const explicitHabit = { source: "extra", entryType: "habit", categoryId: "neutral" };
assert.equal(typeContext.isHabitEvent(explicitHabit), true);
assert.equal(typeContext.isTrackableCalendarEvent(explicitHabit), true);

const legacyRoutine = { source: "routine", categoryId: "commute" };
assert.equal(typeContext.isHabitEvent(legacyRoutine), true);

const legacyTimedTodo = { source: "extra", categoryId: "neutral" };
assert.equal(typeContext.eventEntryType(legacyTimedTodo), "timedTodo");
assert.equal(typeContext.isTimedTodoEvent(legacyTimedTodo), true);

const externalEvent = { source: "extra", entryType: "timedTodo", importSource: "ics" };
assert.equal(typeContext.eventEntryType(externalEvent), "external");
assert.equal(typeContext.isTrackableCalendarEvent(externalEvent), false);

const createSource = extract("createEventFromModalDraft", "sendCalendarInvitationForCurrentEvent");
const createdEvents = [];
const createContext = {
  state: { currentWeekStart: "2026-07-13", todos: [] },
  Date,
  Boolean,
  eventDraftSubtasks: [],
  modalAutoComplete: { checked: false },
  isTemplateMode: () => false,
  dateKey: value => value,
  getDayDate: day => `2026-07-${13 + day}`,
  cloneEventSubtasks: () => [],
  invitationUidForEvent: event => `uid-${event.id}`,
  applyInviteDraftToEvent: event => {
    event.participants = [{ email: "outlook@example.com" }];
    event.attendees = [{ email: "outlook@example.com" }];
  },
  currentEvents: () => createdEvents,
  logOwnInviteDebug: () => {},
  id: () => "event-1"
};
vm.createContext(createContext);
vm.runInContext(`let editingId = null; let presetSource = 'extra'; let pendingTodoId = null;\n${createSource}`, createContext);

const draft = {
  day: 3,
  start: 70,
  end: 74,
  label: "APP OUTLOOK DUPLICATE TEST 001",
  categoryId: "commute",
  entryType: "calendar",
  stackedIntoId: null
};
const firstCreated = createContext.createEventFromModalDraft(draft);
const secondCreated = createContext.createEventFromModalDraft(draft);
assert.equal(createdEvents.length, 1);
assert.equal(firstCreated, secondCreated);
assert.equal(firstCreated.id, "event-1");
assert.equal(firstCreated.invitationUid, "uid-event-1");
assert.equal(firstCreated.entryType, "calendar");
assert.equal(firstCreated.participants.length, 1);

assert.match(appSource, /sendInviteBtn\.disabled = !canInviteEvent\(ev\) \|\| !inviteDraftAttendees\.length/);
assert.match(appSource, /const created = createEventFromModalDraft\(draft\);[\s\S]*?openEditor\(created\.id\)/);
assert.match(appSource, /source: 'extra',\s*entryType: 'external',\s*templateEventId: null/);

console.log("Event entry type and draft invitation tests passed");
