import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { LOCATIONS, UNITS } from '../../domain';

/*
 * Konventionen in diesem Schema:
 *
 * - Geld immer als ganzzahlige Cent. Nie Fließkomma für Beträge.
 * - Zeitstempel als Unix-Sekunden (`mode: 'timestamp'`), Drizzle gibt sie als Date zurück.
 * - Aufzählungen als `text({ enum: [...] })`. Das ist eine reine TypeScript-Grenze,
 *   SQLite bekommt keinen CHECK. Bewusst so: CHECK-Constraints zwingen SQLite bei
 *   jeder Änderung zum Neuaufbau der Tabelle, und alle Schreibpfade laufen ohnehin
 *   durch unseren typisierten Code.
 */

/*
 * Vokabular kommt aus $lib/domain, nicht von hier: Orte und Einheiten braucht
 * die Oberfläche genauso. Läge es in dieser Datei, zöge jeder Import aus einer
 * Komponente die Datenbank mit in den Browser-Bundle.
 */
export { FILL_LEVELS, LOCATIONS, UNITS } from '../../domain';
export type { FillLevel, Location, Unit } from '../../domain';

/** Kategorie liefert die MHD-Schätzung, wenn das Produkt keine eigene hat. */
export const category = sqliteTable('category', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	/** Obst 7, Tofu 90, Konserven 365 — Startwert, pro Produkt überschreibbar. */
	defaultShelfLifeDays: integer('default_shelf_life_days').notNull(),
	/**
	 * Haltbarkeit ab dem Öffnen, falls das bei dieser Kategorie einen
	 * Unterschied macht. Eine offene Dose hält drei Tage, keine 365 — ohne
	 * diesen Wert stünde Geöffnetes viel zu weit unten in der Liste.
	 * NULL heißt: Öffnen ändert nichts (Tiefkühl, Trockenvorrat).
	 */
	openedShelfLifeDays: integer('opened_shelf_life_days'),
	/** Visueller Anker in der Liste. Ein Emoji liest sich schneller als ein Wort. */
	emoji: text('emoji').notNull(),
	sortOrder: integer('sort_order').notNull().default(0)
});

/**
 * Stammdaten. Ein Produkt existiert unabhängig davon, ob gerade eine Packung
 * da ist — das ist die Grundlage für Kaufhäufigkeit und Einkaufsvorschläge.
 */
export const product = sqliteTable(
	'product',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Eindeutig, damit der Bon-Import zusammenführt statt Dubletten anzulegen. */
		name: text('name').notNull().unique(),
		categoryId: integer('category_id')
			.notNull()
			.references(() => category.id, { onDelete: 'restrict' }),
		defaultUnit: text('default_unit', { enum: UNITS }).notNull().default('piece'),
		/** Überschreibt die Kategorie-Haltbarkeit, wenn gesetzt. */
		shelfLifeDays: integer('shelf_life_days'),
		/** Ebenso für die Haltbarkeit nach dem Öffnen. */
		openedShelfLifeDays: integer('opened_shelf_life_days'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('product_category_idx').on(t.categoryId)]
);

/**
 * Ein Bestandsposten ist eine konkrete Charge — eine Packung, ein Glas.
 * Zwei Packungen desselben Produkts haben eigene MHDs und eigene Orte.
 */
export const stockItem = sqliteTable(
	'stock_item',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		productId: integer('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		quantity: real('quantity').notNull().default(1),
		unit: text('unit', { enum: UNITS }).notNull().default('piece'),
		location: text('location', { enum: LOCATIONS }).notNull().default('fridge'),
		bestBefore: integer('best_before', { mode: 'timestamp' }),
		/** Geschätzte MHDs werden in der UI zurückhaltender dargestellt als eingetragene. */
		bestBeforeIsEstimated: integer('best_before_is_estimated', { mode: 'boolean' })
			.notNull()
			.default(true),
		/**
		 * Füllstand in Prozent, oder NULL für ungeöffnet.
		 *
		 * Ein einziges Feld statt „angebrochen" plus Restmenge: damit gibt es
		 * den widersprüchlichen Zustand „nicht angebrochen, aber ein Viertel
		 * übrig" gar nicht erst. NULL heißt ungeöffnet, 100 heißt angebrochen
		 * und noch voll. Bleibt optional — bei Dosen und Packungen zählt
		 * weiterhin nur die Stückzahl.
		 */
		fillLevel: integer('fill_level'),
		purchasedAt: integer('purchased_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		/**
		 * Gesetzt heißt aufgebraucht. Wir löschen nicht, weil sich aus
		 * purchasedAt → consumedAt die typische Verbrauchsdauer ergibt.
		 */
		consumedAt: integer('consumed_at', { mode: 'timestamp' }),
		receiptId: integer('receipt_id').references(() => receipt.id, { onDelete: 'set null' })
	},
	(t) => [
		// Die Hauptabfrage: offener Bestand, nach Ablauf sortiert.
		index('stock_open_by_expiry_idx').on(t.consumedAt, t.bestBefore),
		index('stock_product_idx').on(t.productId),
		index('stock_location_idx').on(t.location)
	]
);

/** Ein fotografierter Kassenbon, bevor und nachdem er geprüft wurde. */
export const receipt = sqliteTable(
	'receipt',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		store: text('store'),
		purchasedAt: integer('purchased_at', { mode: 'timestamp' }),
		totalCents: integer('total_cents'),
		status: text('status', { enum: ['pending', 'confirmed', 'discarded'] })
			.notNull()
			.default('pending'),
		/** Modellantwort im Original — für Fehlersuche und Prompt-Tuning. */
		rawResponse: text('raw_response'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('receipt_status_idx').on(t.status)]
);

/**
 * Ein Bon kann aus mehreren Fotos bestehen.
 *
 * Ein langer Kassenbon passt nicht in eine Aufnahme: zwingt man ihn ganz
 * ins Bild, wird die Schrift so klein, dass auch ein starkes Vision-Modell
 * nur noch rät. Drei Aufnahmen von oben, Mitte und unten werden gemeinsam
 * ausgewertet — `sortOrder` hält dabei die Reihenfolge fest.
 */
export const receiptImage = sqliteTable(
	'receipt_image',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		receiptId: integer('receipt_id')
			.notNull()
			.references(() => receipt.id, { onDelete: 'cascade' }),
		/** Pfad unter data/receipts/. Nach 90 Tagen aufräumen. */
		path: text('path').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('receipt_image_receipt_idx').on(t.receiptId, t.sortOrder)]
);

/** Eine Zeile des Bons, wie das Modell sie gelesen hat. */
export const receiptLine = sqliteTable(
	'receipt_line',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		receiptId: integer('receipt_id')
			.notNull()
			.references(() => receipt.id, { onDelete: 'cascade' }),
		/** Wortlaut vom Bon: „BIO-TOFU NAT 400G". Bleibt unverändert stehen. */
		rawText: text('raw_text').notNull(),
		parsedName: text('parsed_name'),
		quantity: real('quantity'),
		unit: text('unit', { enum: UNITS }),
		priceCents: integer('price_cents'),
		/** Unsicheres wird im Prüf-Screen hervorgehoben, statt es zu verstecken. */
		confidence: text('confidence', { enum: ['high', 'low'] })
			.notNull()
			.default('low'),
		productId: integer('product_id').references(() => product.id, { onDelete: 'set null' }),
		status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
			.notNull()
			.default('pending')
	},
	(t) => [index('receipt_line_receipt_idx').on(t.receiptId)]
);

/**
 * Lerntabelle: bekannte Bon-Bezeichnungen werden lokal aufgelöst, bevor
 * überhaupt ein Modell gefragt wird. Spart Tokens und Prüfaufwand.
 *
 * Der Schlüssel ist absichtlich nur der normalisierte Text ohne Laden: dass
 * zwei Märkte dieselbe Abkürzung für Verschiedenes nutzen, ist unwahrscheinlich
 * genug, um die einfachere Abfrage zu rechtfertigen. `store` bleibt Information.
 */
export const productAlias = sqliteTable(
	'product_alias',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Kleingeschrieben, ohne Leer- und Sonderzeichen: „biotofunat400g". */
		rawTextNormalized: text('raw_text_normalized').notNull(),
		productId: integer('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		store: text('store'),
		hitCount: integer('hit_count').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('alias_normalized_uq').on(t.rawTextNormalized)]
);

/** Einkaufsliste: manuell ergänzt oder aus der Auswertung vorgeschlagen. */
export const shoppingListItem = sqliteTable(
	'shopping_list_item',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Entweder ein bekanntes Produkt oder freier Text — eins von beiden. */
		productId: integer('product_id').references(() => product.id, { onDelete: 'cascade' }),
		freeText: text('free_text'),
		quantity: real('quantity').notNull().default(1),
		unit: text('unit', { enum: UNITS }).notNull().default('piece'),
		isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
		source: text('source', { enum: ['manual', 'suggested'] })
			.notNull()
			.default('manual'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('shopping_open_idx').on(t.isDone)]
);

/* ---------- Beziehungen für die Drizzle-Query-API ---------- */

export const categoryRelations = relations(category, ({ many }) => ({
	products: many(product)
}));

export const productRelations = relations(product, ({ one, many }) => ({
	category: one(category, { fields: [product.categoryId], references: [category.id] }),
	stockItems: many(stockItem),
	aliases: many(productAlias)
}));

export const stockItemRelations = relations(stockItem, ({ one }) => ({
	product: one(product, { fields: [stockItem.productId], references: [product.id] }),
	receipt: one(receipt, { fields: [stockItem.receiptId], references: [receipt.id] })
}));

export const receiptRelations = relations(receipt, ({ many }) => ({
	lines: many(receiptLine),
	images: many(receiptImage)
}));

export const receiptImageRelations = relations(receiptImage, ({ one }) => ({
	receipt: one(receipt, { fields: [receiptImage.receiptId], references: [receipt.id] })
}));

export const receiptLineRelations = relations(receiptLine, ({ one }) => ({
	receipt: one(receipt, { fields: [receiptLine.receiptId], references: [receipt.id] }),
	product: one(product, { fields: [receiptLine.productId], references: [product.id] })
}));

export const productAliasRelations = relations(productAlias, ({ one }) => ({
	product: one(product, { fields: [productAlias.productId], references: [product.id] })
}));

export const shoppingListItemRelations = relations(shoppingListItem, ({ one }) => ({
	product: one(product, { fields: [shoppingListItem.productId], references: [product.id] })
}));

/* ---------- Abgeleitete Typen ---------- */

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
export type StockItem = typeof stockItem.$inferSelect;
export type NewStockItem = typeof stockItem.$inferInsert;
export type Receipt = typeof receipt.$inferSelect;
export type ReceiptImage = typeof receiptImage.$inferSelect;
export type ReceiptLine = typeof receiptLine.$inferSelect;
export type ProductAlias = typeof productAlias.$inferSelect;
export type ShoppingListItem = typeof shoppingListItem.$inferSelect;
