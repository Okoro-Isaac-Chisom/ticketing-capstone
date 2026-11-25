import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, createEvent, addTier, publishEvent, unpublishEvent, listEventSummaries,
  bookTickets, cancelBooking, findBookingByReference, joinWaitlist, nextOnWaitlist, seatsLeft,
} from '../src/domain/inventory.js';
import { makePublishedEvent, codeOf } from './helpers.js';

const validEvent = { title: 'Abuja Jazz Night', city: 'Abuja', venue: 'Eko Hotel', startsAt: '2026-12-05T17:00:00Z' };

// ---------- S02: create an event ----------
test('S02: creates a draft event with a new id, hidden from the public list', () => {
  const store = createStore();
  const event = createEvent(store, validEvent);
  assert.equal(event.status, 'DRAFT');
  assert.ok(event.id);
  assert.equal(listEventSummaries(store).length, 0);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
});

test('S02: missing title/city or a fake date is VALIDATION and saves nothing', () => {
  const store = createStore();
  assert.equal(codeOf(() => createEvent(store, { ...validEvent, title: '' })), 'VALIDATION');
  assert.equal(codeOf(() => createEvent(store, { ...validEvent, city: undefined })), 'VALIDATION');
  assert.equal(codeOf(() => createEvent(store, { ...validEvent, startsAt: 'not a date' })), 'VALIDATION');
  assert.equal(codeOf(() => createEvent(store, { ...validEvent, startsAt: '2026-02-30' })), 'VALIDATION');
  assert.equal(store.events.size, 0);
});

// ---------- S03: ticket tiers ----------
test('S03: adds a tier with 0 sold and 100 seats left', () => {
  const store = createStore();
  const event = createEvent(store, validEvent);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });
  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 100);
});

test('S03: bad price or capacity is VALIDATION', () => {
  const store = createStore();
  const event = createEvent(store, validEvent);
  assert.equal(codeOf(() => addTier(store, event.id, { name: 'G', priceCents: 12.5, capacity: 10 })), 'VALIDATION');
  assert.equal(codeOf(() => addTier(store, event.id, { name: 'G', priceCents: 100, capacity: 0 })), 'VALIDATION');
  assert.equal(event.tiers.size, 0);
});

test('S03: unknown event id is NOT_FOUND', () => {
  assert.equal(codeOf(() => addTier(createStore(), 'nope', { name: 'G', priceCents: 1, capacity: 1 })), 'NOT_FOUND');
});

// ---------- S04: publish / unpublish (proposed criteria, see docs/s04-criteria.md) ----------
test('S04: publishing an event with a tier makes it public', () => {
  const store = createStore();
  const { event } = makePublishedEvent(store);
  assert.equal(event.status, 'PUBLISHED');
  assert.equal(listEventSummaries(store).length, 1);
});

test('S04: publishing with no tiers is INVALID_STATE and it stays a draft', () => {
  const store = createStore();
  const event = createEvent(store, validEvent);
  assert.equal(codeOf(() => publishEvent(store, event.id)), 'INVALID_STATE');
  assert.equal(event.status, 'DRAFT');
});

test('S04: unpublishing hides the event again; unknown id is NOT_FOUND', () => {
  const store = createStore();
  const { event } = makePublishedEvent(store);
  unpublishEvent(store, event.id);
  assert.equal(listEventSummaries(store).length, 0);
  assert.equal(codeOf(() => publishEvent(store, 'nope')), 'NOT_FOUND');
});

// ---------- S06: booking ----------
test('S06: booking 2 of 3 seats makes a PENDING booking priced in whole cents', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store);
  const b = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  assert.equal(b.status, 'pending');
  assert.equal(b.quantity, 2);
  assert.equal(b.totalCents, 1000000);
  assert.equal(seatsLeft(tier), 1);
});

test('S06: asking for 2 when 1 is left is SOLD_OUT and changes nothing', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store);
  bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  assert.equal(codeOf(() => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo', quantity: 2 })), 'SOLD_OUT');
  assert.equal(seatsLeft(tier), 1);
  assert.equal(store.bookings.size, 1);
});

test('S06: quantity 0, negative, fractional or above 10 is VALIDATION', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store, {}, { capacity: 50 });
  for (const quantity of [0, -1, 1.5, 11]) {
    assert.equal(codeOf(() => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity })), 'VALIDATION');
  }
  assert.equal(tier.sold, 0);
});

test('S06: a draft event cannot be booked (INVALID_STATE)', () => {
  const store = createStore();
  const event = createEvent(store, validEvent);
  const tier = addTier(store, event.id, { name: 'G', priceCents: 100, capacity: 5 });
  assert.equal(codeOf(() => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 1 })), 'INVALID_STATE');
});

// ---------- cancel, lookup, waitlist (from Build 1) ----------
test('cancel releases seats once; cancelling twice is ALREADY_CANCELLED', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store);
  const b = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  cancelBooking(store, b.id);
  assert.equal(seatsLeft(tier), 3);
  assert.equal(codeOf(() => cancelBooking(store, b.id)), 'ALREADY_CANCELLED');
  assert.equal(seatsLeft(tier), 3);
  assert.equal(codeOf(() => cancelBooking(store, 'nope')), 'NOT_FOUND');
});

test('finds a booking by reference', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store);
  const b = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 1 });
  assert.equal(findBookingByReference(store, b.reference).id, b.id);
  assert.equal(findBookingByReference(store, 'ZZZZZZ'), undefined);
});

test('waitlist is first-in-first-out', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store);
  assert.equal(joinWaitlist(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo' }), 1);
  assert.equal(joinWaitlist(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Dede' }), 2);
  assert.equal(nextOnWaitlist(store, tier.id).attendeeName, 'Bayo');
});

test('a refunded booking cannot be cancelled (INVALID_TRANSITION)', () => {
  const store = createStore();
  const { event, tier } = makePublishedEvent(store);
  const b = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 1 });
  b.status = 'refunded'; // (payment and refund arrive in later builds)
  assert.equal(codeOf(() => cancelBooking(store, b.id)), 'INVALID_TRANSITION');
  assert.equal(seatsLeft(tier), 2); // seats were not released again
});
