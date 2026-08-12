import { eq, isNull } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ParsedReceipt } from '../ai/receipt-parse';
import { createDb, type Db } from './client';
import {
	confirmReceipt,
	createPendingReceipt,
	discardReceipt,
	findAlias,
	loadReceiptReview,
	pendingReceipts,
	rememberAlias,
	saveParsedLines
} from './receipts';
import { seedCategories } from './seed';
import { addTextToList, listShopping } from './shopping';
import { category, product, productAlias, receipt, receiptLine, stockItem } from './schema';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
});

const PARSED: ParsedReceipt = {
	store: 'REWE',
	purchasedAt: '2026-08-10',
	totalCents: 1234,
	lines: [
		{
			rawText: 'BIO-TOFU NAT 400G',
			name: 'Tofu natur',
			category: 'Tofu & Fleischersatz',
			quantity: 2,
			unit: 'pack',
			priceCents: 398,
			confidence: 'high'
		},
		{
			rawText: 'TOMATEN RISPE',
			name: 'Rispentomaten',
			category: 'Obst & Gemüse',
			quantity: 412,
			unit: 'g',
			priceCents: 149,
			confidence: 'low'
		}
	]
};

function seedReceipt(): number {
	const id = createPendingReceipt(db);
	saveParsedLines(db, id, PARSED);
	return id;
}

describe('saveParsedLines', () => {
	it('schreibt Kopf und Zeilen weg', () => {
		const id = seedReceipt();
		const review = loadReceiptReview(db, id)!;

		expect(review.store).toBe('REWE');
		expect(review.lines).toHaveLength(2);
		expect(review.lines[0]).toMatchObject({ name: 'Tofu natur', quantity: 2, unit: 'pack' });
		expect(review.lines[1].confidence).toBe('low');
	});

	it('merkt sich die Kategorie des Modells für das spätere Anlegen', () => {
		const id = seedReceipt();
		expect(loadReceiptReview(db, id)!.lines[0].category).toBe('Tofu & Fleischersatz');
	});

	it('löst bekannte Bon-Bezeichnungen über die Alias-Tabelle auf', () => {
		const productId = db
			.insert(product)
			.values({ name: 'Tofu natur', categoryId: 1 })
			.returning({ id: product.id })
			.get().id;
		rememberAlias(db, 'BIO-TOFU NAT 400G', productId);

		const review = loadReceiptReview(db, seedReceipt())!;
		expect(review.lines[0].known).toBe(true);
		// Was einmal bestätigt wurde, gilt als sicher — auch wenn das Modell zweifelt.
		expect(review.lines[0].confidence).toBe('high');
		expect(review.lines[1].known).toBe(false);
	});
});

describe('confirmReceipt', () => {
	function decide(id: number, overrides: Partial<{ keep: boolean; quantity: number }> = {}) {
		return loadReceiptReview(db, id)!.lines.map((line) => ({
			id: line.id,
			name: line.name,
			quantity: overrides.quantity ?? line.quantity,
			unit: line.unit,
			location: 'fridge' as const,
			keep: overrides.keep ?? true
		}));
	}

	it('legt Produkte in der vorgeschlagenen Kategorie an, nicht in Sonstiges', () => {
		const id = seedReceipt();
		confirmReceipt(db, id, decide(id));

		const row = db
			.select({ categoryName: category.name })
			.from(product)
			.innerJoin(category, eq(product.categoryId, category.id))
			.where(eq(product.name, 'Tofu natur'))
			.get();
		expect(row?.categoryName).toBe('Tofu & Fleischersatz');
	});

	it('bucht die Zeilen als Bestand mit Herkunft ein', () => {
		const id = seedReceipt();
		expect(confirmReceipt(db, id, decide(id))).toEqual({ added: 2, rejected: 0 });

		const items = db.select().from(stockItem).all();
		expect(items).toHaveLength(2);
		expect(items.every((item) => item.receiptId === id)).toBe(true);
		expect(items[0].bestBefore).not.toBeNull();
	});

	it('hakt ab, was auf der Einkaufsliste stand', () => {
		addTextToList(db, 'Tofu natur');
		addTextToList(db, 'Zahnpasta');

		const id = seedReceipt();
		confirmReceipt(db, id, decide(id));

		// Der Bon weiß, was im Wagen lag — die Liste muss man dafür nicht
		// zweimal durchgehen. Was nicht auf dem Bon stand, bleibt offen.
		const list = listShopping(db);
		expect(list.done.map((row) => row.name)).toEqual(['Tofu natur']);
		expect(list.open.map((row) => row.name)).toEqual(['Zahnpasta']);
	});

	it('lernt für jede bestätigte Zeile einen Alias', () => {
		const id = seedReceipt();
		confirmReceipt(db, id, decide(id));

		expect(findAlias(db, 'bio tofu nat 400 g')?.name).toBe('Tofu natur');
		expect(db.select().from(productAlias).all()).toHaveLength(2);
	});

	it('legt verworfene Zeilen weder an noch als Alias ab', () => {
		const id = seedReceipt();
		expect(confirmReceipt(db, id, decide(id, { keep: false }))).toEqual({ added: 0, rejected: 2 });

		expect(db.select().from(stockItem).all()).toHaveLength(0);
		expect(db.select().from(productAlias).all()).toHaveLength(0);
	});

	it('übernimmt die korrigierte Menge, nicht die gelesene', () => {
		const id = seedReceipt();
		confirmReceipt(db, id, decide(id, { quantity: 5 }));
		expect(
			db
				.select()
				.from(stockItem)
				.all()
				.map((i) => i.quantity)
		).toEqual([5, 5]);
	});

	it('lässt keine Zeile offen zurück und schließt den Bon ab', () => {
		const id = seedReceipt();
		confirmReceipt(db, id, [decide(id)[0]]);

		const open = db.select().from(receiptLine).where(eq(receiptLine.status, 'pending')).all();
		expect(open).toHaveLength(0);
		expect(db.select().from(receipt).where(eq(receipt.id, id)).get()?.status).toBe('confirmed');
	});

	it('bucht einen zweiten Aufruf nicht noch einmal ein', () => {
		const id = seedReceipt();
		const decisions = decide(id);
		confirmReceipt(db, id, decisions);
		expect(confirmReceipt(db, id, decisions)).toEqual({ added: 0, rejected: 0 });
		expect(db.select().from(stockItem).all()).toHaveLength(2);
	});

	it('ordnet eine bekannte Bezeichnung dem gelernten Produkt zu, statt ein neues anzulegen', () => {
		const first = seedReceipt();
		confirmReceipt(db, first, decide(first));

		const second = seedReceipt();
		confirmReceipt(db, second, decide(second));

		expect(db.select().from(product).all()).toHaveLength(2);
		expect(db.select().from(stockItem).all()).toHaveLength(4);
	});
});

describe('pendingReceipts', () => {
	it('zeigt nur ungeprüfte Bons mit Zeilen', () => {
		const withLines = seedReceipt();
		createPendingReceipt(db); // ohne Zeilen — nichts zu prüfen

		expect(pendingReceipts(db)).toEqual([{ id: withLines, store: 'REWE', lines: 2 }]);
	});

	it('vergisst verworfene Bons', () => {
		const id = seedReceipt();
		discardReceipt(db, id, '{"lines":[]}');

		expect(pendingReceipts(db)).toHaveLength(0);
		const row = db.select().from(receipt).where(eq(receipt.id, id)).get();
		// Die Rohantwort bleibt: genau an den Fehlschlägen lässt sich der Prompt schärfen.
		expect(row?.rawResponse).toBe('{"lines":[]}');
	});
});

describe('loadReceiptReview', () => {
	it('gibt für einen unbekannten Bon nichts zurück', () => {
		expect(loadReceiptReview(db, 999)).toBeNull();
	});

	it('zeigt nach dem Bestätigen keine offenen Zeilen mehr', () => {
		const id = seedReceipt();
		confirmReceipt(
			db,
			id,
			loadReceiptReview(db, id)!.lines.map((line) => ({
				id: line.id,
				name: line.name,
				quantity: line.quantity,
				unit: line.unit,
				location: 'pantry' as const,
				keep: true
			}))
		);

		expect(loadReceiptReview(db, id)!.lines).toHaveLength(0);
		expect(db.select().from(stockItem).where(isNull(stockItem.consumedAt)).all()[0].location).toBe(
			'pantry'
		);
	});
});
