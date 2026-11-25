import { randomUUID, randomInt } from 'node:crypto';

// Booking references avoid look-alike characters (0/O, 1/I/L) so they are
// safe to read aloud or type from a phone screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 6;

// Unique internal id (UUID v4 from the OS's cryptographic random source).
export function newId() {
  return randomUUID();
}

// Short, readable booking code like "K7QX2M". Uses crypto.randomInt
// (never Math.random, which is predictable).
export function newReference() {
  let ref = '';
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    ref += ALPHABET[randomInt(ALPHABET.length)];
  }
  return ref;
}
