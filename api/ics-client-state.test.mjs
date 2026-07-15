import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const identitySource = appSource
  .match(/function icsExternalKey[\s\S]*?\nfunction icsExternalIdAliases/)[0]
  .replace(/\nfunction icsExternalIdAliases$/, "");
const pastSource = appSource
  .match(/function isPastStoredExternalEvent[\s\S]*?\n\}/)[0];

let saved = 0;
let rendered = 0;
let closed = 0;
const context = {
  Date,
  Number,
  String,
  Boolean,
  Map,
  Set,
  Object,
  Array,
  DEFAULT_ICS_SOURCE_ID: "default-ics",
  state: { deletedExternalEvents: [], weekEventsByWeek: {} },
  isImportedIcsEvent: event => event?.importSource === "ics",
  isExternalIcsEvent: event => event?.importSource === "ics",
  isEventLocallyHidden: event => Boolean(event?.localOverrides?.hidden),
  recordExternalLocalOverrides: (event, fields) => { event.localOverrides = { ...(event.localOverrides || {}), ...fields }; },
  touchEvent: () => {},
  currentWeekEvents: () => [],
  saveState: () => { saved++; },
  renderAll: () => { rendered++; },
  closeModal: () => { closed++; },
  confirm: () => true,
  setIcsStatus: () => {},
  document: { getElementById: () => null },
  escapeHtml: String,
  dateKeyToLocalDate: key => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
};
vm.createContext(context);
vm.runInContext(`${identitySource}\n${pastSource}`, context);

const tombstoneCheckPosition = appSource.indexOf("if (tombstoneKeys.has(externalKey))");
const duplicateCheckPosition = appSource.indexOf("if (importedExternalIds.has(externalKey))");
assert.ok(tombstoneCheckPosition > 0 && tombstoneCheckPosition < duplicateCheckPosition);

const restorableHiddenEvent = {
  id: "restorable-hidden",
  title: "Restorable hidden",
  date: "2026-07-17",
  sourceId: "default-ics",
  externalId: "restorable-hidden",
  importSource: "ics",
  localOverrides: { hidden: true }
};
context.state.weekEventsByWeek = { "2026-07-13": [restorableHiddenEvent] };
const hiddenEvents = context.hiddenExternalEvents();
assert.equal(hiddenEvents.length, 1);
context.restoreHiddenExternalEvents([hiddenEvents[0].key]);
assert.equal(context.state.weekEventsByWeek["2026-07-13"].length, 1);
assert.equal(restorableHiddenEvent.localOverrides.hidden, false);

const deletedInstance = {
  id: "series-instance-1",
  title: "Series occurrence",
  date: "2026-07-18",
  sourceId: "default-ics",
  externalId: "series__instance-1",
  sourceUid: "series",
  importSource: "ics",
  localOverrides: { hidden: false }
};
const siblingInstance = {
  ...deletedInstance,
  id: "series-instance-2",
  externalId: "series__instance-2",
  date: "2026-07-19"
};
const localEvent = { id: "local", title: "Local", date: "2026-07-18", importSource: null };
context.state.weekEventsByWeek = { "2026-07-13": [deletedInstance, siblingInstance, localEvent] };

assert.equal(context.deleteExternalEventLocally(deletedInstance), true);
assert.deepEqual(context.state.weekEventsByWeek["2026-07-13"].map(event => event.id), ["series-instance-2", "local"]);
assert.equal(context.state.deletedExternalEvents.length, 1);
assert.equal(context.state.deletedExternalEvents[0].externalId, "series__instance-1");
assert.ok(context.deletedExternalEventKeys().has("default-ics:series__instance-1"));
assert.ok(!context.deletedExternalEventKeys().has("default-ics:series__instance-2"));

context.removeDeletedExternalEvents(["default-ics:series__instance-1"]);
assert.equal(context.state.deletedExternalEvents.length, 0);
assert.deepEqual(context.state.weekEventsByWeek["2026-07-13"].map(event => event.id), ["series-instance-2", "local"]);

const hiddenEvent = {
  ...deletedInstance,
  id: "hidden-instance",
  externalId: "hidden-instance",
  localOverrides: { hidden: true }
};
context.state.weekEventsByWeek["2026-07-13"].push(hiddenEvent);
assert.equal(context.deleteExternalEventLocally(hiddenEvent), true);
assert.ok(!context.state.weekEventsByWeek["2026-07-13"].some(event => event.id === "hidden-instance"));
assert.equal(context.state.deletedExternalEvents[0].externalId, "hidden-instance");

context.state.deletedExternalEvents.push({
  sourceId: "default-ics",
  externalId: "second-tombstone",
  title: "Second",
  date: "2026-07-20",
  sourceLabel: "Outlook",
  deletedAt: new Date().toISOString()
});
const allDeletedKeys = context.state.deletedExternalEvents.map(context.deletedExternalEventKey);
context.removeDeletedExternalEvents(allDeletedKeys);
assert.equal(context.state.deletedExternalEvents.length, 0);
assert.deepEqual(context.state.weekEventsByWeek["2026-07-13"].map(event => event.id), ["series-instance-2", "local"]);

assert.equal(context.isPastStoredExternalEvent({ importSource: "ics", date: "2025-01-01", allDay: true }, new Date("2025-01-02T00:00:00")), true);
assert.equal(context.isPastStoredExternalEvent({ importSource: "ics", date: "2025-01-02", allDay: true }, new Date("2025-01-02T12:00:00")), false);
assert.equal(context.isPastStoredExternalEvent({ importSource: "ics", date: "2025-01-02", allDay: false, end: 48 }, new Date("2025-01-02T12:00:00")), true);

assert.equal(saved, 5);
assert.equal(rendered, 5);
assert.equal(closed, 2);
console.log("ICS client tombstone tests passed");
