// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { expect, it } from 'vitest';
import { formatModelRef } from './formatModelRef';

it.each([
  ['pi::p::m:cloud', { harness: 'pi', provider: 'p', id: 'm:cloud', label: 'm:cloud' }],
  ['p::m', { harness: null, provider: 'p', id: 'm', label: 'm' }],
  ['m', { harness: null, provider: null, id: 'm', label: 'm' }],
  ['bad::::key', { harness: null, provider: null, id: null, label: 'bad::::key' }],
  [undefined, { harness: null, provider: null, id: null, label: 'Unknown' }],
  ['default', { harness: null, provider: null, id: null, label: 'Unknown' }],
  [{}, { harness: null, provider: null, id: null, label: 'Unknown' }],
  ['  ', { harness: null, provider: null, id: null, label: 'Unknown' }],
])('formats %s honestly', (ref, expected) => {
  expect(formatModelRef(ref)).toEqual(expected);
});
