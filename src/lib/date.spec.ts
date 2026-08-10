import { describe, expect, it } from 'vitest';
import { daysUntil, estimateBestBefore, freshness } from './date';

describe('estimateBestBefore', () => {
	it('addiert die Haltbarkeit in Kalendertagen', () => {
		expect(estimateBestBefore(new Date(2026, 7, 10), 7)).toEqual(new Date(2026, 7, 17));
	});

	it('rechnet über den Monatswechsel', () => {
		expect(estimateBestBefore(new Date(2026, 7, 30), 3)).toEqual(new Date(2026, 8, 2));
	});

	it('überspringt die Zeitumstellung ohne Tagesverlust', () => {
		// Sommerzeitende in Europa: 25.10.2026. Ein Tag bleibt ein Tag.
		expect(estimateBestBefore(new Date(2026, 9, 24), 2)).toEqual(new Date(2026, 9, 26));
	});

	it('ignoriert die Uhrzeit des Kaufs', () => {
		expect(estimateBestBefore(new Date(2026, 7, 10, 23, 59), 1)).toEqual(new Date(2026, 7, 11));
	});
});

describe('daysUntil', () => {
	const now = new Date(2026, 7, 10, 14, 30);

	it('zählt volle Kalendertage', () => {
		expect(daysUntil(new Date(2026, 7, 13), now)).toBe(3);
	});

	it('ist heute gleich null, unabhängig von der Uhrzeit', () => {
		expect(daysUntil(new Date(2026, 7, 10, 6, 0), now)).toBe(0);
	});

	it('wird negativ, wenn das Datum vorbei ist', () => {
		expect(daysUntil(new Date(2026, 7, 8), now)).toBe(-2);
	});
});

describe('freshness', () => {
	const now = new Date(2026, 7, 10, 14, 30);

	it('meldet abgelaufen ab dem Folgetag', () => {
		expect(freshness(new Date(2026, 7, 9), now)).toBe('expired');
	});

	it('behandelt heute und morgen als kritisch', () => {
		expect(freshness(new Date(2026, 7, 10), now)).toBe('critical');
		expect(freshness(new Date(2026, 7, 11), now)).toBe('critical');
	});

	it('warnt bis drei Tage vorher', () => {
		expect(freshness(new Date(2026, 7, 13), now)).toBe('soon');
	});

	it('lässt alles darüber in Ruhe', () => {
		expect(freshness(new Date(2026, 7, 14), now)).toBe('fine');
	});
});
