// Route handlers only translate HTTP <-> function calls.
// Business rules live in src/domain (and, from Build 4, in services).
export function registerRoutes(router) {
  router.add('GET', '/health', () => ({ status: 200, body: { status: 'ok' } }));
}
