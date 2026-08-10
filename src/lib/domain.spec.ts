import { describe, expect, it } from 'vitest';
import { formatQuantity, isCountable, toBaseUnit, toInputUnit } from './domain';

describe('toBaseUnit', () => {
	it('rechnet kg und l auf die Basiseinheit herunter', () => {
		expect(toBaseUnit(1.5, 'kg')).toEqual({ quantity: 1500, unit: 'g' });
		expect(toBaseUnit(2, 'l')).toEqual({ quantity: 2000, unit: 'ml' });
	});

	it('lässt Basiseinheiten und Zählbares unangetastet', () => {
		expect(toBaseUnit(400, 'g')).toEqual({ quantity: 400, unit: 'g' });
		expect(toBaseUnit(4, 'pack')).toEqual({ quantity: 4, unit: 'pack' });
	});
});

describe('toInputUnit', () => {
	it('schlägt ab tausend die große Einheit vor', () => {
		expect(toInputUnit(1500, 'g')).toEqual({ quantity: 1.5, unit: 'kg' });
		expect(toInputUnit(1000, 'ml')).toEqual({ quantity: 1, unit: 'l' });
	});

	it('bleibt darunter bei der kleinen', () => {
		expect(toInputUnit(999, 'g')).toEqual({ quantity: 999, unit: 'g' });
	});

	it('kehrt toBaseUnit sauber um', () => {
		const base = toBaseUnit(1.5, 'kg');
		expect(toInputUnit(base.quantity, base.unit)).toEqual({ quantity: 1.5, unit: 'kg' });
	});
});

describe('formatQuantity', () => {
	it('schreibt Mengen so, wie man sie sagt', () => {
		expect(formatQuantity(200, 'g')).toBe('200 g');
		expect(formatQuantity(1500, 'g')).toBe('1,5 kg');
		expect(formatQuantity(1000, 'ml')).toBe('1 l');
		expect(formatQuantity(4, 'pack')).toBe('4 Pck');
		expect(formatQuantity(6, 'piece')).toBe('6 Stück');
	});

	it('benutzt das deutsche Dezimalkomma und hängt keine Nullen an', () => {
		expect(formatQuantity(2500, 'ml')).toBe('2,5 l');
		expect(formatQuantity(2000, 'g')).toBe('2 kg');
	});
});

describe('isCountable', () => {
	it('trennt Zählbares von Fortlaufendem', () => {
		// Zählbares bekommt +/-, Fortlaufendes den Füllstand.
		expect(isCountable('piece')).toBe(true);
		expect(isCountable('pack')).toBe(true);
		expect(isCountable('g')).toBe(false);
		expect(isCountable('ml')).toBe(false);
	});
});
