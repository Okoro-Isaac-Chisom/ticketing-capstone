import { newId } from '../domain/ids.js';
import { requireWholeNumber } from '../domain/validation.js';

// A fake payment provider. No real money moves, and it NEVER sees a card
// number: the caller only says whether this mock charge should succeed or decline.
export function createMockPaymentGateway() {
  return {
    // Resolves to { ok: true, chargeId } or { ok: false, reason }.
    async charge({ amountCents, reference, decline = false }) {
      requireWholeNumber(amountCents, 'amountCents', 0); // money is whole cents
      await Promise.resolve(); // real gateways are asynchronous; keep the same shape
      if (decline) return { ok: false, reason: 'The mock card was declined' };
      return { ok: true, chargeId: `ch_${newId()}`, reference };
    },
  };
}
