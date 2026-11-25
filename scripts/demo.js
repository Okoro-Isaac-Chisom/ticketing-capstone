import {
  createStore, createEvent, addTier, bookTickets, cancelBooking,
  findBookingByReference, joinWaitlist, nextOnWaitlist, seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

// Prints a heading so the terminal output reads like a story.
const step = (text) => console.log(`\n== ${text}`);

const store = createStore();
const event = createEvent(store, { name: 'Lagos Tech Night', startsAt: '2027-03-20T18:00:00Z' });
const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 3 });

step(`Event "${event.name}" with 3 seats`);

step('Ada books 2 of 3 seats');
const adaBooking = bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
console.log(`Booked ${adaBooking.quantity} seats, ref ${adaBooking.reference}, seats left: ${seatsLeft(tier)}`);

step('Bayo asks for 2 but only 1 seat is left');
try {
  bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo', quantity: 2 });
} catch (err) {
  if (!(err instanceof DomainError)) throw err; // only expect our own errors
  console.log(`Refused: ${err.code} - ${err.message}`);
}

step('Chidi takes the last seat: the event sells out');
bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Chidi', quantity: 1 });
console.log(`Seats left: ${seatsLeft(tier)}`);

step('Bayo and Dede join the waitlist');
console.log(`Bayo is position ${joinWaitlist(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo' })}`);
console.log(`Dede is position ${joinWaitlist(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Dede' })}`);

step('Find a booking by its reference (Map lookup)');
const found = findBookingByReference(store, adaBooking.reference);
console.log(`${adaBooking.reference} -> ${found.attendeeName}, ${found.quantity} seats`);

step('Ada cancels, which frees her seats');
cancelBooking(store, adaBooking.id);
console.log(`Seats left: ${seatsLeft(tier)}`);
console.log(`Next in line: ${nextOnWaitlist(store, tier.id).attendeeName}`);

step('Cancelling twice is an error');
try {
  cancelBooking(store, adaBooking.id);
} catch (err) {
  console.log(`Refused: ${err.code}`);
}
