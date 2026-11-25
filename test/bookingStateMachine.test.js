import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_STATES, canTransition, assertTransition, isFinalState, isState,
} from '../src/domain/bookingStateMachine.js';
import { codeOf } from './helpers.js';

const ALL = Object.values(BOOKING_STATES);

// Every allowed move, written out by hand from the design.
const ALLOWED = new Set([
  'pending>paid', 'pending>cancelled',
  'paid>checked_in', 'paid>refunded', 'paid>cancelled',
]);

test('there are exactly five states', () => {
  assert.deepEqual([...ALL].sort(), ['cancelled', 'checked_in', 'paid', 'pending', 'refunded']);
});

// Check ALL 25 combinations (including "stay in the same state").
for (const from of ALL) {
  for (const to of ALL) {
    const allowed = ALLOWED.has(`${from}>${to}`);
    test(`${from} -> ${to} is ${allowed ? 'allowed' : 'refused'}`, () => {
      assert.equal(canTransition(from, to), allowed);
      if (allowed) {
        assertTransition(from, to); // must not throw
      } else {
        assert.equal(codeOf(() => assertTransition(from, to)), 'INVALID_TRANSITION');
      }
    });
  }
}

test('final states have no way out', () => {
  for (const s of ['cancelled', 'refunded', 'checked_in']) assert.equal(isFinalState(s), true);
  for (const s of ['pending', 'paid']) assert.equal(isFinalState(s), false);
});

test('unknown states are refused, including tricky names', () => {
  assert.equal(isState('constructor'), false);
  assert.equal(canTransition('pending', 'constructor'), false);
  assert.equal(canTransition('nonsense', 'paid'), false);
  assert.equal(codeOf(() => assertTransition('pending', undefined)), 'INVALID_TRANSITION');
});
