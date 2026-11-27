# The last-ticket problem (Build 5)

**The problem.** One seat is left and 50 people press Buy at the same moment.

## What went wrong (before the fix)

Each request did three separate steps: **read** the tier, **check** there is room, **save** the new count.
All 50 requests read "0 sold" before any of them saved, so all 50 passed the check and all 50 got a booking.
Run `npm run oversell` to watch it happen: 50 bookings for 1 seat.

## The fix

Let the database do the check and the change in one step:

```sql
UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity
```

The database runs one statement at a time on a row. If the statement changed one row, we won the seats.
If it changed zero rows, the seats were already gone and we throw `SOLD_OUT`.
(See `reserveSeats` in `src/repositories/sqlite.js` and its use in `src/services/bookingService.js`.)

## Why a lock variable or a second check does not work

- **A lock variable** (a `busy = true` flag in JavaScript) only protects one running copy of the program. A second server process, or a restart, has its own flag, and a crash can leave the flag stuck on. The database is the one place every request must go through.
- **Checking twice** just makes the gap smaller; it does not remove it. Another request can still slip in between the second check and the save.

## Defence in depth

The table also has `CHECK (sold >= 0 AND sold <= capacity)`. If a future bug skipped the atomic update, the database would still refuse to store an oversold tier.

## Other races fixed with the same idea

- **Cancel twice at the same moment:** `transitionBooking` only moves a booking if it still has the status we expect, so only one cancel can win and seats are released once.
- **Still open (Build 8):** if two pay requests for one booking arrive together, both can reach the gateway before either marks the booking paid. Build 8 revisits this.
