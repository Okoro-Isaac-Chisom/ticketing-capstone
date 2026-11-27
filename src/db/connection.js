import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Open (or create) a SQLite database and make sure the tables exist.
// Use ':memory:' for a throw-away database (tests, demos).
export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON'); // SQLite ignores FOREIGN KEY unless you ask it to check them
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL'); // safer, faster writes for a file
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return db;
}
