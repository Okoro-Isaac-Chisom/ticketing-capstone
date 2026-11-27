import { defineApiTests } from './apiSuite.js';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';

// Exactly the same tests, now with a real (in-memory) SQLite database underneath.
defineApiTests('API with the SQLite repository', () => createSqliteRepository(openDatabase(':memory:')));
