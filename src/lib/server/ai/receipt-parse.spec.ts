import { describe, expect, it } from 'vitest';
import { coerceReceipt, normalizeRawText, receiptSchema } from './receipt-parse';

const CATEGORIES = ['Obst & Gemüse', 'Milchprodukte', 'Sonstiges'];

describe('coerceReceipt', () => {
	it('übernimmt eine saubere Zeile unverändert', () => {
		const result = coerceReceipt(
			{
				store: 'REWE',
				purchased_at: '2026-08-12',
				total_cents: 1234,
				lines: [
					{
						raw_text: 'G&G H-MILCH 3,5%',
						name: 'H-Milch',
						category: 'Milchprodukte',
						quantity: 2,
						unit: 'pack',
						price_cents: 198,
						confidence: 'high'
					}
				]
			},
			CATEGORIES
		);

		expect(result.store).toBe('REWE');
		expect(result.purchasedAt).toBe('2026-08-12');
		expect(result.lines).toEqual([
			{
				rawText: 'G&G H-MILCH 3,5%',
				name: 'H-Milch',
				category: 'Milchprodukte',
				quantity: 2,
				unit: 'pack',
				priceCents: 198,
				confidence: 'high'
			}
		]);
	});

	it('schiebt unbekannte Kategorien nach Sonstiges', () => {
		const { lines } = coerceReceipt(
			{ lines: [{ raw_text: 'X', name: 'X', category: 'Haustierbedarf', quantity: 1 }] },
			CATEGORIES
		);
		expect(lines[0].category).toBe('Sonstiges');
	});

	it('fällt bei unbrauchbarer Einheit und Menge auf sichere Werte zurück', () => {
		const { lines } = coerceReceipt(
			{ lines: [{ raw_text: 'X', name: 'X', quantity: -3, unit: 'kg' }] },
			CATEGORIES
		);
		expect(lines[0]).toMatchObject({ quantity: 1, unit: 'piece', confidence: 'low' });
	});

	it('nimmt den Bon-Wortlaut, wenn das Modell keinen Namen liefert', () => {
		const { lines } = coerceReceipt({ lines: [{ raw_text: 'BIO-TOFU NAT' }] }, CATEGORIES);
		expect(lines[0].name).toBe('BIO-TOFU NAT');
	});

	it('verwirft Zeilen ohne jeden Text', () => {
		const { lines } = coerceReceipt({ lines: [{ quantity: 2 }, 'Unsinn', null] }, CATEGORIES);
		expect(lines).toHaveLength(0);
	});

	it('überlebt eine Antwort, die gar kein Bon ist', () => {
		expect(coerceReceipt(null, CATEGORIES).lines).toEqual([]);
		expect(coerceReceipt({ lines: 'nein' }, CATEGORIES).lines).toEqual([]);
	});

	it('verwirft ein Datum, das kein Datum ist', () => {
		expect(coerceReceipt({ purchased_at: '12.08.2026', lines: [] }, CATEGORIES).purchasedAt).toBe(
			''
		);
	});

	it('kürzt zu lange Namen, statt sie durchzulassen', () => {
		const { lines } = coerceReceipt(
			{ lines: [{ raw_text: 'X', name: 'A'.repeat(200), category: 'Sonstiges' }] },
			CATEGORIES
		);
		expect(lines[0].name).toHaveLength(80);
	});
});

describe('normalizeRawText', () => {
	it('macht aus Schreibvarianten denselben Schlüssel', () => {
		expect(normalizeRawText('BIO-TOFU NAT 400G')).toBe(normalizeRawText('Bio Tofu nat. 400 g'));
	});

	it('behält Umlaute, weil sie den Artikel unterscheiden', () => {
		expect(normalizeRawText('KÄSE')).toBe('käse');
		expect(normalizeRawText('KÄSE')).not.toBe(normalizeRawText('KASE'));
	});

	it('gibt für reine Sonderzeichen einen leeren Schlüssel zurück', () => {
		expect(normalizeRawText('***')).toBe('');
	});
});

describe('receiptSchema', () => {
	it('lässt dem Modell nur die Kategorien, die es wirklich gibt', () => {
		const schema = receiptSchema(CATEGORIES) as {
			properties: { lines: { items: { properties: { category: { enum: string[] } } } } };
		};
		expect(schema.properties.lines.items.properties.category.enum).toEqual(CATEGORIES);
	});
});
