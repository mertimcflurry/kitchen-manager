import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { cookIngredients, recipeStock, undoCookIngredients } from './cooking';
import { addStock, findOrCreateProduct } from './queries';
import { seedCategories, seedDevData } from './seed';
import { stockItem } from './schema';
import { eq } from 'drizzle-orm';

let db: Db;
let userId: number;
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	({ userId } = seedDevData(db));
});

describe('recipeStock', () => {
	it('liefert nur offenen Bestand', () => {
		const productId = findOrCreateProduct(db, 'Testprodukt');
		const id = addStock(db, userId, { productId, quantity: 400, unit: 'g', location: 'fridge' });

		const rows = recipeStock(db, userId);
		expect(rows.find((r) => r.id === id)).toMatchObject({
			name: 'Testprodukt',
			quantity: 400,
			unit: 'g',
			location: 'fridge'
		});
	});

	it('lässt aufgebrauchte Posten weg', () => {
		const productId = findOrCreateProduct(db, 'Aufgebraucht');
		const id = addStock(db, userId, { productId, quantity: 1, unit: 'piece', location: 'fridge' });
		db.update(stockItem).set({ consumedAt: new Date() }).where(eq(stockItem.id, id)).run();

		expect(recipeStock(db, userId).some((r) => r.id === id)).toBe(false);
	});
});

describe('cookIngredients', () => {
	it('zieht lose Ware um amountBase ab', () => {
		const productId = findOrCreateProduct(db, 'Hackfleisch');
		const id = addStock(db, userId, { productId, quantity: 500, unit: 'g', location: 'fridge' });

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 200 }]);

		expect(snapshots).toEqual([{ id, quantityBefore: 500, fillLevelBefore: null }]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(300);
		expect(row?.consumedAt).toBeNull();
	});

	it('klemmt lose Ware auf 0, statt ins Negative zu rechnen', () => {
		const productId = findOrCreateProduct(db, 'Mehl');
		const id = addStock(db, userId, { productId, quantity: 150, unit: 'g', location: 'pantry' });

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 500 }]);

		expect(snapshots).toEqual([{ id, quantityBefore: 150, fillLevelBefore: null }]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(0);
		expect(row?.consumedAt).not.toBeNull();
	});

	it('rundet bei Stückware und klemmt gegen den Restbestand', () => {
		const productId = findOrCreateProduct(db, 'Eier');
		const id = addStock(db, userId, { productId, quantity: 3, unit: 'piece', location: 'fridge' });

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 10.4 }]);

		expect(snapshots).toEqual([{ id, quantityBefore: 3, fillLevelBefore: null }]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(0);
		expect(row?.consumedAt).not.toBeNull();
	});

	it('bucht bei angebrochener loser Ware gegen die Restmenge ab, nicht gegen die Kaufmenge', () => {
		const productId = findOrCreateProduct(db, 'Saft');
		// 1 l gekauft, zur Hälfte aufgebraucht -> 500 ml Restmenge laut Anzeige.
		const id = addStock(db, userId, { productId, quantity: 1000, unit: 'ml', location: 'fridge' });
		db.update(stockItem).set({ fillLevel: 50 }).where(eq(stockItem.id, id)).run();

		// Rezept nimmt genau die gemeldeten 500 ml -> Rest sollte 0 sein, nicht -500.
		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 500 }]);

		expect(snapshots).toEqual([{ id, quantityBefore: 1000, fillLevelBefore: 50 }]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		// Kaufmenge bleibt unverändert, der Posten gilt als aufgebraucht.
		expect(row?.quantity).toBe(1000);
		expect(row?.consumedAt).not.toBeNull();
	});

	it('reduziert bei angebrochener loser Ware nur den Füllstand, wenn Restmenge übrig bleibt', () => {
		const productId = findOrCreateProduct(db, 'Milch');
		const id = addStock(db, userId, { productId, quantity: 1000, unit: 'ml', location: 'fridge' });
		db.update(stockItem).set({ fillLevel: 100 }).where(eq(stockItem.id, id)).run();

		// 1000 ml Restmenge, Rezept nimmt 250 ml -> 750 ml übrig, also 75 %.
		cookIngredients(db, userId, [{ stockItemId: id, amountBase: 250 }]);

		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(1000);
		expect(row?.fillLevel).toBe(75);
		expect(row?.consumedAt).toBeNull();
	});

	it('lässt eine verschlossene Packung stehen, wenn amountBase 0 ist', () => {
		const productId = findOrCreateProduct(db, 'Salz');
		const id = addStock(db, userId, { productId, quantity: 1, unit: 'pack', location: 'pantry' });

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 0 }]);

		expect(snapshots).toEqual([]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(1);
	});

	it('lässt eine verschlossene Packung auch dann stehen, wenn amount_base fälschlich > 0 kommt', () => {
		const productId = findOrCreateProduct(db, 'Nudeln');
		const id = addStock(db, userId, { productId, quantity: 3, unit: 'pack', location: 'pantry' });

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 500 }]);

		expect(snapshots).toEqual([]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(3);
		expect(row?.consumedAt).toBeNull();
	});

	it('überspringt einen bereits aufgebrauchten Posten', () => {
		const productId = findOrCreateProduct(db, 'Schon weg');
		const id = addStock(db, userId, { productId, quantity: 1, unit: 'piece', location: 'fridge' });
		db.update(stockItem).set({ consumedAt: new Date() }).where(eq(stockItem.id, id)).run();

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 1 }]);
		expect(snapshots).toEqual([]);
	});

	it('lässt eine zweite, nicht referenzierte Charge desselben Produkts unangetastet', () => {
		const productId = findOrCreateProduct(db, 'Joghurt');
		const referenced = addStock(db, userId, {
			productId,
			quantity: 1,
			unit: 'pack',
			location: 'fridge'
		});
		const otherBatch = addStock(db, userId, {
			productId,
			quantity: 1,
			unit: 'pack',
			location: 'fridge'
		});

		const snapshots = cookIngredients(db, userId, [{ stockItemId: referenced, amountBase: 0 }]);

		expect(snapshots).toEqual([]);
		const rows = db.select().from(stockItem).where(eq(stockItem.productId, productId)).all();
		expect(rows.find((r) => r.id === referenced)?.quantity).toBe(1);
		expect(rows.find((r) => r.id === otherBatch)?.quantity).toBe(1);
		expect(rows.find((r) => r.id === otherBatch)?.consumedAt).toBeNull();
	});

	it('überspringt eine ungültige stock_item_id, ohne die übrigen Zutaten zu blockieren', () => {
		const productId = findOrCreateProduct(db, 'Milch');
		const id = addStock(db, userId, { productId, quantity: 500, unit: 'ml', location: 'fridge' });

		const snapshots = cookIngredients(db, userId, [
			{ stockItemId: 999_999, amountBase: 100 },
			{ stockItemId: id, amountBase: 100 }
		]);

		expect(snapshots).toEqual([{ id, quantityBefore: 500, fillLevelBefore: null }]);
	});

	it('fasst zwei Zutaten mit derselben stockItemId zusammen, statt doppelt vom Ausgangswert abzuziehen', () => {
		const productId = findOrCreateProduct(db, 'Milch');
		const id = addStock(db, userId, { productId, quantity: 1000, unit: 'ml', location: 'fridge' });

		// "Milch für die Sauce" und "Milch für den Teig" — plausible Modellantwort.
		const snapshots = cookIngredients(db, userId, [
			{ stockItemId: id, amountBase: 200 },
			{ stockItemId: id, amountBase: 300 }
		]);

		// Nur ein Snapshot, mit dem allerersten (unveränderten) Stand.
		expect(snapshots).toEqual([{ id, quantityBefore: 1000, fillLevelBefore: null }]);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(500);
	});
});

describe('undoCookIngredients', () => {
	it('stellt die Menge vor dem Abbuchen wieder her', () => {
		const productId = findOrCreateProduct(db, 'Reis');
		const id = addStock(db, userId, { productId, quantity: 500, unit: 'g', location: 'pantry' });

		const snapshots = cookIngredients(db, userId, [{ stockItemId: id, amountBase: 500 }]);
		expect(
			db.select().from(stockItem).where(eq(stockItem.id, id)).get()?.consumedAt
		).not.toBeNull();

		undoCookIngredients(db, userId, snapshots);

		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(500);
		expect(row?.consumedAt).toBeNull();
	});

	it('stellt bei doppelt referenzierter stockItemId den ursprünglichen, nicht den reduzierten Stand wieder her', () => {
		const productId = findOrCreateProduct(db, 'Milch');
		const id = addStock(db, userId, { productId, quantity: 1000, unit: 'ml', location: 'fridge' });

		// "Milch für die Sauce" (400 ml) und "Milch für den Teig" (400 ml) — noch
		// Rest übrig, kein Aufbrauchen, damit der reduzierte Zwischenstand nicht
		// zufällig mit dem Ausgangswert zusammenfällt.
		const snapshots = cookIngredients(db, userId, [
			{ stockItemId: id, amountBase: 400 },
			{ stockItemId: id, amountBase: 400 }
		]);
		expect(db.select().from(stockItem).where(eq(stockItem.id, id)).get()?.quantity).toBe(200);

		undoCookIngredients(db, userId, snapshots);

		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
		expect(row?.quantity).toBe(1000);
		expect(row?.consumedAt).toBeNull();
	});
});
