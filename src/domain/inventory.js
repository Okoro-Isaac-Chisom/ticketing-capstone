import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';

const MAX_TICKETS_PER_BOOKING = 10;

// ---------- small validation helpers ----------
function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} must be a non-empty string`);
  }
  return value.trim();
}

// Money is ALWAYS whole cents (integers), never decimals like 12.50.
function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number >= ${min}`);
  }
  return value;
}

// ---------- the store ----------
// Everything lives in memory in Maps so lookups by key are O(1).
export function createStore() {
  return {
    events: new Map(),            // eventId   -> event
    bookings: new Map(),          // bookingId -> booking
    bookingsByReference: new Map(), // reference -> booking (fast lookup)
    waitlists: new Map(),         // tierId    -> Queue of waiting people
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

export function createEvent(store, { name, startsAt }) {
  name = requireText(name, 'name');
  if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date string');
  }
  const event = { id: newId(), name, startsAt, tiers: new Map() };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, { name, priceCents, capacity }) {
  const event = getEvent(store, eventId);
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

export function bookTickets(store, { eventId, tierId, attendeeName, quantity }) {
  // 1. Validate EVERYTHING first, before changing any state.
  const event = getEvent(store, eventId);
  const tier = getTier(event, tierId);
  attendeeName = requireText(attendeeName, 'attendeeName');
  requireWholeNumber(quantity, 'quantity', 1);
  if (quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity cannot exceed ${MAX_TICKETS_PER_BOOKING}`);
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
    status: 'CONFIRMED',
  };
  tier.sold += quantity;
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(booking.reference, booking);
  return booking;
}

export function cancelBooking(store, bookingId) {
  const booking = store.bookings.get(bookingId);
  if (!booking) throw new DomainError('NOT_FOUND', `Booking ${bookingId} not found`);
  if (booking.status === 'CANCELLED') {
    throw new DomainError('ALREADY_CANCELLED', 'Booking is already cancelled');
  }
  // Release the seats exactly once (the status check above guards this).
  const tier = getTier(getEvent(store, booking.eventId), booking.tierId);
  tier.sold -= booking.quantity;
  booking.status = 'CANCELLED';
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
