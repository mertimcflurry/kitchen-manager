import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { addStock, consume, findOrCreateProduct, listStock } from './queries';
import { product, stockItem } from './schema';
import { seedCategories, seedDevData } from './seed';
import {
	addProductToList,
	addTextToList,
	clearDoneShopping,
	listShopping,
	setShoppingDone,
	shoppingSuggestions
} from './shopping';

let db: Db;
let userId: number;
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	({ userId } = seedDevData(db));
});

/** Ein Produkt aus den Testdaten. */
function productId(name: string): number {
	return db.select().from(product).where(eq(product.name, name)).get()!.id;
}

describe('Einkaufsliste', () => {
	it('nimmt Freitext auf und behält die Reihenfolge', () => {
		addTextToList(db, userId, 'Zahnpasta');
		addTextToList(db, userId, 'Alufolie');

		expect(listShopping(db, userId).open.map((r) => r.name)).toEqual(['Zahnpasta', 'Alufolie']);
	});

	it('setzt denselben Posten nicht zweimal drauf', () => {
		addTextToList(db, userId, 'Zahnpasta');
		addTextToList(db, userId, '  zahnpasta ');

		// Zweimal „Milch" untereinander merkt man erst im Laden.
		expect(listShopping(db, userId).open).toHaveLength(1);
	});

	it('erkennt bekannte Produkte im Freitext', () => {
		addTextToList(db, userId, 'gouda');

		const row = listShopping(db, userId).open[0];
		expect(row.productId).toBe(productId('Gouda'));
		// Und trägt damit das Emoji seiner Kategorie statt des Notizzettels.
		expect(row.emoji).not.toBe('📝');
	});

	it('lässt Leeres folgenlos', () => {
		expect(addTextToList(db, userId, '   ')).toBeNull();
		expect(listShopping(db, userId).open).toHaveLength(0);
	});

	it('hakt ab, ohne zu löschen, und holt zurück', () => {
		const id = addTextToList(db, userId, 'Zahnpasta')!;

		setShoppingDone(db, userId, id, true);
		expect(listShopping(db, userId).open).toHaveLength(0);
		expect(listShopping(db, userId).done).toHaveLength(1);

		// Das Undo für den Fehlgriff im Laden: die Zeile steht noch da.
		setShoppingDone(db, userId, id, false);
		expect(listShopping(db, userId).open).toHaveLength(1);
	});

	it('räumt nur das Erledigte weg', () => {
		const first = addTextToList(db, userId, 'Zahnpasta')!;
		addTextToList(db, userId, 'Alufolie');
		setShoppingDone(db, userId, first, true);

		expect(clearDoneShopping(db, userId)).toBe(1);
		expect(listShopping(db, userId).open.map((r) => r.name)).toEqual(['Alufolie']);
		expect(listShopping(db, userId).done).toHaveLength(0);
	});
});

describe('Vorschläge', () => {
	/** Kauft ein Produkt n-mal und braucht alles davon auf. */
	function buyAndFinish(name: string, times: number) {
		const id = productId(name);
		for (const row of listStock(db, userId).filter((r) => r.productId === id))
			consume(db, userId, row.id);
		for (let i = 0; i < times; i++) {
			consume(db, userId, addStock(db, userId, { productId: id, quantity: 1, location: 'fridge' }));
		}
	}

	it('schlägt vor, was mehrfach gekauft und gerade alle ist', () => {
		buyAndFinish('Tofu natur', 2);

		expect(shoppingSuggestions(db, userId).map((s) => s.name)).toContain('Tofu natur');
	});

	it('schweigt bei Einmalkäufen', () => {
		const id = findOrCreateProduct(db, 'Sardellenpaste');
		consume(db, userId, addStock(db, userId, { productId: id, quantity: 1, location: 'pantry' }));

		// Einmal gekauft ist kein Vorrat, sondern ein Experiment.
		expect(shoppingSuggestions(db, userId).map((s) => s.name)).not.toContain('Sardellenpaste');
	});

	it('schweigt, solange noch etwas da ist', () => {
		buyAndFinish('Tofu natur', 2);
		addStock(db, userId, { productId: productId('Tofu natur'), quantity: 1, location: 'fridge' });

		expect(shoppingSuggestions(db, userId).map((s) => s.name)).not.toContain('Tofu natur');
	});

	it('schlägt nichts vor, was schon auf der Liste steht', () => {
		buyAndFinish('Tofu natur', 2);
		addProductToList(db, userId, productId('Tofu natur'));

		expect(shoppingSuggestions(db, userId).map((s) => s.name)).not.toContain('Tofu natur');
	});

	it('stellt das zuletzt Aufgebrauchte nach vorn', () => {
		buyAndFinish('Tofu natur', 2);
		buyAndFinish('Kichererbsen', 2);

		// Tofu ist vor drei Wochen ausgegangen, die Kichererbsen heute.
		const longAgo = new Date();
		longAgo.setDate(longAgo.getDate() - 21);
		db.update(stockItem)
			.set({ consumedAt: longAgo })
			.where(eq(stockItem.productId, productId('Tofu natur')))
			.run();

		// Was seit heute fehlt, steht oben — nicht das, was vor Wochen ausging.
		expect(shoppingSuggestions(db, userId)[0].name).toBe('Kichererbsen');
	});
});
