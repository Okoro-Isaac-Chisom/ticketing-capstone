// Settings come from environment variables, with safe defaults.
// PORT=4000 npm start  ->  listens on 4000. Never put secrets in this file.
export function loadConfig(env = process.env) {
  const port = env.PORT === undefined || env.PORT === '' ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be a whole number from 0 to 65535 (got "${env.PORT}")`);
  }
  return { port };
}
