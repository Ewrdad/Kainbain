// Domain: The Work — subject unit tests for stored-record parsing.
import { describe, it, expect } from 'vitest';
import { parseStoredRecords, safeParseJsonArray } from './taskFiles.js';

describe('The Work: stored records', () => {
	it('reads structured records while rejecting malformed or scalar values', () => {
		expect(parseStoredRecords('[{"duration":12}]')).toEqual([{ duration: 12 }]);
		expect(parseStoredRecords('[{"a":1},"x",null,[1]]')).toEqual([{ a: 1 }]);
		expect(parseStoredRecords('not-json')).toEqual([]);
		expect(parseStoredRecords('{"a":1}')).toEqual([]);
		expect(parseStoredRecords('')).toEqual([]);
	});

	it('keeps string-array parsing defensive', () => {
		expect(safeParseJsonArray('["a","b"]')).toEqual(['a', 'b']);
		expect(safeParseJsonArray('broken')).toEqual([]);
	});
});
