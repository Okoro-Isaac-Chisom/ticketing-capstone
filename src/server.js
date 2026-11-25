import { fileURLToPath } from 'node:url';
import { createApp } from './http/app.js';
import { loadConfig } from './config.js';

const { port } = loadConfig();
// public/ sits next to src/, whatever folder the command is run from.
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const server = createApp({ publicDir });
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
