import { describe, expect, it } from 'vitest';
import { scaleAmountText, scaleRecipe } from './recipe-scale';
import type { ParsedRecipe } from './server/ai/recipe-parse';

describe('scaleAmountText', () => {
	it('skaliert eine ganze Zahl am Anfang', () => {
		expect(scaleAmountText('250 g', 2)).toBe('500 g');
	});

	it('skaliert eine Kommazahl mit deutschem Komma', () => {
		expect(scaleAmountText('1,5 EL', 2)).toBe('3 EL');
	});

	it('rundet auf eine Nachkommastelle', () => {
		expect(scaleAmountText('1 Zwiebel', 1.5)).toBe('1,5 Zwiebel');
	});

	it('lässt Text ohne führende Zahl unverändert', () => {
		expect(scaleAmountText('etwas Salz', 2)).toBe('etwas Salz');
	});

	it('lässt bei Verhältnis 1 den Text unverändert', () => {
		expect(scaleAmountText('400 g', 1)).toBe('400 g');
	});
});

describe('scaleRecipe', () => {
	const recipe: ParsedRecipe = {
		title: 'Hackfleischpfanne',
		minutes: 25,
		portions: 1,
		ingredients: [
			{
				name: 'Hackfleisch',
				amountText: '200 g',
				source: 'stock',
				stockItemId: 42,
				amountBase: 200
			},
			{ name: 'Salz', amountText: 'etwas', source: 'staple', stockItemId: 0, amountBase: 0 },
			{ name: 'Milch', amountText: '1 Pck', source: 'stock', stockItemId: 7, amountBase: 0 }
		],
		steps: ['Anbraten.']
	};

	it('gibt dasselbe Rezept zurück, wenn sich die Portionenzahl nicht ändert', () => {
		expect(scaleRecipe(recipe, 1)).toBe(recipe);
	});

	it('verdoppelt Mengen und amountBase bei doppelten Portionen', () => {
		const scaled = scaleRecipe(recipe, 2);
		expect(scaled.portions).toBe(2);
		expect(scaled.ingredients[0]).toMatchObject({ amountText: '400 g', amountBase: 400 });
	});

	it('lässt eine Packung (amountBase 0) bei 0, da sie beim Kochen nicht angebrochen wird', () => {
		const scaled = scaleRecipe(recipe, 2);
		expect(scaled.ingredients[2].amountBase).toBe(0);
	});

	it('rechnet auch bei ungeraden Verhältnissen (1 auf 4)', () => {
		const scaled = scaleRecipe(recipe, 4);
		expect(scaled.ingredients[0]).toMatchObject({ amountText: '800 g', amountBase: 800 });
	});
});
