// The in-memory repository: the ONLY place that knows how data is stored.
// Services receive it as an argument and call these async methods, so in
// Build 5 we can swap in a SQLite repository without touching the services.
//
// Every method returns COPIES (structuredClone) so a caller can never change
// stored data by accident; to save a change you must call an update method.
export function createMemoryRepository() {
  const events = new Map();       // id        -> event
  const tiers = new Map();        // id        -> tier
  const bookings = new Map();     // id        -> booking
  const byReference = new Map();  // reference -> booking id (O(1) lookup)

  const copy = (value) => (value === undefined ? undefined : structuredClone(value));
  // Updating something that does not exist is a bug in OUR code, not bad user input.
  const mustExist = (map, record, what) => {
    if (!map.has(record.id)) throw new Error(`Cannot update missing ${what} ${record.id}`);
  };

  return {
    // ----- events -----
    async insertEvent(event) { events.set(event.id, copy(event)); return copy(event); },
    async getEvent(id) { return copy(events.get(id)); },
    async updateEvent(event) { mustExist(events, event, 'event'); events.set(event.id, copy(event)); return copy(event); },
    async listEvents() { return [...events.values()].map(copy); },

    // ----- tiers -----
    async insertTier(tier) { tiers.set(tier.id, copy(tier)); return copy(tier); },
    async getTier(id) { return copy(tiers.get(id)); },
    async listTiers() { return [...tiers.values()].map(copy); },
    async listTiersByEvent(eventId) { return [...tiers.values()].filter((t) => t.eventId === eventId).map(copy); },

    // Take `quantity` seats if enough are left. The check and the change happen in
    // one step with no `await` between them, so they cannot be interleaved.
    async reserveSeats(tierId, quantity) {
      const tier = tiers.get(tierId);
      if (!tier || tier.sold + quantity > tier.capacity) return false;
      tier.sold += quantity;
      return true;
    },
    async releaseSeats(tierId, quantity) {
      const tier = tiers.get(tierId);
      if (!tier || tier.sold - quantity < 0) return false;
      tier.sold -= quantity;
      return true;
    },

    // ----- bookings -----
    async insertBooking(booking) {
      bookings.set(booking.id, copy(booking));
      byReference.set(booking.reference, booking.id);
      return copy(booking);
    },
    async getBookingByReference(reference) { return copy(bookings.get(byReference.get(reference))); },
    // Change the status only if it is still `from` (same contract as the SQLite repository).
    async transitionBooking(reference, from, to, { chargeId = null } = {}) {
      const booking = bookings.get(byReference.get(reference));
      if (!booking || booking.status !== from) return false;
      booking.status = to;
      if (chargeId !== null) booking.chargeId = chargeId;
      return true;
    },
    async updateBooking(booking) { mustExist(bookings, booking, 'booking'); bookings.set(booking.id, copy(booking)); return copy(booking); },
  };
}
