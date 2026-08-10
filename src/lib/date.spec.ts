import { describe, expect, it } from 'vitest';
import { daysUntil, estimateBestBefore, formatDaysUntil, freshness } from './date';

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

describe('formatDaysUntil', () => {
	const now = new Date(2026, 7, 10, 14, 30);
	const inDays = (n: number) => {
		const d = new Date(2026, 7, 10);
		d.setDate(d.getDate() + n);
		return d;
	};

	it('nennt den Nahbereich beim Namen statt in Zahlen', () => {
		expect(formatDaysUntil(inDays(0), now)).toBe('heute');
		expect(formatDaysUntil(inDays(1), now)).toBe('morgen');
	});

	it('zählt die nächsten Tage einzeln', () => {
		expect(formatDaysUntil(inDays(3), now)).toBe('in 3 Tagen');
	});

	it('wird gröber, je weiter es weg ist', () => {
		expect(formatDaysUntil(inDays(10), now)).toBe('in einer Woche');
		expect(formatDaysUntil(inDays(30), now)).toBe('in 4 Wochen');
		expect(formatDaysUntil(inDays(200), now)).toBe('in 7 Monaten');
		expect(formatDaysUntil(inDays(400), now)).toBe('über ein Jahr');
	});

	it('sagt beim Abgelaufenen, wie lange schon', () => {
		expect(formatDaysUntil(inDays(-1), now)).toBe('gestern abgelaufen');
		expect(formatDaysUntil(inDays(-5), now)).toBe('5 Tage über');
	});
});
