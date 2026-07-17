import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");

const mainModal = html.match(/<div id="icsModal"[\s\S]*?<div id="icsExternalEventsModal"/)?.[0] || "";
const managementModal = html.match(/<div id="icsExternalEventsModal"[\s\S]*?<script src="js\/utils\.js"/)?.[0] || "";

assert.ok(mainModal.includes('id="openIcsExternalEventsManagerBtn"'));
assert.ok(!mainModal.includes('id="icsHiddenEventsList"'));
assert.ok(!mainModal.includes('id="icsDeletedEventsList"'));

assert.ok(managementModal.includes('role="dialog"'));
assert.ok(managementModal.includes('role="tablist"'));
assert.equal((managementModal.match(/role="tab"/g) || []).length, 2);
assert.equal((managementModal.match(/role="tabpanel"/g) || []).length, 2);
assert.ok(managementModal.includes('id="closeIcsExternalEventsManagerBtn"'));

assert.match(app, /activeIcsExternalEventsTab = hiddenExternalEvents\(\)\.length[\s\S]*?\? 'hidden' : 'deleted'/);
assert.match(app, /hiddenPanel\.hidden = !hiddenActive/);
assert.match(app, /deletedPanel\.hidden = hiddenActive/);
assert.match(app, /modal\.inert = true/);
assert.match(app, /modal\.inert = false/);
assert.match(app, /openManagerBtn\?\.focus\(\)/);
assert.match(app, /event\.key !== 'Tab'/);
assert.match(app, /document\.activeElement === last/);

assert.match(css, /\.ics-management-card[\s\S]*?overflow: hidden;[\s\S]*?display: flex;/);
assert.match(css, /\.ics-modal\.ics-management-modal[\s\S]*?z-index: 6002/);
assert.match(css, /\.ics-management-list-area[\s\S]*?overflow-y: auto;/);
assert.match(css, /\.ics-management-panel\[hidden\][\s\S]*?display: none;/);

console.log("ICS management UI tests passed");
