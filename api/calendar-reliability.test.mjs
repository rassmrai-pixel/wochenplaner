import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const handler = require('./send-calendar-invitation.js');
const originalFetch = global.fetch;
const email = { resendApiKey: 'test', fromEmail: 'calendar@example.com', organizerName: 'Test' };
const args = { to: ['guest@example.com'], subject: 'Test', text: 'Test', html: '<p>Test</p>', ics: 'test', method: 'REQUEST', email };
try {
  for (const failure of ['network', 'server']) {
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push(options);
      if (requests.length === 1) {
        if (failure === 'network') throw new TypeError('fetch failed');
        return new Response('temporary', { status: 503 });
      }
      return new Response('{}', { status: 200 });
    };
    await handler._test.sendViaResend(args);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
    assert.equal(requests[0].body, requests[1].body);
  }
  let calls = 0;
  global.fetch = async () => { calls++; return new Response('invalid recipient', { status: 422 }); };
  await assert.rejects(handler._test.sendViaResend(args));
  assert.equal(calls, 1);

  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.RESEND_API_KEY = 'test';
  const state = { weekEventsByWeek: { '2026-10-26': [{ id: 'one', label: 'Test', entryType: 'calendar', source: 'extra', day: 0, start: 36, end: 44, participants: [{ email: 'guest@example.com' }] }] } };
  let sent = 0;
  global.fetch = async (url, options = {}) => {
    if (url.includes('/auth/')) return Response.json({ id: 'user' });
    if (url.includes('api.resend.com')) { sent++; return Response.json({ id: 'mail' }); }
    if (options.method === 'PATCH') return new Response('database unavailable', { status: 503 });
    return Response.json([{ data: state }]);
  };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { eventId: 'one', weekKey: '2026-10-26' } }, res);
  assert.equal(sent, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.statusPersisted, false);
} finally { global.fetch = originalFetch; }

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = source.indexOf('  function startDrag(');
const end = source.indexOf('  function canMoveEventAcrossDays(', start);
const listeners = {};
let draft;
const context = {
  bulkSelectionMode: false, isDragging: false, dragDay: null, dragStart: null, dragEnd: null,
  slotsPerDay: 96, clamp: (x, min, max) => Math.max(min, Math.min(max, x)),
  clearSelection() {}, isTemplateMode: () => false, openEditor: (_, value) => { draft = value; },
  document: { querySelectorAll: () => [], querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 960, height: 960 }) }), addEventListener: (name, fn) => { listeners[name] = fn; } },
  window: { addEventListener() {} }
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
context.startDrag({ button: 0, preventDefault() {} }, 0, 36);
listeners.mousemove({ clientX: 95, clientY: 439 });
listeners.mouseup({ clientX: 95, clientY: 439 });
assert.equal(draft.start, 36);
assert.equal(draft.end, 44);
assert.equal(draft.day, 0);
context.startDrag({ button: 0, preventDefault() {} }, 0, 43);
listeners.mouseup({ clientX: 95, clientY: 360 });
assert.equal(draft.start, 36);
assert.equal(draft.end, 44);
console.log('Calendar range and reliability tests passed');
