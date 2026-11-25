import { DomainError } from './errors.js';

// Merge sort written by hand (we do NOT call Array.prototype.sort).
//  - Stable: if two items compare as equal, they keep their original order.
//  - Returns a NEW array and never modifies the one it was given.
//  - O(n log n): the list is halved log n times, and each level does O(n) merging.
export function mergeSort(items, compare) {
  if (!Array.isArray(items)) throw new DomainError('VALIDATION', 'items must be an array');
  if (typeof compare !== 'function') throw new DomainError('VALIDATION', 'compare must be a function');
  return sortPart(items.slice(), compare); // work on a copy
}

function sortPart(items, compare) {
  if (items.length <= 1) return items; // 0 or 1 items are already sorted
  const middle = Math.floor(items.length / 2);
  const left = sortPart(items.slice(0, middle), compare);
  const right = sortPart(items.slice(middle), compare);
  return merge(left, right, compare);
}

// Merge two sorted arrays into one sorted array.
function merge(left, right, compare) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // "<= 0" (not "< 0") is what makes the sort STABLE: on a tie, take from the LEFT first.
    if (compare(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}
