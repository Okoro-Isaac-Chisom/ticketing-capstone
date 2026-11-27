// 50 people press "Buy" at the same moment for the LAST ticket.
// Run it with: npm run oversell
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { bookNaively } from './lib/naiveBooking.js';

const PEOPLE = 50;

// A fresh in-memory database with ONE event that has exactly ONE seat.
async function setup() {
  const db = openDatabase(':memory:');
  const repo = createSqliteRepository(db);
  const events = createEventService({ repo });
  const event = await events.createEvent('org-1', { title: 'Last Ticket Gala', city: 'Lagos', venue: 'Hall', startsAt: '2027-03-20T18:00:00Z' });
  const tier = await events.addTier('org-1', event.id, { name: 'General', priceCents: 500000, capacity: 1 });
  await events.publish('org-1', event.id);
  return { db, repo, eventId: event.id, tierId: tier.id };
}

// Fire all the attempts at once with Promise.all and count what happened.
async function run(label, attempt) {
  const { db, repo, eventId, tierId } = await setup();
  const outcomes = await Promise.allSettled(
    Array.from({ length: PEOPLE }, (_, i) => attempt({ db, repo, eventId, tierId, userId: `person-${i}` })),
  );
  const won = outcomes.filter((o) => o.status === 'fulfilled').length;
  const soldOut = outcomes.filter((o) => o.status === 'rejected' && o.reason.code === 'SOLD_OUT').length;
  const rows = db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n;
  const sold = db.prepare('SELECT sold, capacity FROM ticket_tiers WHERE id = ?').get(tierId);
  console.log(`\n${label}`);
  console.log(`  bookings that succeeded : ${won}`);
  console.log(`  got SOLD_OUT            : ${soldOut}`);
  console.log(`  booking rows in the DB  : ${rows}   (seats available: ${sold.capacity})`);
  console.log(rows > sold.capacity ? `  -> OVERSOLD by ${rows - sold.capacity}` : '  -> correct: nobody is turned away at the door');
}

console.log(`${PEOPLE} people try to buy the last ticket at the same moment.`);

await run('BEFORE the fix (read, check, then save):', (args) => bookNaively({ ...args, quantity: 1 }));

const gateway = createMockPaymentGateway();
await run('AFTER the fix (one atomic UPDATE in the database):', ({ repo, eventId, tierId, userId }) =>
  createBookingService({ repo, gateway }).book(userId, { eventId, tierId, quantity: 1 }));
