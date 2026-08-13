import { describe, expect, it } from 'vitest';
import { guessCategoryName } from './category-guess';

describe('guessCategoryName', () => {
	it('erkennt Obst und Gemüse', () => {
		expect(guessCategoryName('Pfirsich')).toBe('Obst & Gemüse');
		expect(guessCategoryName('Bio Tomaten')).toBe('Obst & Gemüse');
	});

	it('erkennt andere Kategorien über eigene Wörter', () => {
		expect(guessCategoryName('Gouda')).toBe('Käse');
		expect(guessCategoryName('Hähnchenbrust')).toBe(undefined); // Kompositum, siehe unten
		expect(guessCategoryName('Hähnchen Filet')).toBe('Fleisch & Fisch');
	});

	it('ist case-insensitive', () => {
		expect(guessCategoryName('PFIRSICH')).toBe('Obst & Gemüse');
	});

	it('hängt bei Komposita nicht an einem Teilstring, sondern lässt lieber offen', () => {
		expect(guessCategoryName('Pfirsichjoghurt')).toBe(undefined);
	});

	it('gibt bei unbekannten Namen nichts zurück', () => {
		expect(guessCategoryName('Erfundenes Zeug')).toBe(undefined);
	});
});
