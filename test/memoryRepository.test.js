import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { codeOf } from './helpers.js';

test('the repository returns copies: changing one does not change the stored data', async () => {
  const repo = createMemoryRepository();
  await repo.insertTier({ id: 't1', eventId: 'e1', name: 'G', priceCents: 1, capacity: 5, sold: 0 });
  const copy = await repo.getTier('t1');
  copy.sold = 99;
  assert.equal((await repo.getTier('t1')).sold, 0);
});

test('missing records come back as undefined; updating a missing one throws', async () => {
  const repo = createMemoryRepository();
  assert.equal(await repo.getEvent('nope'), undefined);
  assert.equal(await repo.getBookingByReference('NOPE'), undefined);
  await assert.rejects(() => repo.updateEvent({ id: 'nope' }));
});

test('bookings can be found by reference', async () => {
  const repo = createMemoryRepository();
  await repo.insertBooking({ id: 'b1', reference: 'ABC234', status: 'pending' });
  assert.equal((await repo.getBookingByReference('ABC234')).id, 'b1');
});

test('mock gateway: success, decline, and only whole-cent amounts', async () => {
  const gateway = createMockPaymentGateway();
  assert.equal((await gateway.charge({ amountCents: 500, reference: 'R' })).ok, true);
  assert.equal((await gateway.charge({ amountCents: 500, reference: 'R', decline: true })).ok, false);
  await assert.rejects(() => gateway.charge({ amountCents: 5.5, reference: 'R' }));
});
