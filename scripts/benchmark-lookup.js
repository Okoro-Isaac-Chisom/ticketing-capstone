import { performance } from 'node:perf_hooks';
import { newReference } from '../src/domain/ids.js';

// Change this number and re-run: which timing grows, and which stays flat?
const BOOKINGS = 100_000;
const LOOKUPS = 500;

// Build the same data in an array (O(n) search) and a Map (O(1) search).
const list = [];
const map = new Map();
for (let i = 0; i < BOOKINGS; i++) {
  const booking = { reference: `${newReference()}-${i}`, attendeeName: `person ${i}` };
  list.push(booking);
  map.set(booking.reference, booking);
}

// Pick random existing references to look up.
const targets = [];
for (let i = 0; i < LOOKUPS; i++) {
  targets.push(list[Math.floor(Math.random() * BOOKINGS)].reference);
}

let t = performance.now();
for (const ref of targets) list.find((b) => b.reference === ref);
const arrayMs = performance.now() - t;

t = performance.now();
for (const ref of targets) map.get(ref);
const mapMs = performance.now() - t;

console.log(`Looking up ${LOOKUPS} bookings among ${BOOKINGS}`);
console.log(`Array.find: ${arrayMs.toFixed(2)} ms   (O(n): scans the list)`);
console.log(`Map.get:    ${mapMs.toFixed(3)} ms   (O(1): jumps straight to it)`);
console.log(`Map was about ${Math.round(arrayMs / Math.max(mapMs, 0.001))}x faster`);
