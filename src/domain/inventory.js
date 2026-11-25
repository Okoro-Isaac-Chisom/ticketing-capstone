import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { requireText, requireWholeNumber, parseDate } from './validation.js';
import { BOOKING_STATES, assertTransition } from './bookingStateMachine.js';

const MAX_TICKETS_PER_BOOKING = 10;

// ---------- the store ----------
// Everything lives in memory in Maps so lookups by key are O(1).
export function createStore() {
  return {
    events: new Map(),              // eventId   -> event
    bookings: new Map(),            // bookingId -> booking
    bookingsByReference: new Map(), // reference -> booking (fast lookup)
    waitlists: new Map(),           // tierId    -> Queue of waiting people
  };
}

function getEvent(store, eventId) {
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', `Event ${eventId} not found`);
  return event;
}

function getTier(event, tierId) {
  const tier = event.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', `Tier ${tierId} not found`);
  return tier;
}

// S02: a new event is always a DRAFT (hidden from the public list).
export function createEvent(store, { title, city, venue, startsAt }) {
  title = requireText(title, 'title');
  city = requireText(city, 'city');
  venue = requireText(venue, 'venue');
  parseDate(startsAt, 'startsAt'); // throws VALIDATION for a non-date like 2026-02-30
  const event = { id: newId(), title, city, venue, startsAt, status: 'DRAFT', tiers: new Map() };
  store.events.set(event.id, event);
  return event;
}

// S03: add a ticket tier (price in whole cents, capacity >= 1).
export function addTier(store, eventId, { name, priceCents, capacity }) {
  const event = getEvent(store, eventId); // NOT_FOUND if the event does not exist
  name = requireText(name, 'tier name');
  requireWholeNumber(priceCents, 'priceCents', 0);
  requireWholeNumber(capacity, 'capacity', 1);
  const tier = { id: newId(), name, priceCents, capacity, sold: 0 };
  event.tiers.set(tier.id, tier);
  return tier;
}

// Seats still available in a tier.
export function seatsLeft(tier) {
  return tier.capacity - tier.sold;
}

// S04: publish / unpublish.
export function publishEvent(store, eventId) {
  const event = getEvent(store, eventId);
  if (event.tiers.size === 0) {
    throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
  }
  event.status = 'PUBLISHED';
  return event;
}

export function unpublishEvent(store, eventId) {
  const event = getEvent(store, eventId);
  event.status = 'DRAFT';
  return event;
}

// Flat, read-only view of events used by search and the public list.
// Drafts are hidden unless publishedOnly is false.
export function listEventSummaries(store, { publishedOnly = true } = {}) {
  const summaries = [];
  for (const event of store.events.values()) {
    if (publishedOnly && event.status !== 'PUBLISHED') continue;
    const tiers = [...event.tiers.values()];
    summaries.push({
      id: event.id,
      title: event.title,
      city: event.city,
      venue: event.venue,
      startsAt: event.startsAt,
      status: event.status,
      cheapestPriceCents: tiers.length ? Math.min(...tiers.map((t) => t.priceCents)) : null,
      seatsLeft: tiers.reduce((sum, t) => sum + seatsLeft(t), 0),
    });
  }
  return summaries;
}

// S06: book tickets. The booking starts as PENDING (payment comes in Build 4).
export function bookTickets(store, { eventId, tierId, attendeeName, quantity }) {
  // 1. Validate EVERYTHING first, before changing any state.
  const event = getEvent(store, eventId);
  const tier = getTier(event, tierId);
  attendeeName = requireText(attendeeName, 'attendeeName');
  requireWholeNumber(quantity, 'quantity', 1);
  if (quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity cannot exceed ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (event.status !== 'PUBLISHED') {
    throw new DomainError('INVALID_STATE', 'Tickets can only be booked for a published event');
  }

  // 2. Capacity rule: not enough seats -> throw, nothing has changed yet.
  if (quantity > seatsLeft(tier)) {
    throw new DomainError('SOLD_OUT', `Only ${seatsLeft(tier)} seat(s) left in ${tier.name}`);
  }

  // 3. Make the booking. Only now do we mutate state.
  let reference = newReference();
  while (store.bookingsByReference.has(reference)) reference = newReference(); // avoid rare clash

  const booking = {
    id: newId(),
    reference,
    eventId,
    tierId,
    attendeeName,
    quantity,
    totalCents: tier.priceCents * quantity, // integer math, no rounding issues
    status: BOOKING_STATES.PENDING,
  };
  tier.sold += quantity;
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(booking.reference, booking);
  return booking;
}

export function cancelBooking(store, bookingId) {
  const booking = store.bookings.get(bookingId);
  if (!booking) throw new DomainError('NOT_FOUND', `Booking ${bookingId} not found`);
  if (booking.status === BOOKING_STATES.CANCELLED) {
    throw new DomainError('ALREADY_CANCELLED', 'Booking is already cancelled');
  }
  // Refunded or checked-in bookings cannot be cancelled: the state machine refuses.
  assertTransition(booking.status, BOOKING_STATES.CANCELLED);
  // Release the seats exactly once (the status check above guards this).
  const tier = getTier(getEvent(store, booking.eventId), booking.tierId);
  tier.sold -= booking.quantity;
  booking.status = BOOKING_STATES.CANCELLED;
  return booking;
}

// O(1) thanks to the Map (Array.find would be O(n)).
export function findBookingByReference(store, reference) {
  return store.bookingsByReference.get(reference);
}

export function joinWaitlist(store, { eventId, tierId, attendeeName }) {
  const event = getEvent(store, eventId);
  getTier(event, tierId);
  attendeeName = requireText(attendeeName, 'attendeeName');

  let queue = store.waitlists.get(tierId);
  if (!queue) {
    queue = new Queue();
    store.waitlists.set(tierId, queue);
  }
  queue.enqueue({ attendeeName, joinedAt: new Date().toISOString() });
  return queue.size; // position in line (1 = first)
}

// Who is first in line for a tier right now (does not remove them).
export function nextOnWaitlist(store, tierId) {
  return store.waitlists.get(tierId)?.peek();
}
