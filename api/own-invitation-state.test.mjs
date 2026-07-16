import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function extract(name, nextName) {
  const pattern = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\s*function ${nextName}\\b`);
  const match = appSource.match(pattern);
  assert.ok(match, `Function ${name} not found`);
  return match[0].replace(new RegExp(`\\n\\s*function ${nextName}\\b[\\s\\S]*$`), "");
}

const rememberSource = extract("rememberOwnInvitationUid", "logOwnInviteDebug");
const indexSource = extract("buildOwnInvitationUidIndex", "participantEmailsForEvent");
const matchSource = extract("findRoundtripLocalEvent", "markLocalEventMirrored");

let localEvents = [];
const context = {
  state: { ownInvitationUids: [] },
  String,
  Set,
  Map,
  Boolean,
  ownRoundtripCandidateEvents: () => localEvents,
  eventInviteUidCandidates: event => [event.invitationUid].filter(Boolean)
};
vm.createContext(context);
vm.runInContext(`${rememberSource}\n${indexSource}\n${matchSource}`, context);

context.rememberOwnInvitationUid("Own-Invite@Planner.example");
context.rememberOwnInvitationUid("own-invite@planner.example");
assert.deepEqual([...context.state.ownInvitationUids], ["own-invite@planner.example"]);

localEvents = [{ id: "local-1", invitationUid: "own-invite@planner.example" }];
let index = context.buildOwnInvitationUidIndex();
let match = context.findRoundtripLocalEvent(
  { sourceUid: "OWN-INVITE@PLANNER.EXAMPLE" },
  {},
  index
);
assert.equal(match.event.id, "local-1");
assert.equal(match.reason, "uid");

localEvents = [];
index = context.buildOwnInvitationUidIndex();
match = context.findRoundtripLocalEvent(
  { sourceUid: "own-invite@planner.example" },
  {},
  index
);
assert.equal(match.event, null);
assert.equal(match.reason, "known invitation uid");
assert.equal(context.findRoundtripLocalEvent({ sourceUid: "foreign@example.com" }, {}, index), null);

assert.ok(appSource.includes("if (roundtripMatch) {"));
assert.ok(appSource.includes("scheduleInvitedEventUpdate(ev, 'editor-save')"));
assert.ok(appSource.includes("scheduleInvitedEventUpdate(ev, 'drag-move')"));
assert.ok(appSource.includes("scheduleInvitedEventUpdate(ev, 'resize')"));
assert.ok(appSource.includes("scheduleInvitedEventUpdate(ev, 'bulk-move')"));

console.log("Own invitation identity tests passed");
