import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '../domain/errors.js';
import { HttpError } from './httpError.js';
import { createRouter } from './router.js';
import { registerRoutes } from './routes.js';

const MAX_BODY_BYTES = 1_000_000; // refuse request bodies over 1 MB

// How each business error code maps to an HTTP status.
const STATUS_BY_CODE = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  INVALID_STATE: 409,
  INVALID_TRANSITION: 409,
  ALREADY_CANCELLED: 409,
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Builds the server but does NOT start listening, so tests can choose the port.
export function createApp({ publicDir, router = defaultRouter(), logger = console } = {}) {
  const root = path.resolve(publicDir);

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      sendError(res, err, logger);
    }
  });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = router.match(req.method, url.pathname);

    if (route) {
      const body = await readJsonBody(req);
      const result = await route.handler({ req, params: route.params, query: url.searchParams, body });
      return sendJson(res, result.status ?? 200, result.body);
    }
    // Anything under /api that no route matched is a JSON 404.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      throw new DomainError('NOT_FOUND', 'No such API route');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new DomainError('NOT_FOUND', 'Not found');
    }
    return serveStatic(url.pathname, req, res);
  }

  // Serve a file from publicDir, never from anywhere else.
  async function serveStatic(pathname, req, res) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'BAD_REQUEST', 'Malformed URL');
    }
    if (decoded.includes('\0')) throw new HttpError(400, 'BAD_REQUEST', 'Malformed URL');

    // Join, then CHECK the result is still inside root (blocks ../ tricks).
    let file = path.resolve(root, `.${decoded}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
      throw new DomainError('NOT_FOUND', 'Not found');
    }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      // realpath resolves symlinks, so a link cannot point outside the folder.
      const real = await realpath(file);
      if (!real.startsWith((await realpath(root)) + path.sep)) throw new Error('outside');
      const data = await readFile(real);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      throw new DomainError('NOT_FOUND', 'Not found');
    }
  }

  return server;
}

function defaultRouter() {
  const router = createRouter();
  registerRoutes(router);
  return router;
}

// Read and parse a JSON body. Requests without a body give undefined.
async function readJsonBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Request body is not valid JSON');
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

// EVERY error leaves in the same shape: {"error":{"code","message"}}.
// Unknown errors become a generic 500: the real error is logged on the server
// only, so a stack trace never reaches the client.
function sendError(res, err, logger) {
  let status = 500;
  let code = 'INTERNAL';
  let message = 'Something went wrong';
  if (err instanceof HttpError) {
    ({ status, code, message } = err);
  } else if (err instanceof DomainError) {
    status = STATUS_BY_CODE[err.code] ?? 400;
    code = err.code;
    message = err.message;
  } else {
    logger.error(err);
  }
  if (res.headersSent) return res.end();
  sendJson(res, status, { error: { code, message } });
}
