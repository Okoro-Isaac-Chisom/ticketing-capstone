# API examples (Build 4)

Every call the API supports, in the order you would use them: create, publish, book, pay.
Start the server first:

```bash
npm start          # http://localhost:3000
```

The data lives in memory, so it is empty again after a restart. Ids and booking
references are new every time: copy them from each response.

Until Build 7 adds login, the caller says who they are with the `x-user-id` header.
Calls that change data need it.

> **Windows PowerShell:** `curl` is an alias for something else there. Use `curl.exe`
> instead, or run `npm run api-demo` which makes all these calls for you.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "SOLD_OUT", "message": "Only 1 ticket(s) left in General" } }
```

| Code | Status | When |
|---|---|---|
| `VALIDATION`, `BAD_JSON` | 400 | The input is missing or wrong |
| `UNAUTHENTICATED` | 401 | No `x-user-id` header |
| `PAYMENT_DECLINED` | 402 | The mock card was declined; the booking stays pending |
| `FORBIDDEN` | 403 | Not your event or not your booking |
| `NOT_FOUND` | 404 | No such event, tier, booking or route |
| `SOLD_OUT`, `INVALID_STATE`, `INVALID_TRANSITION`, `ALREADY_CANCELLED` | 409 | The request clashes with the current state |
| `PAYLOAD_TOO_LARGE` | 413 | Request body over 1 MB |
| `INTERNAL` | 500 | Unexpected server error (no details are sent) |

## 1. Create an event (organizer)

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' -H 'x-user-id: org-1' \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Landmark Centre","startsAt":"2026-12-05T17:00:00Z"}'
```

`201` with the new **draft** event. Copy its `id`:

```bash
EVENT_ID=paste-the-id-here
```

## 2. Add a ticket tier (organizer)

`priceCents` is whole cents: 500000 is 5,000.00.

```bash
curl -s -X POST http://localhost:3000/api/events/$EVENT_ID/tiers \
  -H 'content-type: application/json' -H 'x-user-id: org-1' \
  -d '{"name":"General","priceCents":500000,"capacity":100}'
```

`201` with the tier (`sold: 0`, `seatsLeft: 100`). Copy its `id`:

```bash
TIER_ID=paste-the-id-here
```

## 3. Publish (and unpublish) an event (organizer)

```bash
curl -s -X POST http://localhost:3000/api/events/$EVENT_ID/publish -H 'x-user-id: org-1'
curl -s -X POST http://localhost:3000/api/events/$EVENT_ID/unpublish -H 'x-user-id: org-1'
```

An event with no tiers answers `409 INVALID_STATE`.

## 4. Search events (public)

Only published events appear. All query parameters are optional.

| Parameter | Meaning |
|---|---|
| `q` | Text in the title or venue (ignores case) |
| `city` | Exact city (ignores case) |
| `from`, `to` | Date range, `2026-12-01` or full ISO. A date-only `to` includes that whole day |
| `maxPriceCents` | Cheapest tier must cost at most this (whole cents) |
| `onlyAvailable` | `true` hides sold-out events |
| `sort` | `date` (default), `price` or `availability` |

```bash
curl -s 'http://localhost:3000/api/events?city=lagos&maxPriceCents=600000&sort=price'
curl -s http://localhost:3000/api/events/$EVENT_ID        # one event with its tiers
```

## 5. Book tickets (attendee)

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' -H 'x-user-id: ada' \
  -d "{\"eventId\":\"$EVENT_ID\",\"tierId\":\"$TIER_ID\",\"quantity\":2}"
```

`201` with a **pending** booking and a short `reference`:

```bash
REF=paste-the-reference-here
```

## 6. Pay (mock payment, attendee)

```bash
# success (the default)
curl -s -X POST http://localhost:3000/api/bookings/$REF/pay -H 'x-user-id: ada'

# a declined card: 402 PAYMENT_DECLINED, the booking stays pending, try again
curl -s -X POST http://localhost:3000/api/bookings/$REF/pay \
  -H 'content-type: application/json' -H 'x-user-id: ada' -d '{"mockCard":"declined"}'
```

`mockCard` is `"success"` or `"declined"`. It is **not** a card number: never send real card details.

## 7. Cancel an unpaid booking (attendee)

```bash
curl -s -X POST http://localhost:3000/api/bookings/$REF/cancel -H 'x-user-id: ada'
```

Seats go back to the tier exactly once. Paid bookings are refunded in a later build.

## 8. Look at a booking (its owner only)

```bash
curl -s http://localhost:3000/api/bookings/$REF -H 'x-user-id: ada'
```
