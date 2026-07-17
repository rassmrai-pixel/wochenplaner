import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");

function extract(name, nextName) {
  const pattern = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\s*function ${nextName}\\b`);
  const match = app.match(pattern);
  assert.ok(match, `Function ${name} not found`);
  return match[0].replace(new RegExp(`\\n\\s*function ${nextName}\\b[\\s\\S]*$`), "");
}

const dayCountSource = extract("calendarVisibleDayCount", "mobileVisibleDayCount");
const dayContext = {
  state: { calendarVisibleDays: null },
  isMobileViewport: () => false,
  window: { matchMedia: () => ({ matches: false }) },
  Number
};
vm.createContext(dayContext);
vm.runInContext(dayCountSource, dayContext);

assert.equal(dayContext.calendarVisibleDayCount(), 7);
for (const count of [1, 2, 3, 7]) {
  dayContext.state.calendarVisibleDays = count;
  assert.equal(dayContext.calendarVisibleDayCount(), count);
}
dayContext.state.calendarVisibleDays = null;
dayContext.isMobileViewport = () => true;
assert.equal(dayContext.calendarVisibleDayCount(), 3);
dayContext.window.matchMedia = () => ({ matches: true });
assert.equal(dayContext.calendarVisibleDayCount(), 2);

assert.equal((html.match(/data-calendar-visible-days=/g) || []).length, 4);
assert.match(app, /state\.calendarVisibleDays = count;[\s\S]*?saveState\(\);[\s\S]*?renderAll\(\);/);
assert.match(app, /const completionToggle = isWeekMode\(\) && \(trackable \|\| isExternalIcsEvent\(ev\)\)/);
assert.match(app, /recordExternalLocalOverrides\(ev, \{ completed: Boolean\(done\) \}\)/);
assert.match(app, /completed: localOverrides\.completed !== null \? localOverrides\.completed/);

assert.match(app, /class="event-check-hitbox"/);
assert.match(app, /function isEventControlTarget[\s\S]*?\.event-check-hitbox/);
assert.match(app, /checkbox\.addEventListener\('change'/);
assert.doesNotMatch(app, /checkbox\.addEventListener\('click'[\s\S]{0,120}toggleDone/);

assert.match(app, /createLane\.className = 'event-create-lane'/);
assert.match(app, /createSlot\.dataset\.slot = s/);
assert.match(app, /start: s,[\s\S]*?end: Math\.min\(s \+ 1, slotsPerDay\)/);
assert.match(app, /laneReservedWidth = createLaneWidth \/ laneCount/);

assert.match(css, /\.event-check[\s\S]*?width: 14px;[\s\S]*?height: 14px;/);
assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.event-check[\s\S]*?width: 12px;[\s\S]*?height: 12px;/);
assert.match(css, /\.event-create-lane[\s\S]*?width: 12px;[\s\S]*?z-index: 14;/);
assert.match(css, /grid-template-areas:[\s\S]*?"prev prev today next next"[\s\S]*?"date date date settings edit"/);

console.log("Calendar interaction tests passed");
