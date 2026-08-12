import { describe, expect, it } from 'vitest';
import {
	countFillLevel,
	defaultLocationFor,
	formatQuantity,
	isCountable,
	remainingQuantity,
	toBaseUnit,
	toInputUnit
} from './domain';

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

describe('remainingQuantity', () => {
	it('verrechnet Füllstand und Menge bei loser Ware', () => {
		// 200 g Gouda, halb aufgebraucht: „200 g" neben „50 %" wäre irreführend.
		expect(remainingQuantity(200, 'g', 50)).toBe(100);
		expect(remainingQuantity(1000, 'ml', 25)).toBe(250);
	});

	it('lässt ungeöffnete Posten unangetastet', () => {
		expect(remainingQuantity(200, 'g', null)).toBe(200);
	});

	it('lässt Zählbares unangetastet, auch wenn ein Stück angebrochen ist', () => {
		// Ein angefangener Joghurt bleibt im Bestand ein ganzes Stück —
		// „0,75 Stück" wäre keine ehrliche Angabe.
		expect(remainingQuantity(1, 'piece', 75)).toBe(1);
		expect(remainingQuantity(3, 'pack', 50)).toBe(3);
	});
});

describe('defaultLocationFor', () => {
	it('legt Tiefkühl und Vorrat dorthin, wo sie hingehören', () => {
		expect(defaultLocationFor('Tiefkühl')).toBe('freezer');
		expect(defaultLocationFor('Trockenvorrat')).toBe('pantry');
		expect(defaultLocationFor('Konserven')).toBe('pantry');
	});

	it('fällt auf den Kühlschrank zurück, wenn die Kategorie nichts sagt', () => {
		// Auch für Namen, die es in der Tabelle nicht gibt — dann verhält sich
		// der Prüf-Screen wie vorher.
		expect(defaultLocationFor('Milchprodukte')).toBe('fridge');
		expect(defaultLocationFor('Erfundene Kategorie')).toBe('fridge');
	});
});

describe('countFillLevel', () => {
	it('macht aus fünf von zehn Eiern die Hälfte', () => {
		expect(countFillLevel(5, 10, 'piece')).toBe(50);
		expect(countFillLevel(7, 10, 'piece')).toBe(75);
		expect(countFillLevel(3, 10, 'piece')).toBe(25);
		expect(countFillLevel(3, 4, 'pack')).toBe(75);
	});

	it('lässt auch beim letzten Stück noch ein Segment stehen', () => {
		// Ein leerer Balken sähe aus wie ein Fehler, obwohl noch ein Ei da ist.
		expect(countFillLevel(1, 10, 'piece')).toBe(25);
	});

	it('bleibt weg, solange nichts entnommen wurde', () => {
		// Ein Balken, der in jeder Zeile voll steht, sagt nichts.
		expect(countFillLevel(10, 10, 'piece')).toBeNull();
		expect(countFillLevel(12, 10, 'piece')).toBeNull();
	});

	it('bleibt weg bei Einzelstücken und ohne bekannte Startmenge', () => {
		expect(countFillLevel(1, 1, 'piece')).toBeNull();
		expect(countFillLevel(5, null, 'piece')).toBeNull();
	});

	it('rührt lose Ware nicht an — die hat ihren Füllstand', () => {
		expect(countFillLevel(100, 200, 'g')).toBeNull();
		expect(countFillLevel(500, 1000, 'ml')).toBeNull();
	});
});
