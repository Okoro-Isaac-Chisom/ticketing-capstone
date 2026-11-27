import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';

const event = (over = {}) => ({ id: 'e1', organizerId: 'org', title: 'T', city: 'Lagos', venue: 'V', startsAt: '2027-01-01T10:00:00Z', status: 'DRAFT', createdAt: '2026-01-01T00:00:00Z', ...over });
const tier = (over = {}) => ({ id: 't1', eventId: 'e1', name: 'G', priceCents: 100, capacity: 5, sold: 0, ...over });
const booking = (over = {}) => ({ id: 'b1', reference: 'ABC234', userId: 'u', eventId: 'e1', tierId: 't1', quantity: 1, totalCents: 100, status: 'pending', createdAt: '2026-01-01T00:00:00Z', ...over });

async function fresh() {
  const db = openDatabase(':memory:');
  const repo = createSqliteRepository(db);
  await repo.insertEvent(event());
  await repo.insertTier(tier());
  return { db, repo };
}

test('data survives closing and reopening the database file (a "restart")', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ticketing-'));
  const file = path.join(dir, 'test.db');
  try {
    const first = createSqliteRepository(openDatabase(file));
    await first.insertEvent(event({ title: 'Still here after restart' }));
    first.close();

    const second = createSqliteRepository(openDatabase(file));
    assert.equal((await second.getEvent('e1')).title, 'Still here after restart');
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('placeholders make SQL injection harmless: the text is stored, never run', async () => {
  const repo = createSqliteRepository(openDatabase(':memory:'));
  const evil = "x'); DROP TABLE events; --";
  await repo.insertEvent(event({ title: evil }));
  assert.equal((await repo.getEvent('e1')).title, evil);
  assert.equal((await repo.listEvents()).length, 1); // the table still exists
});

test('reserveSeats is all-or-nothing and releaseSeats never goes below zero', async () => {
  const { repo } = await fresh();
  assert.equal(await repo.reserveSeats('t1', 3), true);
  assert.equal(await repo.reserveSeats('t1', 3), false); // only 2 left
  assert.equal((await repo.getTier('t1')).sold, 3);       // the failed attempt changed nothing
  assert.equal(await repo.reserveSeats('t1', 2), true);
  assert.equal(await repo.releaseSeats('t1', 9), false);  // would go below 0
  assert.equal((await repo.getTier('t1')).sold, 5);
  assert.equal(await repo.reserveSeats('missing', 1), false);
});

test('the database itself refuses bad data (constraints are the last line of defence)', async () => {
  const { db, repo } = await fresh();
  assert.throws(() => db.prepare('UPDATE ticket_tiers SET sold = 99 WHERE id = ?').run('t1'), /constraint/i);   // sold > capacity
  assert.throws(() => db.prepare('UPDATE ticket_tiers SET sold = -1 WHERE id = ?').run('t1'), /constraint/i);   // sold < 0
  await repo.insertBooking(booking());
  await assert.rejects(() => repo.insertBooking(booking({ id: 'b2' })), /constraint/i);                          // duplicate reference
  await assert.rejects(() => repo.insertTier(tier({ id: 't2', eventId: 'no-such-event' })), /constraint/i);      // foreign key
  await assert.rejects(() => repo.insertTier(tier({ id: 't3', priceCents: -5 })), /constraint/i);                // negative price
  await assert.rejects(() => repo.insertEvent(event({ id: 'e2', status: 'WEIRD' })), /constraint/i);             // bad status
});

test('transitionBooking only moves a booking that still has the expected status', async () => {
  const { repo } = await fresh();
  await repo.insertBooking(booking());
  assert.equal(await repo.transitionBooking('ABC234', 'pending', 'paid', { chargeId: 'ch_1' }), true);
  assert.equal(await repo.transitionBooking('ABC234', 'pending', 'cancelled'), false); // it is no longer pending
  const saved = await repo.getBookingByReference('ABC234');
  assert.equal(saved.status, 'paid');
  assert.equal(saved.chargeId, 'ch_1');
});

test('missing rows come back as undefined and updating a missing event throws', async () => {
  const { repo } = await fresh();
  assert.equal(await repo.getEvent('nope'), undefined);
  assert.equal(await repo.getBookingByReference('NOPE99'), undefined);
  await assert.rejects(() => repo.updateEvent(event({ id: 'nope' })));
});
