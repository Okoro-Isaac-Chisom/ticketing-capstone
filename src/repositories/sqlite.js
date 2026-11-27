// The SQLite repository: same methods as memory.js, so the services do not change.
// EVERY query uses placeholders (?). We never build SQL by joining strings, so
// user input can never be run as SQL (that attack is called SQL injection).

// Rows use snake_case column names; the rest of the app uses camelCase.
const eventFromRow = (r) => r && {
  id: r.id, organizerId: r.organizer_id, title: r.title, city: r.city, venue: r.venue,
  startsAt: r.starts_at, status: r.status, createdAt: r.created_at,
};
const tierFromRow = (r) => r && {
  id: r.id, eventId: r.event_id, name: r.name, priceCents: r.price_cents, capacity: r.capacity, sold: r.sold,
};
const bookingFromRow = (r) => {
  if (!r) return undefined;
  const booking = {
    id: r.id, reference: r.reference, userId: r.user_id, eventId: r.event_id, tierId: r.tier_id,
    quantity: r.quantity, totalCents: r.total_cents, status: r.status, createdAt: r.created_at,
  };
  if (r.charge_id !== null) booking.chargeId = r.charge_id;
  return booking;
};

export function createSqliteRepository(db) {
  // Prepared once, reused many times (faster, and always parameterised).
  const sql = {
    insertEvent: db.prepare('INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    getEvent: db.prepare('SELECT * FROM events WHERE id = ?'),
    updateEvent: db.prepare('UPDATE events SET title = ?, city = ?, venue = ?, starts_at = ?, status = ? WHERE id = ?'),
    listEvents: db.prepare('SELECT * FROM events ORDER BY rowid'),

    insertTier: db.prepare('INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, ?)'),
    getTier: db.prepare('SELECT * FROM ticket_tiers WHERE id = ?'),
    listTiers: db.prepare('SELECT * FROM ticket_tiers ORDER BY rowid'),
    listTiersByEvent: db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY rowid'),
    // THE FIX for overselling: one statement that checks AND changes the count.
    reserveSeats: db.prepare('UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity'),
    releaseSeats: db.prepare('UPDATE ticket_tiers SET sold = sold - ? WHERE id = ? AND sold - ? >= 0'),

    insertBooking: db.prepare('INSERT INTO bookings (id, reference, user_id, event_id, tier_id, quantity, total_cents, status, charge_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getBookingByReference: db.prepare('SELECT * FROM bookings WHERE reference = ?'),
    updateBooking: db.prepare('UPDATE bookings SET status = ?, charge_id = ? WHERE id = ?'),
    transitionBooking: db.prepare('UPDATE bookings SET status = ?, charge_id = COALESCE(?, charge_id) WHERE reference = ? AND status = ?'),
  };

  const missing = (what, id) => new Error(`Cannot update missing ${what} ${id}`);

  // The methods are async to match memory.js (and a future networked database),
  // even though node:sqlite itself is synchronous.
  return {
    // ----- events -----
    async insertEvent(e) {
      sql.insertEvent.run(e.id, e.organizerId, e.title, e.city, e.venue, e.startsAt, e.status, e.createdAt);
      return eventFromRow(sql.getEvent.get(e.id));
    },
    async getEvent(id) { return eventFromRow(sql.getEvent.get(id)); },
    async updateEvent(e) {
      if (sql.updateEvent.run(e.title, e.city, e.venue, e.startsAt, e.status, e.id).changes !== 1) throw missing('event', e.id);
      return eventFromRow(sql.getEvent.get(e.id));
    },
    async listEvents() { return sql.listEvents.all().map(eventFromRow); },

    // ----- tiers -----
    async insertTier(t) {
      sql.insertTier.run(t.id, t.eventId, t.name, t.priceCents, t.capacity, t.sold);
      return tierFromRow(sql.getTier.get(t.id));
    },
    async getTier(id) { return tierFromRow(sql.getTier.get(id)); },
    async listTiers() { return sql.listTiers.all().map(tierFromRow); },
    async listTiersByEvent(eventId) { return sql.listTiersByEvent.all(eventId).map(tierFromRow); },

    // Atomically take `quantity` seats. true = we got them, false = not enough left.
    // The database checks and updates in ONE step, so two requests can never both win the last seat.
    async reserveSeats(tierId, quantity) {
      return sql.reserveSeats.run(quantity, tierId, quantity).changes === 1;
    },
    async releaseSeats(tierId, quantity) {
      return sql.releaseSeats.run(quantity, tierId, quantity).changes === 1;
    },

    // ----- bookings -----
    async insertBooking(b) {
      sql.insertBooking.run(b.id, b.reference, b.userId, b.eventId, b.tierId, b.quantity, b.totalCents, b.status, b.chargeId ?? null, b.createdAt);
      return bookingFromRow(sql.getBookingByReference.get(b.reference));
    },
    async getBookingByReference(reference) { return bookingFromRow(sql.getBookingByReference.get(reference)); },
    async updateBooking(b) {
      if (sql.updateBooking.run(b.status, b.chargeId ?? null, b.id).changes !== 1) throw missing('booking', b.id);
      return bookingFromRow(sql.getBookingByReference.get(b.reference));
    },
    // Move a booking from one status to another ONLY IF it still has the status we expect.
    // true = we made the move, false = someone else changed it first.
    async transitionBooking(reference, from, to, { chargeId = null } = {}) {
      return sql.transitionBooking.run(to, chargeId, reference, from).changes === 1;
    },

    close() { db.close(); },
  };
}
