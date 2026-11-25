import { DomainError } from './errors.js';

// The booking life cycle as DATA: a table of "from state -> allowed next states".
// Keeping it as a table (not scattered if-statements) means one place defines
// every legal move, and tests can check every combination.
export const BOOKING_STATES = Object.freeze({
  PENDING: 'pending',       // created, not paid yet
  PAID: 'paid',             // payment succeeded
  CANCELLED: 'cancelled',   // cancelled (final)
  REFUNDED: 'refunded',     // money returned (final)
  CHECKED_IN: 'checked_in', // scanned at the door (final)
});

const TRANSITIONS = Object.freeze({
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['checked_in', 'refunded', 'cancelled']),
  cancelled: Object.freeze([]), // nothing leaves a final state
  refunded: Object.freeze([]),
  checked_in: Object.freeze([]),
});

// Object.hasOwn avoids false matches such as the string "constructor".
export function isState(state) {
  return typeof state === 'string' && Object.hasOwn(TRANSITIONS, state);
}

// Final states have no way out.
export function isFinalState(state) {
  return isState(state) && TRANSITIONS[state].length === 0;
}

// Is the move from -> to allowed? Never throws; unknown states are simply "no".
export function canTransition(from, to) {
  return isState(from) && isState(to) && TRANSITIONS[from].includes(to);
}

// Same check, but throws INVALID_TRANSITION so callers cannot ignore it.
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `A booking cannot move from "${from}" to "${to}"`);
  }
}
