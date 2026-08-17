import { count, eq, sql } from 'drizzle-orm';
import { estimateBestBefore } from '../../date';
import type { Db } from './client';
import {
	category,
	product,
	stockItem,
	user,
	type FillLevel,
	type Location,
	type NewCategory
} from './schema';

/** Name des Nutzers, dem der Entwicklungs-Seed seinen Bestand zuordnet. */
const DEV_USER_NAME = 'Testnutzer';

/** Legt den Test-Nutzer an, falls er noch nicht existiert — idempotent wie der Rest des Seeds. */
function ensureDevUser(db: Db): number {
	const existing = db.select({ id: user.id }).from(user).where(eq(user.name, DEV_USER_NAME)).get();
	if (existing) return existing.id;

	return db.insert(user).values({ name: DEV_USER_NAME }).returning({ id: user.id }).get().id;
}

/*
 * Zählen hier bewusst über select(count()).get() und nicht über db.$count():
 * $count liefert im besser-sqlite3-Treiber einen Builder, kein Ergebnis. Der
 * ist als Objekt immer wahrheitswertig, was Prüfungen wie `> 0` still falsch
 * beantwortet, statt zu scheitern.
 */
function countCategories(db: Db): number {
	return db.select({ n: count() }).from(category).get()?.n ?? 0;
}

function countStockItems(db: Db): number {
	return db.select({ n: count() }).from(stockItem).get()?.n ?? 0;
}

/**
 * Startkategorien mit MHD-Schätzwerten.
 *
 * `openedShelfLifeDays` gilt ab dem Öffnen und fehlt dort, wo Öffnen nichts
 * ändert (Tiefkühl, Trockenvorrat, Eier).
 *
 * Die Tage sind Erfahrungswerte für ungeöffnete Ware und bewusst eher knapp
 * gewählt: Eine zu kurze Schätzung führt zu einem überflüssigen Blick in den
 * Kühlschrank, eine zu lange zu weggeworfenem Essen. Pro Produkt überschreibbar.
 */
export const DEFAULT_CATEGORIES: NewCategory[] = [
	{ name: 'Obst & Gemüse', defaultShelfLifeDays: 7, emoji: '🥬', sortOrder: 10 },
	{ name: 'Brot & Backwaren', defaultShelfLifeDays: 4, emoji: '🍞', sortOrder: 20 },
	{
		name: 'Milchprodukte',
		defaultShelfLifeDays: 10,
		openedShelfLifeDays: 5,
		emoji: '🥛',
		sortOrder: 30
	},
	{ name: 'Käse', defaultShelfLifeDays: 21, openedShelfLifeDays: 10, emoji: '🧀', sortOrder: 40 },
	{ name: 'Eier', defaultShelfLifeDays: 21, emoji: '🥚', sortOrder: 50 },
	{
		name: 'Fleisch & Fisch',
		defaultShelfLifeDays: 3,
		openedShelfLifeDays: 2,
		emoji: '🥩',
		sortOrder: 60
	},
	{
		name: 'Tofu & Fleischersatz',
		defaultShelfLifeDays: 90,
		openedShelfLifeDays: 4,
		emoji: '🌱',
		sortOrder: 70
	},
	{
		name: 'Aufschnitt & Aufstriche',
		defaultShelfLifeDays: 14,
		openedShelfLifeDays: 5,
		emoji: '🥪',
		sortOrder: 80
	},
	{ name: 'Tiefkühl', defaultShelfLifeDays: 180, emoji: '❄️', sortOrder: 90 },
	{
		name: 'Konserven',
		defaultShelfLifeDays: 365,
		openedShelfLifeDays: 3,
		emoji: '🥫',
		sortOrder: 100
	},
	{ name: 'Trockenvorrat', defaultShelfLifeDays: 365, emoji: '🍝', sortOrder: 110 },
	{
		name: 'Gewürze & Saucen',
		defaultShelfLifeDays: 540,
		openedShelfLifeDays: 60,
		emoji: '🧂',
		sortOrder: 120
	},
	{
		name: 'Süßes & Snacks',
		defaultShelfLifeDays: 90,
		openedShelfLifeDays: 30,
		emoji: '🍫',
		sortOrder: 130
	},
	{
		name: 'Getränke',
		defaultShelfLifeDays: 180,
		openedShelfLifeDays: 5,
		emoji: '🧃',
		sortOrder: 140
	},
	{ name: 'Sonstiges', defaultShelfLifeDays: 30, emoji: '📦', sortOrder: 999 }
];

/**
 * Legt fehlende Kategorien an. Mehrfach ausführbar: vorhandene Namen bleiben
 * unangetastet, damit eigene MHD-Anpassungen nicht überschrieben werden.
 */
export function seedCategories(db: Db): number {
	const before = countCategories(db);
	db.insert(category).values(DEFAULT_CATEGORIES).onConflictDoNothing().run();
	return countCategories(db) - before;
}

/** Entwicklungsdaten: genug Streuung, um Sortierung und Ampel zu sehen. */
const DEV_PRODUCTS = [
	{ name: 'Tofu natur', category: 'Tofu & Fleischersatz', unit: 'pack' as const, days: 90 },
	{ name: 'Haferdrink', category: 'Milchprodukte', unit: 'pack' as const, days: 90 },
	{ name: 'Kichererbsen', category: 'Konserven', unit: 'pack' as const, days: 365 },
	{ name: 'Feldsalat', category: 'Obst & Gemüse', unit: 'pack' as const, days: 4 },
	{ name: 'Vollkornbrot', category: 'Brot & Backwaren', unit: 'piece' as const, days: 4 },
	{ name: 'Gouda', category: 'Käse', unit: 'g' as const, days: 21 },
	{ name: 'Eier', category: 'Eier', unit: 'piece' as const, days: 21 },
	{ name: 'Erbsen TK', category: 'Tiefkühl', unit: 'g' as const, days: 180 }
];

/**
 * Bestandsposten mit Kaufdatum relativ zu heute, damit die Ampel jeden Tag
 * plausibel aussieht: abgelaufen, kritisch, bald, in Ordnung.
 */
const DEV_STOCK: Array<{
	product: string;
	quantity: number;
	/** Startmenge, falls schon etwas entnommen wurde — sonst gleich `quantity`. */
	initial?: number;
	location: Location;
	boughtDaysAgo: number;
	/** Prozent für angebrochene Ware, weggelassen heißt ungeöffnet. */
	fill?: FillLevel;
	/** Seit wann offen — kürzt das MHD auf die Geöffnet-Haltbarkeit. */
	openedDaysAgo?: number;
}> = [
	{ product: 'Feldsalat', quantity: 1, location: 'fridge', boughtDaysAgo: 6 }, // abgelaufen
	{ product: 'Vollkornbrot', quantity: 1, location: 'pantry', boughtDaysAgo: 4 }, // heute kritisch
	// Vier gekaufte Kartons, einer davon offen: drei verschlossene halten Monate,
	// der angebrochene nur Tage. Deshalb zwei Posten, nicht einer mit Prozentwert.
	{ product: 'Haferdrink', quantity: 3, location: 'pantry', boughtDaysAgo: 8 },
	{
		product: 'Haferdrink',
		quantity: 1,
		location: 'fridge',
		boughtDaysAgo: 8,
		fill: 50,
		openedDaysAgo: 2
	},
	{ product: 'Gouda', quantity: 200, location: 'fridge', boughtDaysAgo: 18 },
	// Ein Zehnerkarton, vier davon schon gegessen: die Zeile, an der man den
	// Balken für Zählbares sieht.
	{ product: 'Eier', quantity: 6, initial: 10, location: 'fridge', boughtDaysAgo: 5 },
	{ product: 'Tofu natur', quantity: 2, location: 'fridge', boughtDaysAgo: 3 },
	{ product: 'Kichererbsen', quantity: 4, location: 'pantry', boughtDaysAgo: 30 },
	{ product: 'Erbsen TK', quantity: 750, location: 'freezer', boughtDaysAgo: 20 }
];

/**
 * Nur für die Entwicklung. Legt Testprodukte und -bestand an, zugeordnet
 * einem eigenen Testnutzer — seit M11 ist auch der Bestand nutzerscoped, ein
 * Posten ohne Eigentümer ließe sich gar nicht anlegen. Läuft nicht noch
 * einmal, wenn schon Bestand existiert, gibt dann aber trotzdem die Test-
 * Nutzer-ID zurück, damit Aufrufer (z. B. Tests) sie immer bekommen.
 */
export function seedDevData(db: Db): { products: number; stock: number; userId: number } {
	const devUserId = ensureDevUser(db);
	if (countStockItems(db) > 0) return { products: 0, stock: 0, userId: devUserId };

	const categoriesByName = new Map(
		db
			.select()
			.from(category)
			.all()
			.map((c) => [c.name, c])
	);

	for (const p of DEV_PRODUCTS) {
		const cat = categoriesByName.get(p.category);
		if (!cat) throw new Error(`Kategorie fehlt: ${p.category} — erst seedCategories() ausführen`);
		db.insert(product)
			.values({ name: p.name, categoryId: cat.id, defaultUnit: p.unit, shelfLifeDays: p.days })
			.onConflictDoNothing()
			.run();
	}

	const productsByName = new Map(
		db
			.select()
			.from(product)
			.all()
			.map((p) => [p.name, p])
	);
	const today = new Date();

	for (const s of DEV_STOCK) {
		const prod = productsByName.get(s.product);
		if (!prod) throw new Error(`Produkt fehlt: ${s.product}`);

		const purchasedAt = new Date(today);
		purchasedAt.setDate(purchasedAt.getDate() - s.boughtDaysAgo);

		const cat = categoriesByName.get(DEV_PRODUCTS.find((p) => p.name === s.product)!.category)!;
		const shelfLife = prod.shelfLifeDays ?? cat.defaultShelfLifeDays;

		// Geöffnetes rechnet ab dem Öffnungstag mit der kürzeren Frist.
		let bestBefore = estimateBestBefore(purchasedAt, shelfLife);
		if (s.openedDaysAgo !== undefined && cat.openedShelfLifeDays !== null) {
			const openedAt = new Date(today);
			openedAt.setDate(openedAt.getDate() - s.openedDaysAgo);
			bestBefore = estimateBestBefore(openedAt, cat.openedShelfLifeDays);
		}

		db.insert(stockItem)
			.values({
				userId: devUserId,
				productId: prod.id,
				quantity: s.quantity,
				initialQuantity: s.initial ?? s.quantity,
				unit: prod.defaultUnit,
				location: s.location,
				purchasedAt,
				bestBefore,
				bestBeforeIsEstimated: true,
				fillLevel: s.fill ?? null
			})
			.run();
	}

	return { products: DEV_PRODUCTS.length, stock: DEV_STOCK.length, userId: devUserId };
}

/** Leert alle Nutzdaten, behält aber die Kategorien. Nur für die Entwicklung. */
export function resetData(db: Db): void {
	db.run(sql`delete from stock_item`);
	db.run(sql`delete from receipt_line`);
	db.run(sql`delete from receipt`);
	db.run(sql`delete from product_alias`);
	db.run(sql`delete from shopping_list_item`);
	db.run(sql`delete from product`);
}
