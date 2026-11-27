import { fileURLToPath } from 'node:url';
import { createApp } from './http/app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { createSqliteRepository } from './repositories/sqlite.js';

const { port, dbPath } = loadConfig();
// public/ sits next to src/, whatever folder the command is run from.
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Data now lives in a file, so it survives a restart.
const repo = createSqliteRepository(openDatabase(dbPath));
const server = createApp({ publicDir, repo });

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port} (database: ${dbPath})`);
});

// Ctrl+C: stop accepting requests, then close the database cleanly.
process.on('SIGINT', () => {
  server.close(() => {
    repo.close();
    process.exit(0);
  });
});
