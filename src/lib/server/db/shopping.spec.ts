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
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	seedDevData(db);
});

/** Ein Produkt aus den Testdaten. */
function productId(name: string): number {
	return db.select().from(product).where(eq(product.name, name)).get()!.id;
}

describe('Einkaufsliste', () => {
	it('nimmt Freitext auf und behält die Reihenfolge', () => {
		addTextToList(db, 'Zahnpasta');
		addTextToList(db, 'Alufolie');

		expect(listShopping(db).open.map((r) => r.name)).toEqual(['Zahnpasta', 'Alufolie']);
	});

	it('setzt denselben Posten nicht zweimal drauf', () => {
		addTextToList(db, 'Zahnpasta');
		addTextToList(db, '  zahnpasta ');

		// Zweimal „Milch" untereinander merkt man erst im Laden.
		expect(listShopping(db).open).toHaveLength(1);
	});

	it('erkennt bekannte Produkte im Freitext', () => {
		addTextToList(db, 'gouda');

		const row = listShopping(db).open[0];
		expect(row.productId).toBe(productId('Gouda'));
		// Und trägt damit das Emoji seiner Kategorie statt des Notizzettels.
		expect(row.emoji).not.toBe('📝');
	});

	it('lässt Leeres folgenlos', () => {
		expect(addTextToList(db, '   ')).toBeNull();
		expect(listShopping(db).open).toHaveLength(0);
	});

	it('hakt ab, ohne zu löschen, und holt zurück', () => {
		const id = addTextToList(db, 'Zahnpasta')!;

		setShoppingDone(db, id, true);
		expect(listShopping(db).open).toHaveLength(0);
		expect(listShopping(db).done).toHaveLength(1);

		// Das Undo für den Fehlgriff im Laden: die Zeile steht noch da.
		setShoppingDone(db, id, false);
		expect(listShopping(db).open).toHaveLength(1);
	});

	it('räumt nur das Erledigte weg', () => {
		const first = addTextToList(db, 'Zahnpasta')!;
		addTextToList(db, 'Alufolie');
		setShoppingDone(db, first, true);

		expect(clearDoneShopping(db)).toBe(1);
		expect(listShopping(db).open.map((r) => r.name)).toEqual(['Alufolie']);
		expect(listShopping(db).done).toHaveLength(0);
	});
});

describe('Vorschläge', () => {
	/** Kauft ein Produkt n-mal und braucht alles davon auf. */
	function buyAndFinish(name: string, times: number) {
		const id = productId(name);
		for (const row of listStock(db).filter((r) => r.productId === id)) consume(db, row.id);
		for (let i = 0; i < times; i++) {
			consume(db, addStock(db, { productId: id, quantity: 1, location: 'fridge' }));
		}
	}

	it('schlägt vor, was mehrfach gekauft und gerade alle ist', () => {
		buyAndFinish('Tofu natur', 2);

		expect(shoppingSuggestions(db).map((s) => s.name)).toContain('Tofu natur');
	});

	it('schweigt bei Einmalkäufen', () => {
		const id = findOrCreateProduct(db, 'Sardellenpaste');
		consume(db, addStock(db, { productId: id, quantity: 1, location: 'pantry' }));

		// Einmal gekauft ist kein Vorrat, sondern ein Experiment.
		expect(shoppingSuggestions(db).map((s) => s.name)).not.toContain('Sardellenpaste');
	});

	it('schweigt, solange noch etwas da ist', () => {
		buyAndFinish('Tofu natur', 2);
		addStock(db, { productId: productId('Tofu natur'), quantity: 1, location: 'fridge' });

		expect(shoppingSuggestions(db).map((s) => s.name)).not.toContain('Tofu natur');
	});

	it('schlägt nichts vor, was schon auf der Liste steht', () => {
		buyAndFinish('Tofu natur', 2);
		addProductToList(db, productId('Tofu natur'));

		expect(shoppingSuggestions(db).map((s) => s.name)).not.toContain('Tofu natur');
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
		expect(shoppingSuggestions(db)[0].name).toBe('Kichererbsen');
	});
});
