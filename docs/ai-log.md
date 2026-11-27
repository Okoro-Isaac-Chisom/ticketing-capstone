# AI log

Format for every important prompt: what I asked, what came back, what was wrong (or "nothing"), what I changed.

## Build 1
**Asked:** Build 1 domain core prompt (errors, ids, queue, inventory, demo, benchmark).
**Came back:** All the files, with a working demo and benchmark.
**What was wrong / questionable:** joinWaitlist does not check that the tier is sold out, and the same person can join the waitlist twice.
**What I changed:** Nothing in the code yet; both noted to fix in a later build.

## Build 2
**Asked:** Build 2 prompt (merge sort, search/filter/sort, publish, tests).
**Came back:** Stable merge sort, search/filter/sort functions, publish rules, 37 tests.
**What was wrong / questionable:** A date-time with no timezone depends on the computer's local time. Also noted that name became title, new bookings are pending, and only published events can be booked.
**What I changed:** (what you actually changed, or "nothing, noted for later")
## Build 3
**Asked:** Build 3 prompt (state machine, router, server skeleton, architecture doc).
**Came back:** Booking state machine, router, static server, /health, 82 tests.
**What was wrong / questionable:** No security headers or rate limiting yet; POST to /health gives 404 instead of 405.
**What I changed:** Nothing; noted for Build 9.

## Build 4
**Asked:** Build 4 prompt (services, repository, REST API, mock payment).
**Came back:** Event and booking services, in-memory repository, API routes, 104 tests.
**What was wrong / questionable:** The booking check and save were separate steps (a race); two pay requests at the same time could both charge.
**What I changed:** Nothing yet; the race was fixed in Build 5.

## Build 5
**Asked:** Build 5 prompts (SQLite, reproduce the overselling problem, then fix it).
**Came back:** SQLite schema and repository, oversell demo, atomic reserveSeats, 139 tests.
**What was wrong / questionable:** My Build 4 note said the race was hard to trigger in memory, but it also happens there. Double pay is still open.
**What I changed:** Moved seat reservation into one atomic UPDATE; removed updateTier so nothing can overwrite sold with an old number.