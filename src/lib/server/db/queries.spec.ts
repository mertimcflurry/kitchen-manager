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
	undoConsume
} from './queries';
import { seedCategories, seedDevData } from './seed';
import { product, stockItem } from './schema';

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
