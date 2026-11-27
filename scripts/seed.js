// Fills the database with sample events ONCE. Running it again does nothing.
// Usage: npm run seed
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';

const { dbPath } = loadConfig();
const repo = createSqliteRepository(openDatabase(dbPath));

if ((await repo.listEvents()).length > 0) {
  console.log(`"${dbPath}" already has events, so nothing was added.`);
} else {
  const events = createEventService({ repo });
  const organizer = 'seed-organizer';
  const samples = [
    { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark Centre', startsAt: '2027-03-20T18:00:00Z', tiers: [['General', 500000, 100], ['VIP', 1500000, 20]] },
    { title: 'Abuja Jazz Night', city: 'Abuja', venue: 'Transcorp Hilton', startsAt: '2027-03-27T19:00:00Z', tiers: [['General', 300000, 150]] },
    { title: 'Port Harcourt Food Fest', city: 'Port Harcourt', venue: 'Pleasure Park', startsAt: '2027-04-10T12:00:00Z', tiers: [['Entry', 100000, 500]] },
    { title: 'Ibadan Startup Expo', city: 'Ibadan', venue: 'Cocoa House', startsAt: '2027-04-18T09:00:00Z', tiers: [['Visitor', 0, 300], ['Exhibitor', 2500000, 30]] },
  ];
  for (const { tiers, ...fields } of samples) {
    const event = await events.createEvent(organizer, fields);
    for (const [name, priceCents, capacity] of tiers) await events.addTier(organizer, event.id, { name, priceCents, capacity });
    await events.publish(organizer, event.id);
    console.log(`Added "${event.title}" with ${tiers.length} tier(s)`);
  }
}
repo.close();
