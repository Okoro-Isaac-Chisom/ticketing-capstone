import { DomainError } from './errors.js';
import { requireText, requireWholeNumber, parseDate } from './validation.js';

// Pure business rules: no I/O, no HTTP. Used by inventory.js (Build 1 demo)
// AND by the services (Build 4), so the rules exist in exactly one place.

export const MAX_TICKETS_PER_BOOKING = 10;

// S02: returns clean, trimmed fields or throws VALIDATION.
export function validateNewEvent({ title, city, venue, startsAt } = {}) {
  title = requireText(title, 'title');
  city = requireText(city, 'city');
  venue = requireText(venue, 'venue');
  parseDate(startsAt, 'startsAt'); // rejects non-dates such as 2026-02-30
  return { title, city, venue, startsAt };
}

// S03: price in whole cents, capacity at least 1.
export function validateNewTier({ name, priceCents, capacity } = {}) {
  name = requireText(name, 'tier name');
  requireWholeNumber(priceCents, 'priceCents', 0);
  requireWholeNumber(capacity, 'capacity', 1);
  return { name, priceCents, capacity };
}

// S06: 1 to 10 tickets, whole numbers only.
export function validateQuantity(quantity) {
  requireWholeNumber(quantity, 'quantity', 1);
  if (quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity cannot exceed ${MAX_TICKETS_PER_BOOKING}`);
  }
  return quantity;
}

// Seats still available in a tier.
export function seatsLeft(tier) {
  return tier.capacity - tier.sold;
}

// The flat view of an event that search and sorting work on.
export function toSummary(event, tiers) {
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    cheapestPriceCents: tiers.length ? Math.min(...tiers.map((t) => t.priceCents)) : null,
    seatsLeft: tiers.reduce((sum, t) => sum + seatsLeft(t), 0),
  };
}
