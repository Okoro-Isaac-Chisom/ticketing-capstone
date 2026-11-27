import { DomainError } from '../../src/domain/errors.js';
import { newId, newReference } from '../../src/domain/ids.js';

// !!! UNSAFE ON PURPOSE. Never use this in the app. !!!
// It is the "read, check, then save" logic from Build 4, kept so we can SHOW the bug
// and so a test can prove the overselling test really detects it.
// The pause stands in for the time a real server spends waiting between steps.
export async function bookNaively({ repo, db, userId, eventId, tierId, quantity }) {
  const tier = await repo.getTier(tierId);                      // 1. read
  if (quantity > tier.capacity - tier.sold) {                   // 2. check
    throw new DomainError('SOLD_OUT', 'No seats left');
  }
  await new Promise((resolve) => setImmediate(resolve));        // ...other requests run here...
  // 3. save: writes the number we read earlier plus ours. If 50 requests read sold = 0,
  // all 50 write sold = 1 and all 50 think they won.
  db.prepare('UPDATE ticket_tiers SET sold = ? WHERE id = ?').run(tier.sold + quantity, tierId);
  return repo.insertBooking({
    id: newId(), reference: newReference(), userId, eventId, tierId, quantity,
    totalCents: tier.priceCents * quantity, status: 'pending', createdAt: new Date().toISOString(),
  });
}
