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