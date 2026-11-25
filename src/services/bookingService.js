import { DomainError } from '../domain/errors.js';
import { newId, newReference } from '../domain/ids.js';
import { requireText } from '../domain/validation.js';
import { validateQuantity, seatsLeft } from '../domain/rules.js';
import { BOOKING_STATES, assertTransition } from '../domain/bookingStateMachine.js';

// Use cases for bookings. The repository and the payment gateway are passed in.
export function createBookingService({ repo, gateway }) {
  async function loadBooking(reference) {
    const booking = await repo.getBookingByReference(reference);
    if (!booking) throw new DomainError('NOT_FOUND', `Booking ${reference} not found`);
    return booking;
  }

  // A booking can only be used by the person who made it.
  function assertOwner(booking, userId) {
    if (booking.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'This booking belongs to someone else');
    }
  }

  return {
    // S06. NOTE (known weakness, fixed in Build 5): this reads the tier, checks
    // the seats, then saves. Two requests running at the same moment could both
    // pass the check. In memory it is hard to trigger; with a database it is not.
    async book(userId, { eventId, tierId, quantity } = {}) {
      requireText(eventId, 'eventId');
      requireText(tierId, 'tierId');
      validateQuantity(quantity);

      const event = await repo.getEvent(eventId);
      if (!event) throw new DomainError('NOT_FOUND', `Event ${eventId} not found`);
      if (event.status !== 'PUBLISHED') {
        throw new DomainError('INVALID_STATE', 'Tickets can only be booked for a published event');
      }
      const tier = await repo.getTier(tierId);
      if (!tier || tier.eventId !== eventId) throw new DomainError('NOT_FOUND', `Tier ${tierId} not found`);

      if (quantity > seatsLeft(tier)) {
        throw new DomainError('SOLD_OUT', `Only ${seatsLeft(tier)} ticket(s) left in ${tier.name}`);
      }

      let reference = newReference();
      while (await repo.getBookingByReference(reference)) reference = newReference(); // avoid a clash

      await repo.updateTier({ ...tier, sold: tier.sold + quantity });
      return repo.insertBooking({
        id: newId(),
        reference,
        userId,
        eventId,
        tierId,
        quantity,
        totalCents: tier.priceCents * quantity, // whole cents, integer math
        status: BOOKING_STATES.PENDING,
        createdAt: new Date().toISOString(),
      });
    },

    // S07. mockCard is "success" (default) or "declined". It is NOT a card number.
    async pay(userId, reference, { mockCard = 'success' } = {}) {
      if (mockCard !== 'success' && mockCard !== 'declined') {
        throw new DomainError('VALIDATION', 'mockCard must be "success" or "declined"');
      }
      const booking = await loadBooking(reference);
      assertOwner(booking, userId);
      // Check the move BEFORE charging: a cancelled or already-paid booking never reaches the gateway.
      assertTransition(booking.status, BOOKING_STATES.PAID);

      const result = await gateway.charge({
        amountCents: booking.totalCents,
        reference: booking.reference,
        decline: mockCard === 'declined',
      });
      // A declined card throws and saves nothing: the booking stays pending, so the person can retry.
      if (!result.ok) throw new DomainError('PAYMENT_DECLINED', result.reason);

      return repo.updateBooking({ ...booking, status: BOOKING_STATES.PAID, chargeId: result.chargeId });
    },

    // Cancel an UNPAID booking and release its seats exactly once.
    async cancel(userId, reference) {
      const booking = await loadBooking(reference);
      assertOwner(booking, userId);
      if (booking.status === BOOKING_STATES.CANCELLED) {
        throw new DomainError('ALREADY_CANCELLED', 'Booking is already cancelled');
      }
      if (booking.status === BOOKING_STATES.PAID) {
        throw new DomainError('INVALID_STATE', 'Paid bookings are refunded in a later build');
      }
      assertTransition(booking.status, BOOKING_STATES.CANCELLED);

      const tier = await repo.getTier(booking.tierId);
      await repo.updateTier({ ...tier, sold: tier.sold - booking.quantity });
      return repo.updateBooking({ ...booking, status: BOOKING_STATES.CANCELLED });
    },

    async getBooking(userId, reference) {
      const booking = await loadBooking(reference);
      assertOwner(booking, userId);
      return booking;
    },
  };
}
