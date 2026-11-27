import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// A gateway that counts how many times a card was charged ("charged only once").
const realGateway = createMockPaymentGateway();
let charges = 0;
const countingGateway = { charge: async (args) => { const r = await realGateway.charge(args); if (r.ok) charges++; return r; } };

// Runs the SAME API tests against any repository (memory or SQLite).
export function defineApiTests(label, makeRepo) {
describe(label, () => {
let server;
let base;
before(async () => {
  server = createApp({ publicDir, repo: makeRepo(), gateway: countingGateway, logger: { error() {} } });
  await new Promise((resolve) => server.listen(0, resolve)); // port 0 = any free port
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

// Send a real HTTP request. Every error must have the SAME shape, so we check it here once.
async function api(method, path, { user, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(user ? { 'x-user-id': user } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (res.status >= 400) {
    assert.deepEqual(Object.keys(json), ['error']);
    assert.equal(typeof json.error.code, 'string');
    assert.equal(typeof json.error.message, 'string');
  }
  return { status: res.status, json };
}

const eventBody = (over = {}) => ({ title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark', startsAt: '2026-12-05T17:00:00Z', ...over });

// Create an event, add a tier and publish it. Returns ids for later calls.
async function publishedEvent({ organizer = 'org-1', event = {}, tier = {} } = {}) {
  const e = await api('POST', '/api/events', { user: organizer, body: eventBody(event) });
  const t = await api('POST', `/api/events/${e.json.id}/tiers`, { user: organizer, body: { name: 'General', priceCents: 500000, capacity: 3, ...tier } });
  await api('POST', `/api/events/${e.json.id}/publish`, { user: organizer });
  return { eventId: e.json.id, tierId: t.json.id };
}

const book = (user, eventId, tierId, quantity) => api('POST', '/api/bookings', { user, body: { eventId, tierId, quantity } });

// ---------- S02 ----------
test('S02: creates a draft event that is not on the public list', async () => {
  const r = await api('POST', '/api/events', { user: 'org-1', body: eventBody({ title: 'Secret Draft Gala' }) });
  assert.equal(r.status, 201);
  assert.equal(r.json.status, 'DRAFT');
  assert.ok(r.json.id);
  const list = await api('GET', '/api/events?q=secret');
  assert.deepEqual(list.json.events, []);
});

test('S02: bad input is 400 VALIDATION; no header is 401', async () => {
  const bad = await api('POST', '/api/events', { user: 'org-1', body: eventBody({ city: '' }) });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'VALIDATION');
  const fake = await api('POST', '/api/events', { user: 'org-1', body: eventBody({ startsAt: '2026-02-30' }) });
  assert.equal(fake.json.error.code, 'VALIDATION');
  const anon = await api('POST', '/api/events', { body: eventBody() });
  assert.equal(anon.status, 401);
  assert.equal(anon.json.error.code, 'UNAUTHENTICATED');
  const notObject = await api('POST', '/api/events', { user: 'org-1', body: [1, 2] });
  assert.equal(notObject.status, 400);
});

// ---------- S03 ----------
test('S03: adds a tier with 0 sold and 100 seats left', async () => {
  const e = await api('POST', '/api/events', { user: 'org-1', body: eventBody() });
  const t = await api('POST', `/api/events/${e.json.id}/tiers`, { user: 'org-1', body: { name: 'General', priceCents: 500000, capacity: 100 } });
  assert.equal(t.status, 201);
  assert.equal(t.json.sold, 0);
  assert.equal(t.json.seatsLeft, 100);
});

test('S03: bad price/capacity 400, unknown event 404, someone else\'s event 403', async () => {
  const e = await api('POST', '/api/events', { user: 'org-1', body: eventBody() });
  const url = `/api/events/${e.json.id}/tiers`;
  assert.equal((await api('POST', url, { user: 'org-1', body: { name: 'G', priceCents: 9.5, capacity: 5 } })).json.error.code, 'VALIDATION');
  assert.equal((await api('POST', url, { user: 'org-1', body: { name: 'G', priceCents: 100, capacity: 0 } })).json.error.code, 'VALIDATION');
  assert.equal((await api('POST', '/api/events/nope/tiers', { user: 'org-1', body: { name: 'G', priceCents: 1, capacity: 1 } })).status, 404);
  const other = await api('POST', url, { user: 'org-2', body: { name: 'G', priceCents: 100, capacity: 5 } });
  assert.equal(other.status, 403);
  assert.equal(other.json.error.code, 'FORBIDDEN');
});

// ---------- S04 ----------
test('S04: publishing without tiers is 409 INVALID_STATE; with a tier it goes public; unpublish hides it', async () => {
  const e = await api('POST', '/api/events', { user: 'org-1', body: eventBody({ title: 'Publish Test Fest' }) });
  const early = await api('POST', `/api/events/${e.json.id}/publish`, { user: 'org-1' });
  assert.equal(early.status, 409);
  assert.equal(early.json.error.code, 'INVALID_STATE');

  await api('POST', `/api/events/${e.json.id}/tiers`, { user: 'org-1', body: { name: 'G', priceCents: 100, capacity: 5 } });
  assert.equal((await api('POST', `/api/events/${e.json.id}/publish`, { user: 'org-2' })).status, 403);
  const pub = await api('POST', `/api/events/${e.json.id}/publish`, { user: 'org-1' });
  assert.equal(pub.json.status, 'PUBLISHED');
  assert.equal((await api('GET', '/api/events?q=publish test')).json.events.length, 1);

  await api('POST', `/api/events/${e.json.id}/unpublish`, { user: 'org-1' });
  assert.equal((await api('GET', '/api/events?q=publish test')).json.events.length, 0);
});

test('a draft is hidden from other people but visible to its organizer', async () => {
  const e = await api('POST', '/api/events', { user: 'org-1', body: eventBody() });
  assert.equal((await api('GET', `/api/events/${e.json.id}`)).status, 404);
  assert.equal((await api('GET', `/api/events/${e.json.id}`, { user: 'org-1' })).status, 200);
});

// ---------- S05 ----------
test('S05: search, filter and sort through query parameters', async () => {
  await publishedEvent({ event: { title: 'Abuja Jazz Night', city: 'Abuja', startsAt: '2027-02-01T19:00:00Z' }, tier: { priceCents: 300000 } });
  await publishedEvent({ event: { title: 'Abuja Cheap Expo', city: 'Abuja', startsAt: '2027-02-02T19:00:00Z' }, tier: { priceCents: 100000 } });
  await publishedEvent({ event: { title: 'Lagos Pricey Gala', city: 'Lagos', startsAt: '2027-02-03T19:00:00Z' }, tier: { priceCents: 900000 } });

  const jazz = await api('GET', '/api/events?q=JAZZ');
  assert.deepEqual(jazz.json.events.map((e) => e.title), ['Abuja Jazz Night']);

  const abuja = await api('GET', '/api/events?city=abuja&from=2027-01-01&to=2027-12-31&sort=price');
  assert.deepEqual(abuja.json.events.map((e) => e.title), ['Abuja Cheap Expo', 'Abuja Jazz Night']);

  const cheap = await api('GET', '/api/events?maxPriceCents=300000&from=2027-01-01&sort=price');
  assert.deepEqual(cheap.json.events.map((e) => e.title), ['Abuja Cheap Expo', 'Abuja Jazz Night']);

  // a date-only "to" includes that whole day
  const day = await api('GET', '/api/events?from=2027-02-03&to=2027-02-03');
  assert.deepEqual(day.json.events.map((e) => e.title), ['Lagos Pricey Gala']);
});

test('S05: bad date, bad price, bad sort and bad onlyAvailable are 400 VALIDATION', async () => {
  for (const query of ['from=yesterday', 'to=2026-02-30', 'maxPriceCents=12.5', 'maxPriceCents=abc', 'sort=colour', 'onlyAvailable=maybe']) {
    const r = await api('GET', `/api/events?${query}`);
    assert.equal(r.status, 400, query);
    assert.equal(r.json.error.code, 'VALIDATION', query);
  }
});

// ---------- S06 ----------
test('S06: books 2 of 3 seats: pending booking, whole cents, 1 seat left', async () => {
  const { eventId, tierId } = await publishedEvent();
  const r = await book('ada', eventId, tierId, 2);
  assert.equal(r.status, 201);
  assert.equal(r.json.status, 'pending');
  assert.equal(r.json.totalCents, 1000000);
  assert.ok(r.json.reference);
  const detail = await api('GET', `/api/events/${eventId}`);
  assert.equal(detail.json.tiers[0].seatsLeft, 1);
});

test('S06: 2 tickets when 1 is left is 409 SOLD_OUT and changes nothing', async () => {
  const { eventId, tierId } = await publishedEvent();
  await book('ada', eventId, tierId, 2);
  const r = await book('bayo', eventId, tierId, 2);
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'SOLD_OUT');
  assert.equal((await api('GET', `/api/events/${eventId}`)).json.tiers[0].seatsLeft, 1);
});

test('S06: quantity 0, negative, fractional or above 10 is 400; a draft event is 409; a wrong tier is 404', async () => {
  const { eventId, tierId } = await publishedEvent({ tier: { capacity: 50 } });
  for (const q of [0, -1, 1.5, 11, '2']) {
    assert.equal((await book('ada', eventId, tierId, q)).json.error.code, 'VALIDATION', String(q));
  }
  const draft = await api('POST', '/api/events', { user: 'org-1', body: eventBody() });
  const dt = await api('POST', `/api/events/${draft.json.id}/tiers`, { user: 'org-1', body: { name: 'G', priceCents: 1, capacity: 5 } });
  assert.equal((await book('ada', draft.json.id, dt.json.id, 1)).json.error.code, 'INVALID_STATE');
  assert.equal((await book('ada', eventId, dt.json.id, 1)).status, 404); // tier belongs to a different event
  assert.equal((await book('', eventId, tierId, 1)).status, 401);
});

// ---------- S07 ----------
test('S07: paying a pending booking makes it paid and shows the reference', async () => {
  const { eventId, tierId } = await publishedEvent();
  const b = await book('ada', eventId, tierId, 1);
  const paid = await api('POST', `/api/bookings/${b.json.reference}/pay`, { user: 'ada' });
  assert.equal(paid.status, 200);
  assert.equal(paid.json.status, 'paid');
  assert.equal(paid.json.reference, b.json.reference);
});

test('S07: a declined card is 402, the booking stays pending, and a retry works', async () => {
  const { eventId, tierId } = await publishedEvent();
  const b = await book('ada', eventId, tierId, 1);
  const url = `/api/bookings/${b.json.reference}/pay`;
  const declined = await api('POST', url, { user: 'ada', body: { mockCard: 'declined' } });
  assert.equal(declined.status, 402);
  assert.equal(declined.json.error.code, 'PAYMENT_DECLINED');
  assert.equal((await api('GET', `/api/bookings/${b.json.reference}`, { user: 'ada' })).json.status, 'pending');
  assert.equal((await api('POST', url, { user: 'ada' })).json.status, 'paid');
});

test('S07: paying a cancelled booking is 409 INVALID_TRANSITION', async () => {
  const { eventId, tierId } = await publishedEvent();
  const b = await book('ada', eventId, tierId, 1);
  await api('POST', `/api/bookings/${b.json.reference}/cancel`, { user: 'ada' });
  const r = await api('POST', `/api/bookings/${b.json.reference}/pay`, { user: 'ada' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'INVALID_TRANSITION');
});

test('S07: paying twice is refused and the card is charged only once', async () => {
  const { eventId, tierId } = await publishedEvent();
  const b = await book('ada', eventId, tierId, 1);
  const before = charges;
  await api('POST', `/api/bookings/${b.json.reference}/pay`, { user: 'ada' });
  const again = await api('POST', `/api/bookings/${b.json.reference}/pay`, { user: 'ada' });
  assert.equal(again.status, 409);
  assert.equal(charges - before, 1);
});

test('only the person who made a booking can pay for, cancel or view it', async () => {
  const { eventId, tierId } = await publishedEvent();
  const b = await book('ada', eventId, tierId, 1);
  for (const [method, suffix] of [['POST', '/pay'], ['POST', '/cancel'], ['GET', '']]) {
    const r = await api(method, `/api/bookings/${b.json.reference}${suffix}`, { user: 'bayo' });
    assert.equal(r.status, 403, suffix);
  }
  assert.equal((await api('POST', '/api/bookings/ZZZZZZ/pay', { user: 'ada' })).status, 404);
  assert.equal((await api('POST', `/api/bookings/${b.json.reference}/pay`, { user: 'ada', body: { mockCard: '4242424242424242' } })).json.error.code, 'VALIDATION');
});

// ---------- cancel ----------
test('cancelling an unpaid booking releases the seats once; twice is 409; a paid booking cannot be cancelled yet', async () => {
  const { eventId, tierId } = await publishedEvent();
  const b = await book('ada', eventId, tierId, 2);
  const url = `/api/bookings/${b.json.reference}/cancel`;
  assert.equal((await api('POST', url, { user: 'ada' })).json.status, 'cancelled');
  assert.equal((await api('GET', `/api/events/${eventId}`)).json.tiers[0].seatsLeft, 3);
  const again = await api('POST', url, { user: 'ada' });
  assert.equal(again.json.error.code, 'ALREADY_CANCELLED');
  assert.equal((await api('GET', `/api/events/${eventId}`)).json.tiers[0].seatsLeft, 3);

  const p = await book('ada', eventId, tierId, 1);
  await api('POST', `/api/bookings/${p.json.reference}/pay`, { user: 'ada' });
  assert.equal((await api('POST', `/api/bookings/${p.json.reference}/cancel`, { user: 'ada' })).json.error.code, 'INVALID_STATE');
});

test('an unknown API path still uses the standard error shape', async () => {
  const r = await api('GET', '/api/does-not-exist');
  assert.equal(r.status, 404);
});

});
}
