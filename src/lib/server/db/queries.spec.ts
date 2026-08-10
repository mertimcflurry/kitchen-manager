import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { daysUntil } from '../../date';
import { createDb, type Db } from './client';
import {
	addStock,
	adjustQuantity,
	consume,
	countByLocation,
	findOrCreateProduct,
	frequentProducts,
	listStock,
	openOne,
	undoConsume
} from './queries';
import { seedCategories, seedDevData } from './seed';
import { category, product, stockItem } from './schema';

let db: Db;
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	seedDevData(db);
});

describe('listStock', () => {
	it('sortiert nach Ablauf, Dringendes zuerst', () => {
		const rows = listStock(db);
		const dates = rows.filter((r) => r.bestBefore).map((r) => r.bestBefore!.getTime());
		expect(dates).toEqual([...dates].sort((a, b) => a - b));
	});

	it('stellt Posten ohne MHD hinten an, nicht vorn', () => {
		const id = findOrCreateProduct(db, 'Ohne Datum');
		db.insert(stockItem).values({ productId: id, bestBefore: null }).run();

		const rows = listStock(db);
		// SQLite sortiert NULL sonst zuerst — dann führte Undatiertes die
		// Dringlichkeitsliste an, ohne dringend zu sein.
		expect(rows.at(-1)?.name).toBe('Ohne Datum');
	});

	it('filtert nach Ort', () => {
		const pantry = listStock(db, 'pantry');
		expect(pantry.length).toBeGreaterThan(0);
		expect(pantry.every((r) => r.location === 'pantry')).toBe(true);
	});

	it('zählt je Ort passend zur gefilterten Liste', () => {
		const counts = countByLocation(db);
		for (const loc of ['fridge', 'freezer', 'pantry'] as const) {
			expect(counts[loc]).toBe(listStock(db, loc).length);
		}
	});
});

describe('adjustQuantity', () => {
	it('zählt herunter, ohne aufzubrauchen', () => {
		const before = listStock(db).find((r) => r.quantity > 1)!;
		adjustQuantity(db, before.id, -1);

		const after = listStock(db).find((r) => r.id === before.id);
		expect(after?.quantity).toBe(before.quantity - 1);
	});

	it('gilt bei null als aufgebraucht — das Minus ist die letzte Entnahme', () => {
		const item = listStock(db).find((r) => r.quantity === 1)!;
		adjustQuantity(db, item.id, -1);

		expect(listStock(db).find((r) => r.id === item.id)).toBeUndefined();
		const row = db.select().from(stockItem).where(eq(stockItem.id, item.id)).get();
		expect(row?.consumedAt).not.toBeNull();
	});

	it('läuft nicht ins Negative', () => {
		const item = listStock(db)[0];
		adjustQuantity(db, item.id, -999);
		const row = db.select().from(stockItem).where(eq(stockItem.id, item.id)).get();
		expect(row?.quantity).toBe(0);
	});
});

describe('consume und undo', () => {
	it('gibt den vorherigen Zustand zurück und stellt ihn wieder her', () => {
		const item = listStock(db).find((r) => r.fillLevel !== null)!;
		const snapshot = consume(db, item.id);

		expect(snapshot).toEqual({
			id: item.id,
			quantity: item.quantity,
			fillLevel: item.fillLevel
		});
		expect(listStock(db).find((r) => r.id === item.id)).toBeUndefined();

		undoConsume(db, snapshot!);
		const restored = listStock(db).find((r) => r.id === item.id);
		expect(restored?.quantity).toBe(item.quantity);
		expect(restored?.fillLevel).toBe(item.fillLevel);
	});

	it('brauchtes Aufgebrauchtes nicht zweimal auf', () => {
		const item = listStock(db)[0];
		expect(consume(db, item.id)).not.toBeNull();
		expect(consume(db, item.id)).toBeNull();
	});
});

describe('addStock', () => {
	it('schätzt das MHD aus der Haltbarkeit des Produkts', () => {
		const tofu = db.select().from(product).where(eq(product.name, 'Tofu natur')).get()!;
		const id = addStock(db, { productId: tofu.id, quantity: 1, location: 'fridge' });

		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(row.bestBeforeIsEstimated).toBe(true);
		expect(daysUntil(row.bestBefore!)).toBe(tofu.shelfLifeDays);
	});

	it('fällt auf die Haltbarkeit der Kategorie zurück', () => {
		// Neue Produkte landen in „Sonstiges" (30 Tage) und haben keine eigene.
		const id = findOrCreateProduct(db, 'Etwas Neues');
		const stockId = addStock(db, { productId: id, quantity: 1, location: 'pantry' });

		const row = db.select().from(stockItem).where(eq(stockItem.id, stockId)).get()!;
		expect(daysUntil(row.bestBefore!)).toBe(30);
	});
});

describe('findOrCreateProduct', () => {
	it('legt nicht zweimal an, auch bei anderer Schreibweise', () => {
		const first = findOrCreateProduct(db, 'Tofu natur');
		const second = findOrCreateProduct(db, '  TOFU NATUR  ');
		expect(second).toBe(first);
	});
});

describe('frequentProducts', () => {
	it('stellt häufig Gekauftes nach vorn', () => {
		const tofu = db.select().from(product).where(eq(product.name, 'Tofu natur')).get()!;
		for (let i = 0; i < 5; i++) {
			addStock(db, { productId: tofu.id, quantity: 1, location: 'fridge' });
		}

		expect(frequentProducts(db, 3)[0].name).toBe('Tofu natur');
	});
});

describe('openOne', () => {
	/** Vier Kartons Hafermilch, einer wird angebrochen. */
	function fourPacks() {
		const milk = db.select().from(product).where(eq(product.name, 'Haferdrink')).get()!;
		const id = addStock(db, { productId: milk.id, quantity: 4, location: 'pantry' });
		return { milk, id };
	}

	it('teilt eine Einheit ab, statt die ganze Zeile zu markieren', () => {
		const { milk, id } = fourPacks();
		const openedId = openOne(db, id);

		const rows = listStock(db).filter((r) => r.productId === milk.id && r.id !== 0);
		const sealed = rows.find((r) => r.id === id);
		const opened = rows.find((r) => r.id === openedId);

		expect(sealed?.quantity).toBe(3);
		expect(sealed?.fillLevel).toBeNull();
		expect(opened?.quantity).toBe(1);
		expect(opened?.fillLevel).toBe(100);
	});

	it('gibt dem Geöffneten die kürzere Haltbarkeit', () => {
		const { id } = fourPacks();
		const openedId = openOne(db, id)!;

		const opened = db.select().from(stockItem).where(eq(stockItem.id, openedId)).get()!;
		const sealed = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;

		// Milchprodukte: 5 Tage ab dem Öffnen statt 90 des Produkts.
		expect(daysUntil(opened.bestBefore!)).toBe(5);
		expect(daysUntil(sealed.bestBefore!)).toBeGreaterThan(5);
	});

	it('verlängert nie — was morgen abläuft, hält durch Öffnen nicht länger', () => {
		const milk = db.select().from(product).where(eq(product.name, 'Haferdrink')).get()!;
		const id = addStock(db, { productId: milk.id, quantity: 1, location: 'fridge' });
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		db.update(stockItem).set({ bestBefore: tomorrow }).where(eq(stockItem.id, id)).run();

		openOne(db, id);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(daysUntil(row.bestBefore!)).toBe(1);
	});

	it('öffnet Einzelstücke an Ort und Stelle, ohne Leerposten', () => {
		const milk = db.select().from(product).where(eq(product.name, 'Haferdrink')).get()!;
		const id = addStock(db, { productId: milk.id, quantity: 1, location: 'fridge' });

		expect(openOne(db, id)).toBe(id);
		expect(listStock(db).filter((r) => r.productId === milk.id && r.quantity === 0)).toHaveLength(
			0
		);
	});

	it('öffnet lose Ware an Ort und Stelle, statt ein Gramm abzuteilen', () => {
		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		const id = addStock(db, { productId: cheese.id, quantity: 200, location: 'fridge' });

		expect(openOne(db, id)).toBe(id);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(row.quantity).toBe(200);
		expect(row.fillLevel).toBe(100);
	});

	it('lässt bereits Geöffnetes in Ruhe', () => {
		const { id } = fourPacks();
		const openedId = openOne(db, id)!;
		expect(openOne(db, openedId)).toBeNull();
	});

	it('lässt das Datum unberührt, wo Öffnen nichts ändert', () => {
		// Tiefkühl hat keine Geöffnet-Haltbarkeit — aufgetaute Erbsen sind ein
		// anderes Problem als eine offene Dose.
		const peas = db.select().from(product).where(eq(product.name, 'Erbsen TK')).get()!;
		const id = addStock(db, { productId: peas.id, quantity: 750, location: 'freezer' });
		const before = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!.bestBefore;

		openOne(db, id);
		const after = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(after.bestBefore).toEqual(before);
		expect(after.fillLevel).toBe(100);
	});
});

describe('Geöffnet-Haltbarkeit der Kategorien', () => {
	it('ist dort gesetzt, wo Öffnen einen Unterschied macht', () => {
		const rows = db.select().from(category).all();
		const byName = new Map(rows.map((c) => [c.name, c.openedShelfLifeDays]));

		expect(byName.get('Konserven')).toBe(3);
		expect(byName.get('Milchprodukte')).toBe(5);
		// Und dort NULL, wo es keinen macht.
		expect(byName.get('Tiefkühl')).toBeNull();
		expect(byName.get('Trockenvorrat')).toBeNull();
	});
});
