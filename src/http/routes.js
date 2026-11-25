import { DomainError } from '../domain/errors.js';

// Route handlers only translate HTTP <-> service calls. No business rules here.

// Until Build 7 (login), the caller says who they are with the x-user-id header.
function requireUser(req) {
  const id = req.headers['x-user-id'];
  if (typeof id !== 'string' || id.trim() === '' || id.length > 100) {
    throw new DomainError('UNAUTHENTICATED', 'Send your user id in the x-user-id header');
  }
  return id.trim();
}

// A body must be a JSON object (not an array, string or number).
// A missing body counts as {} so the service can report what is missing.
function asObject(body) {
  if (body === undefined) return {};
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new DomainError('VALIDATION', 'Request body must be a JSON object');
  }
  return body;
}

// Turn ?q=&city=&from=&to=&maxPriceCents=&onlyAvailable=&sort= into search criteria.
// Query values are always text, so numbers and booleans are converted here.
function criteriaFromQuery(query) {
  const criteria = {};
  for (const key of ['q', 'city', 'from', 'to']) {
    if (query.has(key)) criteria[key] = query.get(key);
  }
  if (query.has('maxPriceCents')) criteria.maxPriceCents = Number(query.get('maxPriceCents')); // "12.5" or "abc" fail validation later
  if (query.has('onlyAvailable')) {
    const v = query.get('onlyAvailable');
    if (v !== 'true' && v !== 'false') throw new DomainError('VALIDATION', 'onlyAvailable must be true or false');
    criteria.onlyAvailable = v === 'true';
  }
  return { criteria, sortBy: query.get('sort') ?? 'date' };
}

export function registerRoutes(router, services) {
  router.add('GET', '/health', () => ({ status: 200, body: { status: 'ok' } }));
  if (!services) return; // Build 3 tests register only /health

  const { eventService, bookingService } = services;

  // ----- events -----
  router.add('POST', '/api/events', async ({ req, body }) => ({
    status: 201,
    body: await eventService.createEvent(requireUser(req), asObject(body)),
  }));

  router.add('POST', '/api/events/:id/tiers', async ({ req, params, body }) => ({
    status: 201,
    body: await eventService.addTier(requireUser(req), params.id, asObject(body)),
  }));

  router.add('POST', '/api/events/:id/publish', async ({ req, params }) => ({
    body: await eventService.publish(requireUser(req), params.id),
  }));

  router.add('POST', '/api/events/:id/unpublish', async ({ req, params }) => ({
    body: await eventService.unpublish(requireUser(req), params.id),
  }));

  router.add('GET', '/api/events', async ({ query }) => {
    const { criteria, sortBy } = criteriaFromQuery(query);
    return { body: { events: await eventService.searchEvents(criteria, sortBy) } };
  });

  router.add('GET', '/api/events/:id', async ({ req, params }) => ({
    // Reading is public, but a draft is shown only to its organizer (if they sent their id).
    body: await eventService.getEvent(params.id, req.headers['x-user-id']),
  }));

  // ----- bookings -----
  router.add('POST', '/api/bookings', async ({ req, body }) => ({
    status: 201,
    body: await bookingService.book(requireUser(req), asObject(body)),
  }));

  router.add('POST', '/api/bookings/:reference/pay', async ({ req, params, body }) => ({
    body: await bookingService.pay(requireUser(req), params.reference, asObject(body)),
  }));

  router.add('POST', '/api/bookings/:reference/cancel', async ({ req, params }) => ({
    body: await bookingService.cancel(requireUser(req), params.reference),
  }));

  router.add('GET', '/api/bookings/:reference', async ({ req, params }) => ({
    body: await bookingService.getBooking(requireUser(req), params.reference),
  }));
}
