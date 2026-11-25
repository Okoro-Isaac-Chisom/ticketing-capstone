// Walks through the whole API on a running server: create -> publish -> book -> pay.
// Usage: start the server (npm start) in one terminal, then run: npm run api-demo
const base = process.env.BASE_URL ?? 'http://localhost:3000';

// Small helper: call the API, print what happened, return the JSON.
async function call(label, method, path, { user, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(user ? { 'x-user-id': user } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  console.log(`\n== ${label}\n${method} ${path} -> ${res.status}`);
  console.log(JSON.stringify(json.error ?? json, null, 2).split('\n').slice(0, 14).join('\n'));
  return json;
}

try {
  const event = await call('Organizer creates a draft event', 'POST', '/api/events', {
    user: 'org-1',
    body: { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark Centre', startsAt: '2027-03-20T18:00:00Z' },
  });
  const tier = await call('Organizer adds a tier (3 seats)', 'POST', `/api/events/${event.id}/tiers`, {
    user: 'org-1', body: { name: 'General', priceCents: 500000, capacity: 3 },
  });
  await call('Organizer publishes the event', 'POST', `/api/events/${event.id}/publish`, { user: 'org-1' });
  await call('Anyone searches for it', 'GET', '/api/events?q=meetup&sort=price');

  const booking = await call('Ada books 2 seats', 'POST', '/api/bookings', {
    user: 'ada', body: { eventId: event.id, tierId: tier.id, quantity: 2 },
  });
  await call('Bayo asks for 2 but only 1 is left', 'POST', '/api/bookings', {
    user: 'bayo', body: { eventId: event.id, tierId: tier.id, quantity: 2 },
  });
  await call('Ada pays with a declined mock card', 'POST', `/api/bookings/${booking.reference}/pay`, {
    user: 'ada', body: { mockCard: 'declined' },
  });
  await call('Ada tries again and pays', 'POST', `/api/bookings/${booking.reference}/pay`, { user: 'ada' });
  await call('Ada pays a second time (refused)', 'POST', `/api/bookings/${booking.reference}/pay`, { user: 'ada' });
} catch (err) {
  console.error('\nCould not reach the server. Is it running? (npm start in another terminal)');
  console.error(err.cause?.code ?? err.message);
  process.exitCode = 1;
}
