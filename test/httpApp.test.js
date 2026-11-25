import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createRouter } from '../src/http/router.js';
import { registerRoutes } from '../src/http/routes.js';
import { DomainError } from '../src/domain/errors.js';
import { loadConfig } from '../src/config.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const silentLogger = { error() {} }; // keep expected 500s out of the test output

// Test-only routes, so we can exercise body parsing and error handling.
const router = createRouter();
registerRoutes(router);
router.add('POST', '/api/echo', ({ body }) => ({ status: 200, body: { youSent: body } }));
router.add('GET', '/api/boom', () => { throw new Error('secret internal detail'); });
router.add('GET', '/api/soldout', () => { throw new DomainError('SOLD_OUT', 'No seats'); });

let server;
let port;
before(async () => {
  server = createApp({ publicDir, router, logger: silentLogger });
  await new Promise((resolve) => server.listen(0, resolve)); // port 0 = any free port
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

// Send a REAL HTTP request with the exact path we give (no URL tidying).
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('GET /health returns {"status":"ok"}', async () => {
  const r = await request('GET', '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.text), { status: 'ok' });
});

test('unknown /api path is a JSON 404 in the standard error shape', async () => {
  const r = await request('GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.deepEqual(Object.keys(JSON.parse(r.text)), ['error']);
  assert.equal(JSON.parse(r.text).error.code, 'NOT_FOUND');
});

test('bad JSON is a JSON 400', async () => {
  const r = await request('POST', '/api/echo', '{not json');
  assert.equal(r.status, 400);
  assert.equal(JSON.parse(r.text).error.code, 'BAD_JSON');
});

test('good JSON is parsed', async () => {
  const r = await request('POST', '/api/echo', '{"a":1}');
  assert.deepEqual(JSON.parse(r.text), { youSent: { a: 1 } });
});

test('a business error keeps its code and gets the right status', async () => {
  const r = await request('GET', '/api/soldout');
  assert.equal(r.status, 409);
  assert.equal(JSON.parse(r.text).error.code, 'SOLD_OUT');
});

test('an unexpected error is a generic 500 with NO internal details', async () => {
  const r = await request('GET', '/api/boom');
  assert.equal(r.status, 500);
  assert.equal(JSON.parse(r.text).error.code, 'INTERNAL');
  assert.ok(!r.text.includes('secret internal detail'));
  assert.ok(!r.text.includes('at ')); // no stack trace lines
});

test('serves index.html for / and a js file with the right type', async () => {
  const home = await request('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  const js = await request('GET', '/js/health.js');
  assert.match(js.headers['content-type'], /javascript/);
});

test('paths that try to escape public/ are refused', async () => {
  for (const evil of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/js/../../package.json', '/%00']) {
    const r = await request('GET', evil);
    assert.notEqual(r.status, 200, `should refuse ${evil}`);
    assert.ok(!r.text.includes('ticketing-capstone'), `leaked a file for ${evil}`);
  }
});

test('a missing file is a JSON 404', async () => {
  const r = await request('GET', '/nope.html');
  assert.equal(r.status, 404);
});

test('config: PORT defaults to 3000 and rejects nonsense', () => {
  assert.equal(loadConfig({}).port, 3000);
  assert.equal(loadConfig({ PORT: '4000' }).port, 4000);
  assert.throws(() => loadConfig({ PORT: 'abc' }));
  assert.throws(() => loadConfig({ PORT: '70000' }));
});
