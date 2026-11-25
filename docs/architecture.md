# Architecture (Build 3)

The app is built in layers. A request enters at the top and moves down; nothing ever calls upwards.

## 1. Layers

```mermaid
flowchart TB
  client[Browser or API client] --> routes[Routes: src/http]
  routes --> services[Services: src/services]
  services --> rules[Domain rules: src/domain]
  services --> repos[Repositories: src/repositories]
  repos --> db[(Data store)]
```

- **Routes** turn an HTTP request into a function call and the result back into an HTTP response; they may not hold business rules or touch data.
- **Services** run one use case (such as "book tickets") by combining rules and repositories; they may not know anything about HTTP.
- **Domain rules** decide what is allowed (capacity, validation, the booking life cycle); they may not do any I/O, so they stay easy to test.
- **Repositories** save and load data; they may not make business decisions.
- **Data store** keeps the data; it never calls back into the app.

(Since Build 4 all layers exist: `src/http` routes, `src/services`, `src/domain` rules and `src/repositories`. Services receive the repository and the payment gateway as arguments; they never import them. That lets Build 5 swap the in-memory repository for SQLite without touching the services.)

## 2. Data model

```mermaid
erDiagram
  USERS ||--o{ EVENTS : organizes
  USERS ||--o{ BOOKINGS : makes
  EVENTS ||--o{ TICKET_TIERS : offers
  TICKET_TIERS ||--o{ BOOKINGS : reserves

  USERS {
    string id
    string name
    string email
    string role
  }
  EVENTS {
    string id
    string organizer_id
    string title
    string city
    string venue
    string starts_at
    string status
  }
  TICKET_TIERS {
    string id
    string event_id
    string name
    int price_cents
    int capacity
    int sold
  }
  BOOKINGS {
    string id
    string user_id
    string tier_id
    string reference
    int quantity
    int total_cents
    string status
  }
```

Money is always whole cents. Event status is DRAFT or PUBLISHED. Booking status follows the state machine below.

## 3. Booking life cycle

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> paid: pay
  pending --> cancelled: cancel
  paid --> checked_in: scan at door
  paid --> refunded: refund
  paid --> cancelled: cancel
  cancelled --> [*]
  refunded --> [*]
  checked_in --> [*]
```

`cancelled`, `refunded` and `checked_in` are final. Any other move (for example paying a cancelled booking) is refused with `INVALID_TRANSITION`. The rules live in `src/domain/bookingStateMachine.js`.
