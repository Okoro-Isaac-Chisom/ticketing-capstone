import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';
import { parseDate, requireWholeNumber } from './validation.js';

// Pure functions: summaries in, NEW list out. Inputs are never modified.
// A "summary" looks like:
// { id, title, city, venue, startsAt, cheapestPriceCents (or null), seatsLeft }

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function filterEvents(summaries, criteria = {}) {
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;

  // 1. Validate ALL criteria up front, even if the list is empty.
  if (q !== undefined && typeof q !== 'string') {
    throw new DomainError('VALIDATION', 'q must be a string');
  }
  if (city !== undefined && typeof city !== 'string') {
    throw new DomainError('VALIDATION', 'city must be a string');
  }
  const fromMs = from === undefined ? undefined : parseDate(from, 'from').ms;
  let toMs;
  if (to !== undefined) {
    const parsed = parseDate(to, 'to');
    // A date-only "to" means "up to the END of that day", so add a day minus 1 ms.
    toMs = parsed.dateOnly ? parsed.ms + ONE_DAY_MS - 1 : parsed.ms;
  }
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
    throw new DomainError('VALIDATION', 'from must not be after to');
  }
  if (maxPriceCents !== undefined) requireWholeNumber(maxPriceCents, 'maxPriceCents', 0);

  const needle = q ? q.trim().toLowerCase() : '';
  const wantedCity = city ? city.trim().toLowerCase() : '';

  // 2. filter() returns a new array, so the original list is untouched.
  return summaries.filter((e) => {
    if (needle && !(`${e.title} ${e.venue}`.toLowerCase().includes(needle))) return false;
    if (wantedCity && e.city.toLowerCase() !== wantedCity) return false;
    const startMs = Date.parse(e.startsAt);
    if (fromMs !== undefined && startMs < fromMs) return false;
    if (toMs !== undefined && startMs > toMs) return false;
    if (maxPriceCents !== undefined) {
      // Events with no tiers have no price, so a price filter leaves them out.
      if (e.cheapestPriceCents === null || e.cheapestPriceCents > maxPriceCents) return false;
    }
    if (onlyAvailable && e.seatsLeft <= 0) return false;
    return true;
  });
}

// Each comparator returns <0, 0 or >0, like a normal sort comparator.
const byTitle = (a, b) => a.title.localeCompare(b.title);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const PRIMARY = {
  date: (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),           // earliest first
  price: (a, b) => {                                                          // cheapest first
    if (a.cheapestPriceCents === null && b.cheapestPriceCents === null) return 0;
    if (a.cheapestPriceCents === null) return 1;  // no price goes LAST
    if (b.cheapestPriceCents === null) return -1;
    return a.cheapestPriceCents - b.cheapestPriceCents;
  },
  availability: (a, b) => b.seatsLeft - a.seatsLeft,                          // most seats first
};

export function sortEvents(summaries, sortBy) {
  if (!Object.hasOwn(PRIMARY, sortBy)) {
    throw new DomainError('VALIDATION', `sortBy must be one of: ${Object.keys(PRIMARY).join(', ')}`);
  }
  const primary = PRIMARY[sortBy];
  // Ties are broken by title, then id, so the order is always predictable.
  return mergeSort(summaries, (a, b) => primary(a, b) || byTitle(a, b) || byId(a, b));
}

// Filter first (fewer items to sort), then sort.
export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
