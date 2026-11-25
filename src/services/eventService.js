import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { validateNewEvent, validateNewTier, seatsLeft, toSummary } from '../domain/rules.js';
import { searchEvents } from '../domain/eventSearch.js';

// Use cases for events. Business rules come from src/domain; data comes from
// the repository we are given. Nothing here knows about HTTP.
export function createEventService({ repo }) {
  async function loadEvent(eventId) {
    const event = await repo.getEvent(eventId);
    if (!event) throw new DomainError('NOT_FOUND', `Event ${eventId} not found`);
    return event;
  }

  // Only the organizer who created an event may change it.
  function assertOrganizer(event, userId) {
    if (event.organizerId !== userId) {
      throw new DomainError('FORBIDDEN', 'Only the organizer of this event can do that');
    }
  }

  // Tiers shown to clients include how many seats are left.
  const withSeatsLeft = (tier) => ({ ...tier, seatsLeft: seatsLeft(tier) });

  return {
    // S02
    async createEvent(userId, input) {
      const fields = validateNewEvent(input);
      const event = { id: newId(), organizerId: userId, ...fields, status: 'DRAFT', createdAt: new Date().toISOString() };
      return repo.insertEvent(event);
    },

    // S03
    async addTier(userId, eventId, input) {
      const event = await loadEvent(eventId);   // NOT_FOUND first
      assertOrganizer(event, userId);           // then FORBIDDEN
      const fields = validateNewTier(input);    // then VALIDATION
      const tier = await repo.insertTier({ id: newId(), eventId, ...fields, sold: 0 });
      return withSeatsLeft(tier);
    },

    // S04
    async publish(userId, eventId) {
      const event = await loadEvent(eventId);
      assertOrganizer(event, userId);
      const tiers = await repo.listTiersByEvent(eventId);
      if (tiers.length === 0) {
        throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
      }
      return repo.updateEvent({ ...event, status: 'PUBLISHED' });
    },

    async unpublish(userId, eventId) {
      const event = await loadEvent(eventId);
      assertOrganizer(event, userId);
      return repo.updateEvent({ ...event, status: 'DRAFT' });
    },

    // One event with its tiers. A draft is only visible to its organizer.
    async getEvent(eventId, userId) {
      const event = await loadEvent(eventId);
      if (event.status !== 'PUBLISHED' && event.organizerId !== userId) {
        throw new DomainError('NOT_FOUND', `Event ${eventId} not found`);
      }
      const tiers = await repo.listTiersByEvent(eventId);
      return { event, tiers: tiers.map(withSeatsLeft) };
    },

    // S05: published events only, then the pure search/sort functions.
    async searchEvents(criteria, sortBy) {
      const [events, tiers] = await Promise.all([repo.listEvents(), repo.listTiers()]);
      const tiersByEvent = new Map();
      for (const tier of tiers) {
        if (!tiersByEvent.has(tier.eventId)) tiersByEvent.set(tier.eventId, []);
        tiersByEvent.get(tier.eventId).push(tier);
      }
      const summaries = events
        .filter((e) => e.status === 'PUBLISHED')
        .map((e) => toSummary(e, tiersByEvent.get(e.id) ?? []));
      return searchEvents(summaries, criteria, sortBy);
    },
  };
}
