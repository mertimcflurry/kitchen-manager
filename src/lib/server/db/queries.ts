import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { estimateBestBefore } from '../../date';
import type { Db } from './client';
import { category, product, stockItem, type FillLevel, type Location, type Unit } from './schema';

/** Eine Zeile der Bestandsliste, fertig für die Anzeige. */
export type StockRow = {
	id: number;
	productId: number;
	name: string;
	emoji: string;
	categoryName: string;
	quantity: number;
	unit: Unit;
	location: Location;
	bestBefore: Date | null;
	bestBeforeIsEstimated: boolean;
	fillLevel: number | null;
};

/**
 * Offener Bestand, nach Ablauf sortiert.
 *
 * Sortierung nach Ablauf statt alphabetisch ist Absicht: die Frage vor dem
 * offenen Kühlschrank ist „was muss weg", nicht „wo steht das M".
 * Posten ohne MHD landen hinten, nicht vorn — NULL sortiert in SQLite sonst
 * zuerst und würde die Dringlichkeitsliste anführen, ohne dringend zu sein.
 */
export function listStock(db: Db, location?: Location): StockRow[] {
	return db
		.select({
			id: stockItem.id,
			productId: product.id,
			name: product.name,
			emoji: category.emoji,
			categoryName: category.name,
			quantity: stockItem.quantity,
			unit: stockItem.unit,
			location: stockItem.location,
			bestBefore: stockItem.bestBefore,
			bestBeforeIsEstimated: stockItem.bestBeforeIsEstimated,
			fillLevel: stockItem.fillLevel
		})
		.from(stockItem)
		.innerJoin(product, eq(stockItem.productId, product.id))
		.innerJoin(category, eq(product.categoryId, category.id))
		.where(
			location
				? and(isNull(stockItem.consumedAt), eq(stockItem.location, location))
				: isNull(stockItem.consumedAt)
		)
		.orderBy(sql`${stockItem.bestBefore} is null`, asc(stockItem.bestBefore), asc(product.name))
		.all();
}

/** Zählt offene Posten je Ort — für die Zahlen an den Tabs. */
export function countByLocation(db: Db): Record<Location, number> {
	const rows = db
		.select({ location: stockItem.location, n: count() })
		.from(stockItem)
		.where(isNull(stockItem.consumedAt))
		.groupBy(stockItem.location)
		.all();

	const result = { fridge: 0, freezer: 0, pantry: 0 };
	for (const row of rows) result[row.location] = row.n;
	return result;
}

/**
 * Ändert die Stückzahl. Erreicht sie null, gilt der Posten als aufgebraucht —
 * dann ist das Minus zugleich die letzte Entnahme, ohne zweite Geste.
 */
export function adjustQuantity(db: Db, id: number, delta: number): void {
	const item = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
	if (!item || item.consumedAt) return;

	const next = Math.max(0, item.quantity + delta);
	db.update(stockItem)
		.set({ quantity: next, consumedAt: next === 0 ? new Date() : null })
		.where(eq(stockItem.id, id))
		.run();
}

/** Der Zustand vor dem Aufbrauchen, damit Undo ihn zurückschreiben kann. */
export type ConsumedSnapshot = { id: number; quantity: number; fillLevel: number | null };

export function consume(db: Db, id: number): ConsumedSnapshot | null {
	const item = db.select().from(stockItem).where(eq(stockItem.id, id)).get();
	if (!item || item.consumedAt) return null;

	db.update(stockItem).set({ consumedAt: new Date() }).where(eq(stockItem.id, id)).run();
	return { id: item.id, quantity: item.quantity, fillLevel: item.fillLevel };
}

/**
 * Macht das Aufbrauchen rückgängig.
 *
 * Statt eines Bestätigungsdialogs, der jede einzelne Entnahme einen Tap kostet:
 * die Aktion passiert sofort, und nur im seltenen Fehlerfall tippt man einmal
 * mehr.
 */
export function undoConsume(db: Db, snapshot: ConsumedSnapshot): void {
	db.update(stockItem)
		.set({ consumedAt: null, quantity: snapshot.quantity, fillLevel: snapshot.fillLevel })
		.where(eq(stockItem.id, snapshot.id))
		.run();
}

export function setFillLevel(db: Db, id: number, level: FillLevel | null): void {
	db.update(stockItem).set({ fillLevel: level }).where(eq(stockItem.id, id)).run();
}

export function updateStockItem(
	db: Db,
	id: number,
	patch: { location?: Location; unit?: Unit; bestBefore?: Date | null }
): void {
	const set: Record<string, unknown> = {};
	if (patch.location) set.location = patch.location;
	if (patch.unit) set.unit = patch.unit;
	if (patch.bestBefore !== undefined) {
		set.bestBefore = patch.bestBefore;
		// Ein von Hand eingetragenes Datum ist keine Schätzung mehr und wird
		// in der Liste anders dargestellt.
		set.bestBeforeIsEstimated = false;
	}
	if (Object.keys(set).length === 0) return;
	db.update(stockItem).set(set).where(eq(stockItem.id, id)).run();
}

/**
 * Produkte nach Kaufhäufigkeit — die Vorlage für die Chips beim Hinzufügen.
 * Das meiste, was nachgetragen wird, wurde schon zwanzigmal gekauft.
 */
export function frequentProducts(db: Db, limit = 12) {
	return db
		.select({
			id: product.id,
			name: product.name,
			emoji: category.emoji,
			unit: product.defaultUnit,
			purchases: count(stockItem.id)
		})
		.from(product)
		.innerJoin(category, eq(product.categoryId, category.id))
		.leftJoin(stockItem, eq(stockItem.productId, product.id))
		.groupBy(product.id)
		.orderBy(desc(count(stockItem.id)), asc(product.name))
		.limit(limit)
		.all();
}

export function searchProducts(db: Db, term: string, limit = 20) {
	const like = `%${term.trim().toLowerCase()}%`;
	return db
		.select({
			id: product.id,
			name: product.name,
			emoji: category.emoji,
			unit: product.defaultUnit
		})
		.from(product)
		.innerJoin(category, eq(product.categoryId, category.id))
		.where(sql`lower(${product.name}) like ${like}`)
		.orderBy(asc(product.name))
		.limit(limit)
		.all();
}

/** Haltbarkeit des Produkts, sonst die seiner Kategorie. */
function shelfLifeFor(db: Db, productId: number): number {
	const row = db
		.select({ own: product.shelfLifeDays, fallback: category.defaultShelfLifeDays })
		.from(product)
		.innerJoin(category, eq(product.categoryId, category.id))
		.where(eq(product.id, productId))
		.get();
	return row?.own ?? row?.fallback ?? 30;
}

/** Legt einen Bestandsposten an und schätzt sein MHD aus der Kategorie. */
export function addStock(
	db: Db,
	input: { productId: number; quantity: number; location: Location; unit?: Unit }
): number {
	const purchasedAt = new Date();
	const days = shelfLifeFor(db, input.productId);
	const unit =
		input.unit ??
		db.select({ u: product.defaultUnit }).from(product).where(eq(product.id, input.productId)).get()
			?.u ??
		'piece';

	return db
		.insert(stockItem)
		.values({
			productId: input.productId,
			quantity: input.quantity,
			unit,
			location: input.location,
			purchasedAt,
			bestBefore: estimateBestBefore(purchasedAt, days),
			bestBeforeIsEstimated: true
		})
		.returning({ id: stockItem.id })
		.get().id;
}

/**
 * Findet ein Produkt über seinen Namen oder legt es an.
 * Neue Produkte landen in „Sonstiges", bis sie jemand einsortiert.
 */
export function findOrCreateProduct(db: Db, name: string): number {
	const trimmed = name.trim();
	const existing = db
		.select({ id: product.id })
		.from(product)
		.where(sql`lower(${product.name}) = ${trimmed.toLowerCase()}`)
		.get();
	if (existing) return existing.id;

	const fallback =
		db.select().from(category).where(eq(category.name, 'Sonstiges')).get() ??
		db.select().from(category).orderBy(asc(category.sortOrder)).get();
	if (!fallback) throw new Error('Keine Kategorie vorhanden — erst npm run db:seed ausführen');

	return db
		.insert(product)
		.values({ name: trimmed, categoryId: fallback.id })
		.returning({ id: product.id })
		.get().id;
}
