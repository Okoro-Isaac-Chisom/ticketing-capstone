import {
  createStore, createEvent, addTier, publishEvent,
} from '../src/domain/inventory.js';

// Build a published event with one tier. Used by many tests.
export function makePublishedEvent(store, overrides = {}, tier = {}) {
  const event = createEvent(store, {
    title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark', startsAt: '2026-12-05T17:00:00Z',
    ...overrides,
  });
  const t = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 3, ...tier });
  publishEvent(store, event.id);
  return { event, tier: t };
}

// Assert that a function throws a DomainError with the given code.
export function codeOf(fn) {
  try { fn(); } catch (err) { return err.code; }
  return null; // nothing was thrown
}

export { createStore };
