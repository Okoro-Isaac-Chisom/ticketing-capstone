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
    // S06 + S08. The seats are taken by ONE atomic repository call (reserveSeats).
    // We do NOT read the tier, check, and then save: another request could slip in
    // between those steps and both would get the last seat.
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

      let reference = newReference();
      while (await repo.getBookingByReference(reference)) reference = newReference(); // avoid a clash

      // Win the seats or lose them: no in-between.
      if (!(await repo.reserveSeats(tierId, quantity))) {
        const latest = await repo.getTier(tierId); // only used for a helpful message
        throw new DomainError('SOLD_OUT', `Only ${seatsLeft(latest)} ticket(s) left in ${tier.name}`);
      }

      try {
        return await repo.insertBooking({
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
      } catch (err) {
        await repo.releaseSeats(tierId, quantity); // the booking was not saved, so give the seats back
        throw err;
      }
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

      // Only mark it paid if nobody changed it while we were charging (for example a cancel).
      const moved = await repo.transitionBooking(reference, BOOKING_STATES.PENDING, BOOKING_STATES.PAID, { chargeId: result.chargeId });
      if (!moved) throw new DomainError('INVALID_STATE', 'The booking changed while the payment was processed');
      return repo.getBookingByReference(reference);
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

      // Only ONE of two simultaneous cancels can win this move, so seats are released once.
      const won = await repo.transitionBooking(reference, booking.status, BOOKING_STATES.CANCELLED);
      if (!won) {
        const now = await repo.getBookingByReference(reference);
        throw now.status === BOOKING_STATES.CANCELLED
          ? new DomainError('ALREADY_CANCELLED', 'Booking is already cancelled')
          : new DomainError('INVALID_STATE', 'The booking changed; please try again');
      }
      await repo.releaseSeats(booking.tierId, booking.quantity);
      return repo.getBookingByReference(reference);
    },

    async getBooking(userId, reference) {
      const booking = await loadBooking(reference);
      assertOwner(booking, userId);
      return booking;
    },
  };
}
