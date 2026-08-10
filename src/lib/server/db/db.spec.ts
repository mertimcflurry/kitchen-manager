import { asc, eq, isNull } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { seedCategories, seedDevData } from './seed';
import {
	FILL_LEVELS,
	category,
	product,
	productAlias,
	receipt,
	receiptImage,
	stockItem
} from './schema';

/** Frische Datenbank im Speicher — die Tests fassen data/kitchen.db nie an. */
function freshDb(): Db {
	const db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	return db;
}

let db: Db;
beforeEach(() => {
	db = freshDb();
});

describe('seedCategories', () => {
	it('legt die Startkategorien an', () => {
		const added = seedCategories(db);
		expect(added).toBeGreaterThan(0);
		expect(db.select().from(category).all()).toHaveLength(added);
	});

	it('ist idempotent — ein zweiter Lauf legt nichts nach', () => {
		const first = seedCategories(db);
		const second = seedCategories(db);
		expect(second).toBe(0);
		expect(db.select().from(category).all()).toHaveLength(first);
	});

	it('überschreibt angepasste Haltbarkeiten nicht', () => {
		seedCategories(db);
		db.update(category).set({ defaultShelfLifeDays: 999 }).where(eq(category.name, 'Käse')).run();
		seedCategories(db);
		const cheese = db.select().from(category).where(eq(category.name, 'Käse')).get();
		expect(cheese?.defaultShelfLifeDays).toBe(999);
	});
});

describe('Fremdschlüssel', () => {
	it('weist ein Produkt ohne gültige Kategorie ab', () => {
		expect(() =>
			db.insert(product).values({ name: 'Geisterware', categoryId: 9999 }).run()
		).toThrow(/FOREIGN KEY/i);
	});

	it('räumt Bestandsposten mit auf, wenn das Produkt gelöscht wird', () => {
		seedCategories(db);
		const cat = db.select().from(category).get()!;
		const prod = db
			.insert(product)
			.values({ name: 'Testware', categoryId: cat.id })
			.returning()
			.get();
		db.insert(stockItem).values({ productId: prod.id }).run();
		expect(db.select().from(stockItem).all()).toHaveLength(1);

		db.delete(product).where(eq(product.id, prod.id)).run();
		expect(db.select().from(stockItem).all()).toHaveLength(0);
	});
});

describe('product_alias', () => {
	it('lässt denselben normalisierten Text nur einmal zu', () => {
		seedCategories(db);
		const cat = db.select().from(category).get()!;
		const prod = db
			.insert(product)
			.values({ name: 'Tofu natur', categoryId: cat.id })
			.returning()
			.get();

		db.insert(productAlias)
			.values({ rawTextNormalized: 'biotofunat400g', productId: prod.id })
			.run();
		expect(() =>
			db
				.insert(productAlias)
				.values({ rawTextNormalized: 'biotofunat400g', productId: prod.id })
				.run()
		).toThrow(/UNIQUE/i);
	});
});

describe('Bestandsabfrage', () => {
	beforeEach(() => {
		seedCategories(db);
		seedDevData(db);
	});

	it('legt Testdaten nicht doppelt an', () => {
		const before = db.select().from(stockItem).all().length;
		const result = seedDevData(db);
		expect(result).toEqual({ products: 0, stock: 0 });
		expect(db.select().from(stockItem).all()).toHaveLength(before);
	});

	it('sortiert offenen Bestand nach Ablaufdatum', () => {
		const rows = db
			.select({ bestBefore: stockItem.bestBefore })
			.from(stockItem)
			.where(isNull(stockItem.consumedAt))
			.orderBy(asc(stockItem.bestBefore))
			.all();

		expect(rows.length).toBeGreaterThan(1);
		const times = rows.map((r) => r.bestBefore!.getTime());
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it('lässt ungeöffnete Ware ohne Füllstand', () => {
		const rows = db.select().from(stockItem).all();
		// Der Normalfall ist NULL: Füllstand ist eine Zusatzangabe, keine Pflicht.
		expect(rows.filter((r) => r.fillLevel === null).length).toBeGreaterThan(0);
	});

	it('speichert Füllstände nur in den vier vorgesehenen Stufen', () => {
		const opened = db
			.select()
			.from(stockItem)
			.all()
			.filter((r) => r.fillLevel !== null);

		expect(opened.length).toBeGreaterThan(0);
		for (const row of opened) {
			expect(FILL_LEVELS).toContain(row.fillLevel as (typeof FILL_LEVELS)[number]);
		}
	});

	it('blendet Aufgebrauchtes aus, ohne die Zeile zu löschen', () => {
		const first = db.select().from(stockItem).get()!;
		db.update(stockItem).set({ consumedAt: new Date() }).where(eq(stockItem.id, first.id)).run();

		const open = db.select().from(stockItem).where(isNull(stockItem.consumedAt)).all();
		expect(open.find((r) => r.id === first.id)).toBeUndefined();
		// Die Historie bleibt — daraus entsteht spaeter die Verbrauchsdauer.
		expect(
			db
				.select()
				.from(stockItem)
				.all()
				.find((r) => r.id === first.id)
		).toBeDefined();
	});
});

describe('receipt_image', () => {
	function makeReceipt(): number {
		return db.insert(receipt).values({}).returning().get().id;
	}

	it('hält mehrere Fotos zu einem Bon in Reihenfolge', () => {
		const id = makeReceipt();
		db.insert(receiptImage)
			.values([
				{ receiptId: id, path: 'a/unten.jpg', sortOrder: 2 },
				{ receiptId: id, path: 'a/oben.jpg', sortOrder: 0 },
				{ receiptId: id, path: 'a/mitte.jpg', sortOrder: 1 }
			])
			.run();

		const paths = db
			.select({ path: receiptImage.path })
			.from(receiptImage)
			.where(eq(receiptImage.receiptId, id))
			.orderBy(asc(receiptImage.sortOrder))
			.all()
			.map((r) => r.path);

		expect(paths).toEqual(['a/oben.jpg', 'a/mitte.jpg', 'a/unten.jpg']);
	});

	it('räumt die Fotos mit auf, wenn der Bon gelöscht wird', () => {
		const id = makeReceipt();
		db.insert(receiptImage).values({ receiptId: id, path: 'a/oben.jpg' }).run();

		db.delete(receipt).where(eq(receipt.id, id)).run();
		expect(db.select().from(receiptImage).all()).toHaveLength(0);
	});
});
