import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '$lib/server/db/client';
import { findOrCreateProduct, addStock } from '$lib/server/db/queries';
import { seedCategories } from '$lib/server/db/seed';
import { user } from '$lib/server/db/schema';

/**
 * Wie in `ablauf/page-server.spec.ts`: `+page.server.ts` importiert `db` aus
 * `$lib/server/db`, dem Singleton, der beim Laden `data/kitchen.db` öffnet.
 * Der Mock ersetzt ihn durch die In-Memory-DB aus `beforeEach`, bevor
 * `+page.server.ts` überhaupt geladen wird.
 */
let db: Db;
vi.mock('$lib/server/db', () => ({
	get db() {
		return db;
	}
}));

const { load: rawLoad, actions } = await import('./+page.server');
const load = rawLoad as unknown as (event: { url: URL; locals: { userId: number } }) => {
	portions: number;
	urgent: unknown[];
};

let userId: number;

function loadEvent(query = ''): { url: URL; locals: { userId: number } } {
	return { url: new URL(`http://localhost/kochen${query}`), locals: { userId } };
}

function form(fields: Record<string, string>): Request {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request('http://localhost/kochen', { method: 'POST', body });
}

function actionEvent(fields: Record<string, string>) {
	return {
		request: form(fields),
		url: new URL('http://localhost/kochen'),
		locals: { userId }
	} as Parameters<(typeof actions)['gekocht']>[0];
}

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	userId = db.insert(user).values({ name: 'Test' }).returning({ id: user.id }).get().id;
});

describe('load — Portionen aus der Query', () => {
	it('fällt ohne Query-Parameter auf 1 zurück', () => {
		expect(load(loadEvent()).portions).toBe(1);
	});

	it('übernimmt einen gültigen Wert', () => {
		expect(load(loadEvent('?portionen=2')).portions).toBe(2);
		expect(load(loadEvent('?portionen=4')).portions).toBe(4);
	});

	it('fällt bei einem nicht vorgesehenen Wert auf 1 zurück (3 ist bewusst ausgelassen)', () => {
		expect(load(loadEvent('?portionen=3')).portions).toBe(1);
	});

	it('fällt bei einem unlesbaren Wert auf 1 zurück', () => {
		expect(load(loadEvent('?portionen=viele')).portions).toBe(1);
	});
});

describe('action gekocht', () => {
	it('lehnt ein fehlendes ingredients-Feld ab', async () => {
		const result = await actions.gekocht(actionEvent({}));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt kaputtes JSON ab, statt zu werfen', async () => {
		const result = await actions.gekocht(actionEvent({ ingredients: '{nicht json' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt gültiges JSON ab, das kein Array ist', async () => {
		const result = await actions.gekocht(actionEvent({ ingredients: '{"a":1}' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('bucht bei gültiger Eingabe tatsächlich ab', async () => {
		const productId = findOrCreateProduct(db, 'Testzutat');
		const id = addStock(db, userId, { productId, quantity: 500, unit: 'g', location: 'fridge' });

		const result = (await actions.gekocht(
			actionEvent({ ingredients: JSON.stringify([{ stockItemId: id, amountBase: 200 }]) })
		)) as { ok: true; undo: Array<{ id: number; quantityBefore: number }> };

		expect(result.ok).toBe(true);
		expect(result.undo).toEqual([{ id, quantityBefore: 500, fillLevelBefore: null }]);
	});
});

describe('action undo', () => {
	it('lehnt ein fehlendes snapshots-Feld ab', async () => {
		const result = await actions.undo(actionEvent({}));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt kaputtes JSON ab, statt zu werfen', async () => {
		const result = await actions.undo(actionEvent({ snapshots: '[{' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt gültiges JSON ab, das kein Array ist', async () => {
		const result = await actions.undo(actionEvent({ snapshots: '"nope"' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('stellt bei gültiger Eingabe den Vorzustand wieder her', async () => {
		const productId = findOrCreateProduct(db, 'Testzutat');
		const id = addStock(db, userId, { productId, quantity: 500, unit: 'g', location: 'fridge' });

		await actions.gekocht(
			actionEvent({ ingredients: JSON.stringify([{ stockItemId: id, amountBase: 500 }]) })
		);

		const result = await actions.undo(
			actionEvent({
				snapshots: JSON.stringify([{ id, quantityBefore: 500, fillLevelBefore: null }])
			})
		);
		expect(result).toEqual({ ok: true });
	});
});
