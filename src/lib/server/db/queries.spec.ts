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
	countUrgent,
	findOrCreateProduct,
	frequentProducts,
	lastPurchase,
	listCategories,
	listStock,
	openOne,
	undoConsume,
	updateCategory,
	updateProductCategory,
	updateStockItem
} from './queries';
import { seedCategories, seedDevData } from './seed';
import { category, product, stockItem, user } from './schema';

let db: Db;
let userId: number;
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	({ userId } = seedDevData(db));
});

describe('listStock', () => {
	it('sortiert nach Ablauf, Dringendes zuerst', () => {
		const rows = listStock(db, userId);
		const dates = rows.filter((r) => r.bestBefore).map((r) => r.bestBefore!.getTime());
		expect(dates).toEqual([...dates].sort((a, b) => a - b));
	});

	it('stellt Posten ohne MHD hinten an, nicht vorn', () => {
		const id = findOrCreateProduct(db, 'Ohne Datum');
		db.insert(stockItem).values({ userId, productId: id, bestBefore: null }).run();

		const rows = listStock(db, userId);
		// SQLite sortiert NULL sonst zuerst — dann führte Undatiertes die
		// Dringlichkeitsliste an, ohne dringend zu sein.
		expect(rows.at(-1)?.name).toBe('Ohne Datum');
	});

	it('filtert nach Ort', () => {
		const pantry = listStock(db, userId, 'pantry');
		expect(pantry.length).toBeGreaterThan(0);
		expect(pantry.every((r) => r.location === 'pantry')).toBe(true);
	});

	it('zählt je Ort passend zur gefilterten Liste', () => {
		const counts = countByLocation(db, userId);
		for (const loc of ['fridge', 'freezer', 'pantry'] as const) {
			expect(counts[loc]).toBe(listStock(db, userId, loc).length);
		}
	});
});

describe('countUrgent', () => {
	it('zählt nur Abgelaufenes und das, was heute oder morgen fällig wird', () => {
		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		const before = countUrgent(db, userId);

		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const id = addStock(db, userId, { productId: cheese.id, quantity: 1, location: 'fridge' });
		db.update(stockItem).set({ bestBefore: tomorrow }).where(eq(stockItem.id, id)).run();

		expect(countUrgent(db, userId)).toBe(before + 1);
	});

	it('zählt Aufgebrauchtes und weit Entferntes nicht mit', () => {
		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		const before = countUrgent(db, userId);

		const farOut = new Date();
		farOut.setDate(farOut.getDate() + 30);
		const id = addStock(db, userId, { productId: cheese.id, quantity: 1, location: 'fridge' });
		db.update(stockItem).set({ bestBefore: farOut }).where(eq(stockItem.id, id)).run();
		expect(countUrgent(db, userId)).toBe(before);

		consume(db, userId, id);
		expect(countUrgent(db, userId)).toBe(before);
	});
});

describe('adjustQuantity', () => {
	it('zählt herunter, ohne aufzubrauchen', () => {
		const before = listStock(db, userId).find((r) => r.quantity > 1)!;
		adjustQuantity(db, userId, before.id, -1);

		const after = listStock(db, userId).find((r) => r.id === before.id);
		expect(after?.quantity).toBe(before.quantity - 1);
	});

	it('gilt bei null als aufgebraucht — das Minus ist die letzte Entnahme', () => {
		const item = listStock(db, userId).find((r) => r.quantity === 1)!;
		adjustQuantity(db, userId, item.id, -1);

		expect(listStock(db, userId).find((r) => r.id === item.id)).toBeUndefined();
		const row = db.select().from(stockItem).where(eq(stockItem.id, item.id)).get();
		expect(row?.consumedAt).not.toBeNull();
	});

	it('läuft nicht ins Negative', () => {
		const item = listStock(db, userId)[0];
		adjustQuantity(db, userId, item.id, -999);
		const row = db.select().from(stockItem).where(eq(stockItem.id, item.id)).get();
		expect(row?.quantity).toBe(0);
	});

	it('lässt die Startmenge stehen, wenn entnommen wird', () => {
		const eggs = listStock(db, userId).find((r) => r.name === 'Eier')!;
		expect(eggs.initialQuantity).toBe(10);

		adjustQuantity(db, userId, eggs.id, -1);
		const after = listStock(db, userId).find((r) => r.id === eggs.id)!;
		expect(after.quantity).toBe(eggs.quantity - 1);
		// Der Balken misst gegen die Startmenge — sie darf beim Entnehmen nicht
		// mitwandern, sonst stünde die Zeile immer auf „voll".
		expect(after.initialQuantity).toBe(10);
	});

	it('hebt die Startmenge an, wenn über sie hinaus nachgelegt wird', () => {
		const eggs = listStock(db, userId).find((r) => r.name === 'Eier')!;
		adjustQuantity(db, userId, eggs.id, +10);

		const after = listStock(db, userId).find((r) => r.id === eggs.id)!;
		expect(after.quantity).toBe(16);
		// Sonst zeigte der Balken 160 Prozent.
		expect(after.initialQuantity).toBe(16);
	});
});

describe('consume und undo', () => {
	it('gibt den vorherigen Zustand zurück und stellt ihn wieder her', () => {
		const item = listStock(db, userId).find((r) => r.fillLevel !== null)!;
		const snapshot = consume(db, userId, item.id);

		expect(snapshot).toEqual({
			id: item.id,
			quantity: item.quantity,
			fillLevel: item.fillLevel
		});
		expect(listStock(db, userId).find((r) => r.id === item.id)).toBeUndefined();

		undoConsume(db, userId, snapshot!);
		const restored = listStock(db, userId).find((r) => r.id === item.id);
		expect(restored?.quantity).toBe(item.quantity);
		expect(restored?.fillLevel).toBe(item.fillLevel);
	});

	it('brauchtes Aufgebrauchtes nicht zweimal auf', () => {
		const item = listStock(db, userId)[0];
		expect(consume(db, userId, item.id)).not.toBeNull();
		expect(consume(db, userId, item.id)).toBeNull();
	});
});

describe('addStock', () => {
	it('schätzt das MHD aus der Haltbarkeit des Produkts', () => {
		const tofu = db.select().from(product).where(eq(product.name, 'Tofu natur')).get()!;
		const id = addStock(db, userId, { productId: tofu.id, quantity: 1, location: 'fridge' });

		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(row.bestBeforeIsEstimated).toBe(true);
		expect(daysUntil(row.bestBefore!)).toBe(tofu.shelfLifeDays);
	});

	it('fällt auf die Haltbarkeit der Kategorie zurück', () => {
		// Neue Produkte landen in „Sonstiges" (30 Tage) und haben keine eigene.
		const id = findOrCreateProduct(db, 'Etwas Neues');
		const stockId = addStock(db, userId, { productId: id, quantity: 1, location: 'pantry' });

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

	it('rät ohne categoryName die Kategorie aus dem Namen', () => {
		const id = findOrCreateProduct(db, 'Pfirsich');
		const row = listStock(db, userId).find((r) => r.productId === id);
		// Neu angelegt, noch nicht eingelagert — über die Kategorien-Tabelle nachschauen.
		const p = db.select().from(product).where(eq(product.id, id)).get()!;
		const cat = db.select().from(category).where(eq(category.id, p.categoryId)).get()!;
		expect(cat.name).toBe('Obst & Gemüse');
		expect(row).toBeUndefined(); // nicht eingelagert, nur angelegt
	});

	it('landet ohne Treffer weiterhin in Sonstiges', () => {
		const id = findOrCreateProduct(db, 'Erfundenes Zeug');
		const p = db.select().from(product).where(eq(product.id, id)).get()!;
		const cat = db.select().from(category).where(eq(category.id, p.categoryId)).get()!;
		expect(cat.name).toBe('Sonstiges');
	});

	it('eine explizite categoryName sticht den Rateversuch', () => {
		const id = findOrCreateProduct(db, 'Pfirsich Kompott', 'Konserven');
		const p = db.select().from(product).where(eq(product.id, id)).get()!;
		const cat = db.select().from(category).where(eq(category.id, p.categoryId)).get()!;
		expect(cat.name).toBe('Konserven');
	});
});

describe('updateProductCategory', () => {
	it('sortiert ein Produkt in eine andere Kategorie um', () => {
		const tofu = db.select().from(product).where(eq(product.name, 'Tofu natur')).get()!;
		const konserven = db.select().from(category).where(eq(category.name, 'Konserven')).get()!;

		updateProductCategory(db, tofu.id, konserven.id);

		const after = db.select().from(product).where(eq(product.id, tofu.id)).get()!;
		expect(after.categoryId).toBe(konserven.id);
	});

	it('wirkt sich auf alle Posten des Produkts aus, nicht nur einen', () => {
		const tofu = db.select().from(product).where(eq(product.name, 'Tofu natur')).get()!;
		const konserven = db.select().from(category).where(eq(category.name, 'Konserven')).get()!;
		addStock(db, userId, { productId: tofu.id, quantity: 1, location: 'fridge' });
		addStock(db, userId, { productId: tofu.id, quantity: 1, location: 'pantry' });

		updateProductCategory(db, tofu.id, konserven.id);

		const rows = listStock(db, userId).filter((r) => r.productId === tofu.id);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.categoryName === 'Konserven')).toBe(true);
	});
});

describe('frequentProducts', () => {
	it('stellt häufig Gekauftes nach vorn', () => {
		const tofu = db.select().from(product).where(eq(product.name, 'Tofu natur')).get()!;
		for (let i = 0; i < 5; i++) {
			addStock(db, userId, { productId: tofu.id, quantity: 1, location: 'fridge' });
		}

		expect(frequentProducts(db, userId, 3)[0].name).toBe('Tofu natur');
	});
});

describe('openOne', () => {
	/** Vier Kartons Hafermilch, einer wird angebrochen. */
	function fourPacks() {
		const milk = db.select().from(product).where(eq(product.name, 'Haferdrink')).get()!;
		const id = addStock(db, userId, { productId: milk.id, quantity: 4, location: 'pantry' });
		return { milk, id };
	}

	it('teilt eine Einheit ab, statt die ganze Zeile zu markieren', () => {
		const { milk, id } = fourPacks();
		const openedId = openOne(db, userId, id);

		const rows = listStock(db, userId).filter((r) => r.productId === milk.id && r.id !== 0);
		const sealed = rows.find((r) => r.id === id);
		const opened = rows.find((r) => r.id === openedId);

		expect(sealed?.quantity).toBe(3);
		expect(sealed?.fillLevel).toBeNull();
		expect(opened?.quantity).toBe(1);
		expect(opened?.fillLevel).toBe(100);

		// Der Restposten misst weiter gegen die vier gekauften — „drei von vier".
		// Das abgeteilte Stück fängt bei sich selbst an.
		expect(sealed?.initialQuantity).toBe(4);
		expect(opened?.initialQuantity).toBe(1);
	});

	it('gibt dem Geöffneten die kürzere Haltbarkeit', () => {
		const { id } = fourPacks();
		const openedId = openOne(db, userId, id)!;

		const opened = db.select().from(stockItem).where(eq(stockItem.id, openedId)).get()!;
		const sealed = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;

		// Milchprodukte: 5 Tage ab dem Öffnen statt 90 des Produkts.
		expect(daysUntil(opened.bestBefore!)).toBe(5);
		expect(daysUntil(sealed.bestBefore!)).toBeGreaterThan(5);
	});

	it('verlängert nie — was morgen abläuft, hält durch Öffnen nicht länger', () => {
		const milk = db.select().from(product).where(eq(product.name, 'Haferdrink')).get()!;
		const id = addStock(db, userId, { productId: milk.id, quantity: 1, location: 'fridge' });
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		db.update(stockItem).set({ bestBefore: tomorrow }).where(eq(stockItem.id, id)).run();

		openOne(db, userId, id);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(daysUntil(row.bestBefore!)).toBe(1);
	});

	it('öffnet Einzelstücke an Ort und Stelle, ohne Leerposten', () => {
		const milk = db.select().from(product).where(eq(product.name, 'Haferdrink')).get()!;
		const id = addStock(db, userId, { productId: milk.id, quantity: 1, location: 'fridge' });

		expect(openOne(db, userId, id)).toBe(id);
		expect(
			listStock(db, userId).filter((r) => r.productId === milk.id && r.quantity === 0)
		).toHaveLength(0);
	});

	it('öffnet lose Ware an Ort und Stelle, statt ein Gramm abzuteilen', () => {
		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		const id = addStock(db, userId, { productId: cheese.id, quantity: 200, location: 'fridge' });

		expect(openOne(db, userId, id)).toBe(id);
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(row.quantity).toBe(200);
		expect(row.fillLevel).toBe(100);
	});

	it('lässt bereits Geöffnetes in Ruhe', () => {
		const { id } = fourPacks();
		const openedId = openOne(db, userId, id)!;
		expect(openOne(db, userId, openedId)).toBeNull();
	});

	it('lässt das Datum unberührt, wo Öffnen nichts ändert', () => {
		// Tiefkühl hat keine Geöffnet-Haltbarkeit — aufgetaute Erbsen sind ein
		// anderes Problem als eine offene Dose.
		const peas = db.select().from(product).where(eq(product.name, 'Erbsen TK')).get()!;
		const id = addStock(db, userId, { productId: peas.id, quantity: 750, location: 'freezer' });
		const before = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!.bestBefore;

		openOne(db, userId, id);
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

describe('listCategories', () => {
	it('liefert alle Kategorien, sortiert nach sortOrder', () => {
		const rows = listCategories(db);
		expect(rows.length).toBeGreaterThan(0);

		const sortOrders = db
			.select({ id: category.id, sortOrder: category.sortOrder })
			.from(category)
			.all();
		const bySortOrder = new Map(sortOrders.map((c) => [c.id, c.sortOrder]));
		const orders = rows.map((r) => bySortOrder.get(r.id)!);
		expect(orders).toEqual([...orders].sort((a, b) => a - b));

		const first = rows[0];
		expect(first).toHaveProperty('name');
		expect(first).toHaveProperty('emoji');
		expect(first).toHaveProperty('defaultShelfLifeDays');
		expect(first).toHaveProperty('openedShelfLifeDays');
	});
});

describe('updateCategory', () => {
	it('ändert die Standard-Haltbarkeit', () => {
		const tofu = db.select().from(category).where(eq(category.name, 'Tofu & Fleischersatz')).get();
		const target = tofu ?? db.select().from(category).get()!;

		updateCategory(db, target.id, { defaultShelfLifeDays: 42 });
		const row = db.select().from(category).where(eq(category.id, target.id)).get();
		expect(row?.defaultShelfLifeDays).toBe(42);
	});

	it('ignoriert eine ungültige Standard-Haltbarkeit, statt zu werfen', () => {
		const before = db.select().from(category).get()!;
		expect(() => updateCategory(db, before.id, { defaultShelfLifeDays: -1 })).not.toThrow();
		expect(() => updateCategory(db, before.id, { defaultShelfLifeDays: NaN })).not.toThrow();

		const after = db.select().from(category).where(eq(category.id, before.id)).get();
		expect(after?.defaultShelfLifeDays).toBe(before.defaultShelfLifeDays);
	});

	it('setzt die Geöffnet-Haltbarkeit ausdrücklich auf NULL', () => {
		const konserven = db.select().from(category).where(eq(category.name, 'Konserven')).get()!;
		expect(konserven.openedShelfLifeDays).not.toBeNull();

		updateCategory(db, konserven.id, { openedShelfLifeDays: null });
		const row = db.select().from(category).where(eq(category.id, konserven.id)).get();
		expect(row?.openedShelfLifeDays).toBeNull();
	});

	it('übernimmt gültige Felder, auch wenn andere im selben Aufruf ungültig sind', () => {
		const before = db.select().from(category).get()!;
		updateCategory(db, before.id, { defaultShelfLifeDays: -5, openedShelfLifeDays: 3 });

		const row = db.select().from(category).where(eq(category.id, before.id)).get();
		expect(row?.defaultShelfLifeDays).toBe(before.defaultShelfLifeDays);
		expect(row?.openedShelfLifeDays).toBe(3);
	});

	it('ignoriert eine Kommazahl, statt sie in die Integer-Spalte zu runden', () => {
		const before = db.select().from(category).get()!;
		updateCategory(db, before.id, { defaultShelfLifeDays: 14.5, openedShelfLifeDays: 3.2 });

		const row = db.select().from(category).where(eq(category.id, before.id)).get();
		expect(row?.defaultShelfLifeDays).toBe(before.defaultShelfLifeDays);
		expect(row?.openedShelfLifeDays).toBe(before.openedShelfLifeDays);
	});

	it('ignoriert eine unplausibel hohe Haltbarkeit', () => {
		const before = db.select().from(category).get()!;
		updateCategory(db, before.id, { defaultShelfLifeDays: 3651, openedShelfLifeDays: 4000 });

		const row = db.select().from(category).where(eq(category.id, before.id)).get();
		expect(row?.defaultShelfLifeDays).toBe(before.defaultShelfLifeDays);
		expect(row?.openedShelfLifeDays).toBe(before.openedShelfLifeDays);
	});
});

describe('updateStockItem', () => {
	it('setzt consumedAt, wenn die Menge von Hand auf 0 gesetzt wird', () => {
		const item = db.select().from(stockItem).get()!;
		expect(item.consumedAt).toBeNull();

		updateStockItem(db, userId, item.id, { quantity: 0 });

		const row = db.select().from(stockItem).where(eq(stockItem.id, item.id)).get();
		expect(row?.quantity).toBe(0);
		expect(row?.consumedAt).not.toBeNull();
	});

	it('lässt consumedAt unangetastet, wenn die Menge über 0 bleibt', () => {
		const item = db.select().from(stockItem).get()!;

		updateStockItem(db, userId, item.id, { quantity: 3 });

		const row = db.select().from(stockItem).where(eq(stockItem.id, item.id)).get();
		expect(row?.consumedAt).toBeNull();
	});

	it('setzt die Startmenge neu — im Sheet korrigiert man den Kauf, nicht die Entnahme', () => {
		const eggs = listStock(db, userId).find((r) => r.name === 'Eier')!;
		expect(eggs.initialQuantity).toBe(10);

		// „Waren doch zwölf" ist eine Korrektur der Packung, keine Entnahme.
		updateStockItem(db, userId, eggs.id, { quantity: 12 });

		const row = db.select().from(stockItem).where(eq(stockItem.id, eggs.id)).get();
		expect(row?.initialQuantity).toBe(12);
	});
});

describe('Standardmenge aus dem letzten Kauf', () => {
	it('übernimmt Menge und Einheit des letzten Postens', () => {
		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		addStock(db, userId, { productId: cheese.id, quantity: 400, unit: 'g', location: 'fridge' });

		// Ohne Angabe: die App weiß aus dem Verhalten, dass Gouda 400 g sind.
		const id = addStock(db, userId, { productId: cheese.id, location: 'fridge' });
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;

		expect(row.quantity).toBe(400);
		expect(row.unit).toBe('g');
	});

	it('fällt ohne Kaufhistorie auf eine Einheit zurück', () => {
		const id = findOrCreateProduct(db, 'Nie gekauft');
		expect(lastPurchase(db, userId, id)).toBeNull();

		const stockId = addStock(db, userId, { productId: id, location: 'pantry' });
		const row = db.select().from(stockItem).where(eq(stockItem.id, stockId)).get()!;
		expect(row.quantity).toBe(1);
	});

	it('eine ausdrückliche Angabe schlägt den Verlauf', () => {
		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		addStock(db, userId, { productId: cheese.id, quantity: 400, unit: 'g', location: 'fridge' });

		const id = addStock(db, userId, {
			productId: cheese.id,
			quantity: 150,
			unit: 'g',
			location: 'fridge'
		});
		const row = db.select().from(stockItem).where(eq(stockItem.id, id)).get()!;
		expect(row.quantity).toBe(150);
	});
});

describe('Nutzertrennung (M11)', () => {
	it('zeigt jedem Nutzer nur den eigenen Bestand', () => {
		const otherUserId = db
			.insert(user)
			.values({ name: 'Zweite Person' })
			.returning({ id: user.id })
			.get().id;

		const cheese = db.select().from(product).where(eq(product.name, 'Gouda')).get()!;
		const theirItemId = addStock(db, otherUserId, {
			productId: cheese.id,
			quantity: 1,
			location: 'fridge'
		});

		const mine = listStock(db, userId);
		const theirs = listStock(db, otherUserId);

		// Der Testnutzer aus seedDevData sieht den Posten der zweiten Person nicht …
		expect(mine.some((r) => r.id === theirItemId)).toBe(false);
		expect(mine.length).toBeGreaterThan(0);
		// … die zweite Person sieht ausschließlich ihren einen Posten.
		expect(theirs).toEqual([expect.objectContaining({ id: theirItemId, productId: cheese.id })]);
	});
});
