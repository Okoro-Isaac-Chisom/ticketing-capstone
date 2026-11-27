import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createApp } from '../src/http/app.js';
import { bookNaively } from '../scripts/lib/naiveBooking.js';

const PEOPLE = 50;
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// An event whose tier has `capacity` seats, published and ready to book.
async function setup(makeRepo, capacity) {
  const db = openDatabase(':memory:');
  const repo = makeRepo(db);
  const events = createEventService({ repo });
  const event = await events.createEvent('org-1', { title: 'Last Ticket Gala', city: 'Lagos', venue: 'Hall', startsAt: '2027-03-20T18:00:00Z' });
  const tier = await events.addTier('org-1', event.id, { name: 'General', priceCents: 100, capacity });
  await events.publish('org-1', event.id);
  const bookings = createBookingService({ repo, gateway: createMockPaymentGateway() });
  return { db, repo, bookings, eventId: event.id, tierId: tier.id };
}

const repositories = {
  sqlite: (db) => createSqliteRepository(db),
  memory: () => createMemoryRepository(),
};

for (const [name, makeRepo] of Object.entries(repositories)) {
  describe(`S08 overselling (${name} repository)`, () => {
    test('50 people, 1 seat: exactly 1 booking, 49 SOLD_OUT, sold never exceeds capacity', async () => {
      const { repo, bookings, eventId, tierId } = await setup(makeRepo, 1);
      const results = await Promise.allSettled(
        Array.from({ length: PEOPLE }, (_, i) => bookings.book(`person-${i}`, { eventId, tierId, quantity: 1 })),
      );
      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');
      assert.equal(won.length, 1);
      assert.equal(lost.length, PEOPLE - 1);
      assert.ok(lost.every((r) => r.reason.code === 'SOLD_OUT'), 'every loser gets SOLD_OUT, not a crash');
      assert.equal((await repo.getTier(tierId)).sold, 1);
    });

    test('50 people, 5 seats: exactly 5 succeed and sold is exactly 5', async () => {
      const { repo, bookings, eventId, tierId } = await setup(makeRepo, 5);
      const results = await Promise.allSettled(
        Array.from({ length: PEOPLE }, (_, i) => bookings.book(`person-${i}`, { eventId, tierId, quantity: 1 })),
      );
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
      assert.equal((await repo.getTier(tierId)).sold, 5);
    });

    test('mixed quantities never exceed capacity', async () => {
      const { repo, bookings, eventId, tierId } = await setup(makeRepo, 7);
      const results = await Promise.allSettled(
        Array.from({ length: 30 }, (_, i) => bookings.book(`person-${i}`, { eventId, tierId, quantity: (i % 3) + 1 })),
      );
      const seatsTaken = results.filter((r) => r.status === 'fulfilled').reduce((sum, r) => sum + r.value.quantity, 0);
      const tier = await repo.getTier(tierId);
      assert.ok(tier.sold <= tier.capacity);
      assert.equal(tier.sold, seatsTaken); // the count matches the bookings that really exist
    });

    test('two cancels at the same moment release the seats only once', async () => {
      const { repo, bookings, eventId, tierId } = await setup(makeRepo, 3);
      const booking = await bookings.book('ada', { eventId, tierId, quantity: 2 });
      const results = await Promise.allSettled([
        bookings.cancel('ada', booking.reference),
        bookings.cancel('ada', booking.reference),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal((await repo.getTier(tierId)).sold, 0); // 2 seats released once, not 4
    });
  });
}

// ---- The same race through the real HTTP server ----
test('S08 over HTTP: 50 simultaneous requests for 1 seat give one 201 and 49 409', async () => {
  const db = openDatabase(':memory:');
  const repo = createSqliteRepository(db);
  const server = createApp({ publicDir, repo, logger: { error() {} } });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const call = (path, user, body) => fetch(base + path, { method: 'POST', headers: { 'x-user-id': user, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const event = await (await call('/api/events', 'org-1', { title: 'HTTP Gala', city: 'Lagos', venue: 'Hall', startsAt: '2027-03-20T18:00:00Z' })).json();
    const tier = await (await call(`/api/events/${event.id}/tiers`, 'org-1', { name: 'G', priceCents: 100, capacity: 1 })).json();
    await call(`/api/events/${event.id}/publish`, 'org-1');

    const responses = await Promise.all(
      Array.from({ length: PEOPLE }, (_, i) => call('/api/bookings', `person-${i}`, { eventId: event.id, tierId: tier.id, quantity: 1 })),
    );
    const statuses = responses.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 201).length, 1);
    assert.equal(statuses.filter((s) => s === 409).length, PEOPLE - 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---- Control: proves this kind of test CAN detect the bug ----
test('CONTROL: the old read-check-save logic DOES oversell (so these tests are meaningful)', async () => {
  const { db, repo, eventId, tierId } = await setup(repositories.sqlite, 1);
  const results = await Promise.allSettled(
    Array.from({ length: PEOPLE }, (_, i) => bookNaively({ repo, db, userId: `person-${i}`, eventId, tierId, quantity: 1 })),
  );
  const won = results.filter((r) => r.status === 'fulfilled').length;
  assert.ok(won > 1, `expected overselling, but only ${won} booking(s) succeeded`);
});
