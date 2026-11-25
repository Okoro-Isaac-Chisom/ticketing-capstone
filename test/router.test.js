import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/http/router.js';

test('matches a fixed path and returns the handler', () => {
  const router = createRouter();
  const handler = () => {};
  router.add('GET', '/health', handler);
  assert.equal(router.match('GET', '/health').handler, handler);
});

test('captures :params and decodes them', () => {
  const router = createRouter();
  router.add('GET', '/api/events/:id/tiers/:tierId', () => {});
  const m = router.match('GET', '/api/events/e%201/tiers/t2');
  assert.deepEqual(m.params, { id: 'e 1', tierId: 't2' });
});

test('method must match (and is case-insensitive)', () => {
  const router = createRouter();
  router.add('post', '/api/events', () => {});
  assert.equal(router.match('GET', '/api/events'), null);
  assert.ok(router.match('POST', '/api/events'));
});

test('trailing slashes are ignored; different lengths do not match', () => {
  const router = createRouter();
  router.add('GET', '/api/events', () => {});
  assert.ok(router.match('GET', '/api/events/'));
  assert.equal(router.match('GET', '/api/events/1'), null);
  assert.equal(router.match('GET', '/api'), null);
});

test('a malformed % sequence in a param does not match (and does not crash)', () => {
  const router = createRouter();
  router.add('GET', '/api/events/:id', () => {});
  assert.equal(router.match('GET', '/api/events/%E0%A4%A'), null);
});

test('the first registered matching route wins', () => {
  const router = createRouter();
  const first = () => {};
  router.add('GET', '/x/:id', first);
  router.add('GET', '/x/special', () => {});
  assert.equal(router.match('GET', '/x/special').handler, first);
});
