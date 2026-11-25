import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Queue } from '../src/domain/waitlistQueue.js';

test('first in, first out', () => {
  const q = new Queue();
  q.enqueue('a'); q.enqueue('b'); q.enqueue('c');
  assert.equal(q.dequeue(), 'a');
  assert.equal(q.peek(), 'b');
  assert.equal(q.size, 2);
});

test('empty queue: dequeue and peek give undefined, and it can be reused', () => {
  const q = new Queue();
  assert.equal(q.dequeue(), undefined);
  assert.equal(q.peek(), undefined);
  q.enqueue('x');
  q.dequeue();
  q.enqueue('y'); // works after being emptied (tail was reset)
  assert.deepEqual(q.toArray(), ['y']);
});
