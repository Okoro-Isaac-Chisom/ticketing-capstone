import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSort } from '../src/domain/sorting.js';
import { codeOf } from './helpers.js';

const numeric = (a, b) => a - b;

test('sorts numbers ascending', () => {
  assert.deepEqual(mergeSort([5, 2, 9, 1, 5, 6], numeric), [1, 2, 5, 5, 6, 9]);
});

test('empty and one-item lists work', () => {
  assert.deepEqual(mergeSort([], numeric), []);
  assert.deepEqual(mergeSort([7], numeric), [7]);
});

test('returns a NEW array and leaves the input unchanged', () => {
  const input = [3, 1, 2];
  const out = mergeSort(input, numeric);
  assert.deepEqual(input, [3, 1, 2]);
  assert.notEqual(out, input);
});

test('is stable: equal items keep their original order', () => {
  const items = [
    { k: 1, n: 'a' }, { k: 0, n: 'b' }, { k: 1, n: 'c' }, { k: 0, n: 'd' }, { k: 1, n: 'e' },
  ];
  const out = mergeSort(items, (x, y) => x.k - y.k);
  assert.deepEqual(out.map((i) => i.n), ['b', 'd', 'a', 'c', 'e']);
});

test('matches the built-in sort on random data', () => {
  const data = Array.from({ length: 500 }, () => Math.floor(Math.random() * 100));
  assert.deepEqual(mergeSort(data, numeric), [...data].sort(numeric));
});

test('bad arguments are VALIDATION errors', () => {
  assert.equal(codeOf(() => mergeSort('nope', numeric)), 'VALIDATION');
  assert.equal(codeOf(() => mergeSort([1], null)), 'VALIDATION');
});
