import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPIRY_HORIZON_DAYS } from '$lib/date';
import { createDb, type Db } from '$lib/server/db/client';
import { findOrCreateProduct } from '$lib/server/db/queries';
import { seedCategories } from '$lib/server/db/seed';
import { stockItem, user } from '$lib/server/db/schema';

/**
 * Wie in stock-actions.spec.ts: `+page.server.ts` importiert `db` aus
 * `$lib/server/db`, dem Singleton, der beim Laden `data/kitchen.db` öffnet.
 * Der Mock ersetzt ihn durch die In-Memory-DB aus `beforeEach`.
 */
let db: Db;
vi.mock('$lib/server/db', () => ({
	get db() {
		return db;
	}
}));

const { load: rawLoad } = await import('./+page.server');
// `PageServerLoad` ist der generische Kit-Vertrag, nicht die konkrete
// Rückgabe dieser Funktion — die verliert man sonst an `void | Record<...>`.
const load = rawLoad as unknown as (event: { locals: { userId: number } }) => {
	items: Array<{ name: string }>;
	laterCount: number;
	horizonDays: number;
};

let userId: number;

function callLoad() {
	return load({ locals: { userId } });
}

/** Legt einen Posten an, dessen MHD `daysFromNow` Kalendertage entfernt liegt. */
function addItem(name: string, daysFromNow: number | null) {
	const id = findOrCreateProduct(db, name);
	let bestBefore: Date | null = null;
	if (daysFromNow !== null) {
		bestBefore = new Date();
		bestBefore.setHours(0, 0, 0, 0);
		bestBefore.setDate(bestBefore.getDate() + daysFromNow);
	}
	db.insert(stockItem).values({ userId, productId: id, bestBefore }).run();
}

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	userId = db.insert(user).values({ name: 'Test' }).returning({ id: user.id }).get().id;
});

describe('load', () => {
	it('zeigt Abgelaufenes und alles bis zum Horizont, aber nichts weiter weg', () => {
		addItem('Abgelaufen', -2);
		addItem('Heute fällig', 0);
		addItem('Genau am Horizont', EXPIRY_HORIZON_DAYS);
		addItem('Einen Tag zu weit weg', EXPIRY_HORIZON_DAYS + 1);

		const result = callLoad();

		expect(new Set(result.items.map((i) => i.name))).toEqual(
			new Set(['Abgelaufen', 'Heute fällig', 'Genau am Horizont'])
		);
		expect(result.laterCount).toBe(1);
	});

	it('lässt Posten ohne MHD außen vor, statt sie als dringend zu zeigen', () => {
		addItem('Ohne Datum', null);
		addItem('Bald fällig', 1);

		const result = callLoad();

		expect(result.items.map((i) => i.name)).toEqual(['Bald fällig']);
		expect(result.laterCount).toBe(1);
	});

	it('zählt laterCount passend zur gefilterten Liste, auch wenn niemand drängt', () => {
		addItem('Weit weg', 60);
		addItem('Auch weit weg', 90);

		const result = callLoad();

		expect(result.items).toHaveLength(0);
		expect(result.laterCount).toBe(2);
	});

	it('gibt den Horizont mit, statt ihn im Template zu wiederholen', () => {
		const result = callLoad();
		expect(result.horizonDays).toBe(EXPIRY_HORIZON_DAYS);
	});
});
