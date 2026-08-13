import { describe, expect, it } from 'vitest';
import {
	buildRecipeUserPrompt,
	coerceRecipe,
	formatStockForPrompt,
	formatStockLine,
	recipeSchema,
	type StockLineInput
} from './recipe-parse';

const NOW = new Date('2026-08-12T12:00:00');

describe('formatStockLine', () => {
	it('formatiert lose Ware ohne Angebrochen-Hinweis', () => {
		const row: StockLineInput = {
			id: 42,
			name: 'Hackfleisch',
			quantity: 400,
			unit: 'g',
			fillLevel: null,
			location: 'fridge',
			bestBefore: new Date('2026-08-13')
		};
		expect(formatStockLine(row, NOW)).toBe(
			'#42 Hackfleisch · 400 g · Kühlschrank · läuft morgen ab'
		);
	});

	it('formatiert eine ungeöffnete Packung mit Hinweis', () => {
		const row: StockLineInput = {
			id: 17,
			name: 'Milch',
			quantity: 1,
			unit: 'pack',
			fillLevel: null,
			location: 'fridge',
			bestBefore: new Date('2026-08-20')
		};
		expect(formatStockLine(row, NOW)).toBe('#17 Milch · 1 Pck · Kühlschrank · 8 Tage · ungeöffnet');
	});

	it('markiert eine angebrochene Packung als angebrochen', () => {
		const row: StockLineInput = {
			id: 5,
			name: 'Butter',
			quantity: 1,
			unit: 'pack',
			fillLevel: 75,
			location: 'fridge',
			bestBefore: new Date('2026-08-25')
		};
		expect(formatStockLine(row, NOW)).toContain('angebrochen');
	});

	it('rechnet lose Ware auf die Restmenge um, nicht auf die Kaufmenge', () => {
		const row: StockLineInput = {
			id: 9,
			name: 'Saft',
			quantity: 1000,
			unit: 'ml',
			fillLevel: 50,
			location: 'fridge',
			bestBefore: new Date('2026-08-15')
		};
		expect(formatStockLine(row, NOW)).toContain('500 ml');
	});

	it('zeigt ein abgelaufenes Datum als abgelaufen', () => {
		const row: StockLineInput = {
			id: 1,
			name: 'Joghurt',
			quantity: 1,
			unit: 'piece',
			fillLevel: null,
			location: 'fridge',
			bestBefore: new Date('2026-08-01')
		};
		expect(formatStockLine(row, NOW)).toContain('abgelaufen');
	});

	it('zeigt Posten ohne MHD als "ohne MHD"', () => {
		const row: StockLineInput = {
			id: 2,
			name: 'Reis',
			quantity: 500,
			unit: 'g',
			fillLevel: null,
			location: 'pantry',
			bestBefore: null
		};
		expect(formatStockLine(row, NOW)).toContain('ohne MHD');
	});
});

describe('formatStockForPrompt', () => {
	it('meldet einen leeren Bestand statt einer leeren Zeile', () => {
		expect(formatStockForPrompt([], NOW)).toBe('(Bestand ist leer)');
	});

	it('reiht mehrere Zeilen zeilenweise auf', () => {
		const rows: StockLineInput[] = [
			{
				id: 1,
				name: 'A',
				quantity: 1,
				unit: 'piece',
				fillLevel: null,
				location: 'fridge',
				bestBefore: null
			},
			{
				id: 2,
				name: 'B',
				quantity: 1,
				unit: 'piece',
				fillLevel: null,
				location: 'pantry',
				bestBefore: null
			}
		];
		expect(formatStockForPrompt(rows, NOW).split('\n')).toHaveLength(2);
	});
});

describe('buildRecipeUserPrompt', () => {
	it('enthält Bestand und Portionenzahl', () => {
		const prompt = buildRecipeUserPrompt([], 2, undefined, undefined, NOW);
		expect(prompt).toContain('Portionen: 2');
		expect(prompt).toContain('Bestand ist leer');
		expect(prompt).not.toContain('Nicht schon wieder');
	});

	it('hängt den abgelehnten Titel für den Nachschlag an', () => {
		const prompt = buildRecipeUserPrompt([], 1, 'Nudeln mit Tomatensauce', undefined, NOW);
		expect(prompt).toContain('Nicht schon wieder: Nudeln mit Tomatensauce');
	});

	it('lässt einen leeren abgelehnten Titel weg', () => {
		const prompt = buildRecipeUserPrompt([], 1, '   ', undefined, NOW);
		expect(prompt).not.toContain('Nicht schon wieder');
	});

	it('hängt die Tendenz an', () => {
		const prompt = buildRecipeUserPrompt([], 1, undefined, { mood: 'herzhaft' }, NOW);
		expect(prompt).toContain('Tendenz: herzhaft');
	});

	it('hängt den Wunsch an und kürzt ihn', () => {
		const prompt = buildRecipeUserPrompt([], 1, undefined, { direction: 'A'.repeat(200) }, NOW);
		expect(prompt).toContain('Wunsch: ' + 'A'.repeat(80));
		expect(prompt).not.toContain('A'.repeat(81));
	});

	it('lässt einen leeren Wunsch weg', () => {
		const prompt = buildRecipeUserPrompt([], 1, undefined, { direction: '   ' }, NOW);
		expect(prompt).not.toContain('Wunsch');
	});

	it('hängt die Diät an', () => {
		const prompt = buildRecipeUserPrompt([], 1, undefined, { diet: 'vegan' }, NOW);
		expect(prompt).toContain('Diät: vegan');
	});

	it('lässt die Diät ohne Angabe weg', () => {
		const prompt = buildRecipeUserPrompt([], 1, undefined, {}, NOW);
		expect(prompt).not.toContain('Diät');
	});
});

describe('recipeSchema', () => {
	it('lässt stock_item_id nur echte Bestands-IDs plus 0', () => {
		const schema = recipeSchema([42, 17]) as {
			properties: { ingredients: { items: { properties: { stock_item_id: { enum: number[] } } } } };
		};
		expect(schema.properties.ingredients.items.properties.stock_item_id.enum).toEqual([0, 42, 17]);
	});
});

describe('coerceRecipe', () => {
	const KNOWN = new Set([42, 17]);

	it('übernimmt eine saubere Antwort', () => {
		const result = coerceRecipe(
			{
				title: 'Hackfleischpfanne',
				minutes: 25,
				portions: 2,
				ingredients: [
					{
						name: 'Hackfleisch',
						amount_text: '400 g',
						source: 'stock',
						stock_item_id: 42,
						amount_base: 400
					},
					{
						name: 'Salz',
						amount_text: 'etwas',
						source: 'staple',
						stock_item_id: 0,
						amount_base: 0
					},
					{
						name: 'Paprika',
						amount_text: '2 Stück',
						source: 'missing',
						stock_item_id: 0,
						amount_base: 0
					}
				],
				steps: ['Zwiebeln anbraten.', 'Hackfleisch dazugeben.']
			},
			KNOWN
		);

		expect(result).toEqual({
			title: 'Hackfleischpfanne',
			minutes: 25,
			portions: 2,
			ingredients: [
				{
					name: 'Hackfleisch',
					amountText: '400 g',
					source: 'stock',
					stockItemId: 42,
					amountBase: 400
				},
				{ name: 'Salz', amountText: 'etwas', source: 'staple', stockItemId: 0, amountBase: 0 },
				{ name: 'Paprika', amountText: '2 Stück', source: 'missing', stockItemId: 0, amountBase: 0 }
			],
			steps: ['Zwiebeln anbraten.', 'Hackfleisch dazugeben.']
		});
	});

	it('entwertet eine behauptete Bestandszutat mit unbekannter ID zu missing', () => {
		const result = coerceRecipe(
			{
				title: 'X',
				minutes: 10,
				portions: 1,
				ingredients: [
					{
						name: 'Erfunden',
						amount_text: '1',
						source: 'stock',
						stock_item_id: 999,
						amount_base: 1
					}
				],
				steps: ['Schritt.']
			},
			KNOWN
		);
		expect(result?.ingredients[0]).toMatchObject({
			source: 'missing',
			stockItemId: 0,
			amountBase: 0
		});
	});

	it('kappt eine unplausible Menge, statt sie durchzulassen', () => {
		const result = coerceRecipe(
			{
				title: 'X',
				minutes: 10,
				portions: 1,
				ingredients: [
					{
						name: 'Joghurt',
						amount_text: '50 kg',
						source: 'stock',
						stock_item_id: 42,
						amount_base: 50_000
					}
				],
				steps: ['Schritt.']
			},
			KNOWN
		);
		expect(result?.ingredients[0].amountBase).toBeLessThanOrEqual(20_000);
	});

	it('fällt bei unbrauchbaren Minuten und Portionen auf sichere Werte zurück', () => {
		const result = coerceRecipe(
			{ title: 'X', minutes: -5, portions: 0, ingredients: [], steps: ['Schritt.'] },
			KNOWN
		);
		expect(result).toMatchObject({ minutes: 30, portions: 1 });
	});

	it('verwirft eine Antwort ohne Titel', () => {
		expect(coerceRecipe({ title: '', steps: ['Schritt.'] }, KNOWN)).toBeNull();
	});

	it('verwirft eine Antwort ohne Schritte', () => {
		expect(coerceRecipe({ title: 'X', steps: [] }, KNOWN)).toBeNull();
	});

	it('überlebt eine Antwort, die kein Rezept ist', () => {
		expect(coerceRecipe(null, KNOWN)).toBeNull();
		expect(coerceRecipe('Unsinn', KNOWN)).toBeNull();
	});

	it('kürzt zu lange Titel und Schritte', () => {
		const result = coerceRecipe({ title: 'A'.repeat(200), steps: ['B'.repeat(300)] }, KNOWN);
		expect(result?.title).toHaveLength(80);
		expect(result?.steps[0]).toHaveLength(200);
	});

	it('kappt bei mehr als zwölf Schritten', () => {
		const steps = Array.from({ length: 20 }, (_, i) => `Schritt ${i}`);
		const result = coerceRecipe({ title: 'X', steps }, KNOWN);
		expect(result?.steps).toHaveLength(12);
	});
});
