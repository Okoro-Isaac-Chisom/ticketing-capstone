import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';
import { codeOf } from './helpers.js';

// A small list of event summaries, written by hand (no store needed).
const ev = (id, title, city, startsAt, price, seatsLeft, venue = 'Hall') =>
  ({ id, title, city, venue, startsAt, cheapestPriceCents: price, seatsLeft });

const list = () => [
  ev('1', 'Lagos Tech Meetup', 'Lagos', '2026-12-05T17:00:00Z', 500000, 10),
  ev('2', 'Abuja Jazz Night', 'Abuja', '2026-12-01T19:00:00Z', 300000, 0),
  ev('3', 'Lagos Food Fest', 'Lagos', '2026-12-05T17:00:00Z', null, 5), // no tiers
  ev('4', 'Port Harcourt Expo', 'Port Harcourt', '2027-01-10T09:00:00Z', 100000, 50, 'Expo Centre'),
];

test('S05: search "JAZZ" ignores case and returns only the jazz event', () => {
  assert.deepEqual(filterEvents(list(), { q: 'JAZZ' }).map((e) => e.id), ['2']);
});

test('S05: q also matches the venue', () => {
  assert.deepEqual(filterEvents(list(), { q: 'expo centre' }).map((e) => e.id), ['4']);
});

test('S05: city filter ignores capital letters', () => {
  assert.deepEqual(filterEvents(list(), { city: 'lagos' }).map((e) => e.id), ['1', '3']);
});

test('S05: max price + price sort: cheapest first, no-tier events left out', () => {
  const out = searchEvents(list(), { maxPriceCents: 500000 }, 'price');
  assert.deepEqual(out.map((e) => e.id), ['4', '2', '1']);
});

test('S05: same-time events stay in title order when sorted by date', () => {
  const out = sortEvents(list(), 'date');
  assert.deepEqual(out.map((e) => e.id), ['2', '3', '1', '4']); // "Food Fest" before "Tech Meetup"
});

test('S05: a date-only "to" includes the whole day (5 PM on 5 December)', () => {
  const ids = filterEvents(list(), { to: '2026-12-05' }).map((e) => e.id);
  assert.ok(ids.includes('1'));
  assert.ok(!ids.includes('4'));
});

test('S05: "from" is inclusive', () => {
  const ids = filterEvents(list(), { from: '2026-12-05T17:00:00Z' }).map((e) => e.id);
  assert.deepEqual(ids, ['1', '3', '4']);
});

test('S05: onlyAvailable hides sold-out events', () => {
  assert.ok(!filterEvents(list(), { onlyAvailable: true }).some((e) => e.id === '2'));
});

test('S05: availability sort puts the most seats first', () => {
  assert.deepEqual(sortEvents(list(), 'availability').map((e) => e.id), ['4', '1', '3', '2']);
});

test('S05: bad date, bad price, bad sort option, bad range are VALIDATION', () => {
  assert.equal(codeOf(() => filterEvents(list(), { from: 'yesterday' })), 'VALIDATION');
  assert.equal(codeOf(() => filterEvents(list(), { to: '2026-02-30' })), 'VALIDATION');
  assert.equal(codeOf(() => filterEvents(list(), { maxPriceCents: 99.5 })), 'VALIDATION');
  assert.equal(codeOf(() => filterEvents(list(), { from: '2026-12-10', to: '2026-12-01' })), 'VALIDATION');
  assert.equal(codeOf(() => sortEvents(list(), 'colour')), 'VALIDATION');
  assert.equal(codeOf(() => sortEvents(list(), 'toString')), 'VALIDATION'); // not a real option
});

test('S05: filtering and sorting never change the original list', () => {
  const original = list();
  const snapshot = JSON.parse(JSON.stringify(original));
  filterEvents(original, { q: 'lagos', maxPriceCents: 600000 });
  sortEvents(original, 'price');
  searchEvents(original, { city: 'lagos' }, 'availability');
  assert.deepEqual(original, snapshot);
});

test('S05: an empty list gives an empty result', () => {
  assert.deepEqual(searchEvents([], { q: 'x' }, 'date'), []);
});

test('S05: no criteria returns everything, sorted by date by default', () => {
  assert.equal(searchEvents(list()).length, 4);
});
