# S04: publish and unpublish an event (acceptance criteria)

(Proposed in Build 2 - edit these with your class pair if yours differ.)

- **Given** a draft event with at least one ticket tier
  **When** the organizer publishes it
  **Then** its status is PUBLISHED and it appears in the public list.
- **Given** a draft event with no ticket tiers
  **When** the organizer tries to publish it
  **Then** the request is rejected with `INVALID_STATE` and it stays a draft.
- **Given** a published event
  **When** the organizer unpublishes it
  **Then** it goes back to DRAFT and disappears from the public list.
