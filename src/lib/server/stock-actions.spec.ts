import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from './db/client';
import { seedCategories, seedDevData } from './db/seed';
import { category, product, stockItem } from './db/schema';

/**
 * `stock-actions.ts` importiert `db` aus `$lib/server/db` — dem Singleton, der
 * beim Laden `env.DATABASE_URL` öffnet, also `data/kitchen.db`. Ein echter
 * Import in diesem Test würde die Produktivdatenbank anfassen, obwohl kein
 * Query läuft. Der Getter unten ersetzt den Singleton durch die In-Memory-DB
 * aus `beforeEach`, bevor `stock-actions.ts` überhaupt geladen wird.
 */
let db: Db;
vi.mock('$lib/server/db', () => ({
	get db() {
		return db;
	}
}));

const { stockActions, parseLocation } = await import('./stock-actions');

function form(fields: Record<string, string>): Request {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return new Request('http://localhost/', { method: 'POST', body });
}

function event(fields: Record<string, string>) {
	return { request: form(fields) } as Parameters<(typeof stockActions)['adjust']>[0];
}

let milkId: number;
beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	seedCategories(db);
	seedDevData(db);
	milkId = db.select().from(stockItem).all()[0].id;
});

describe('parseLocation', () => {
	it('lässt nur bekannte Orte durch', () => {
		expect(parseLocation('fridge')).toBe('fridge');
		expect(parseLocation('keller')).toBeUndefined();
		expect(parseLocation(null)).toBeUndefined();
	});
});

describe('adjust', () => {
	it('lehnt eine fehlende oder ungültige id ab', async () => {
		const result = await stockActions.adjust(event({ delta: '-1' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt delta 0 ab — das wäre keine Änderung', async () => {
		const result = await stockActions.adjust(event({ id: String(milkId), delta: '0' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt ein nicht-numerisches delta ab', async () => {
		const result = await stockActions.adjust(event({ id: String(milkId), delta: 'abc' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('ändert bei gültiger Eingabe tatsächlich die Menge', async () => {
		const before = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		const result = await stockActions.adjust(event({ id: String(milkId), delta: '-1' }));
		expect(result).toEqual({ ok: true });

		const after = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		expect(after.quantity).toBe(before.quantity - 1);
	});

	it('lehnt eine negative id ab, obwohl Number() sie parsen könnte', async () => {
		const result = await stockActions.adjust(event({ id: '-1', delta: '-1' }));
		expect(result).toMatchObject({ status: 400 });
	});
});

describe('consume und undo', () => {
	it('meldet 404 statt zu werfen, wenn der Posten schon weg ist', async () => {
		const result = await stockActions.consume(event({ id: '999999' }));
		expect(result).toMatchObject({ status: 404 });
	});

	it('gibt den Snapshot zum Wiederherstellen zurück', async () => {
		const result = (await stockActions.consume(event({ id: String(milkId) }))) as {
			ok: true;
			undo: { id: number; quantity: number; fillLevel: number | null };
		};
		expect(result.ok).toBe(true);
		expect(result.undo.id).toBe(milkId);

		const restore = await stockActions.undo(
			event({
				id: String(result.undo.id),
				quantity: String(result.undo.quantity),
				fillLevel: result.undo.fillLevel === null ? '' : String(result.undo.fillLevel)
			})
		);
		expect(restore).toEqual({ ok: true });
		expect(
			db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()?.consumedAt
		).toBeNull();
	});

	it('lehnt undo ohne lesbare Menge ab', async () => {
		const result = await stockActions.undo(event({ id: String(milkId), quantity: 'abc' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt undo mit einer Füllstufe außerhalb von FILL_LEVELS ab', async () => {
		const result = await stockActions.undo(
			event({ id: String(milkId), quantity: '1', fillLevel: '60' })
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it('akzeptiert undo mit einer der vier vorgesehenen Füllstufen', async () => {
		const result = await stockActions.undo(
			event({ id: String(milkId), quantity: '1', fillLevel: '75' })
		);
		expect(result).toEqual({ ok: true });
		expect(db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()?.fillLevel).toBe(75);
	});

	it('akzeptiert undo ohne Füllstufe (leer bleibt null)', async () => {
		const result = await stockActions.undo(event({ id: String(milkId), quantity: '1' }));
		expect(result).toEqual({ ok: true });
		expect(db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()?.fillLevel).toBeNull();
	});
});

describe('open', () => {
	it('meldet 409, wenn nichts mehr zu öffnen ist', async () => {
		// Direkt zweimal öffnen: das zweite Mal ist bereits offen.
		const openResult = (await stockActions.open(event({ id: String(milkId) }))) as {
			ok: true;
			openedId: number;
		};
		const secondOpen = await stockActions.open(event({ id: String(openResult.openedId) }));
		expect(secondOpen).toMatchObject({ status: 409 });
	});
});

describe('fill', () => {
	it('akzeptiert nur die vier vorgesehenen Stufen', async () => {
		const rejected = await stockActions.fill(event({ id: String(milkId), level: '60' }));
		expect(rejected).toMatchObject({ status: 400 });

		const accepted = await stockActions.fill(event({ id: String(milkId), level: '75' }));
		expect(accepted).toEqual({ ok: true });
		expect(db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()?.fillLevel).toBe(75);
	});

	it('leert den Füllstand bei leerem Wert, statt ihn abzulehnen', async () => {
		const result = await stockActions.fill(event({ id: String(milkId), level: '' }));
		expect(result).toEqual({ ok: true });
		expect(db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()?.fillLevel).toBeNull();
	});
});

describe('update', () => {
	it('liest das deutsche Dezimalkomma bei der Menge', async () => {
		const result = await stockActions.update(
			event({ id: String(milkId), quantity: '1,5', unit: 'kg' })
		);
		expect(result).toEqual({ ok: true });

		const row = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		// kg kommt als Basiseinheit g auf die Datenbank, nicht als 1,5.
		expect(row.quantity).toBe(1500);
		expect(row.unit).toBe('g');
	});

	it('lehnt eine unlesbare Menge ab, statt sie als 0 zu speichern', async () => {
		const before = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		const result = await stockActions.update(
			event({ id: String(milkId), quantity: 'viel', unit: 'g' })
		);
		expect(result).toMatchObject({ status: 400 });

		const after = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		expect(after.quantity).toBe(before.quantity);
	});

	it('lehnt eine negative Menge ab', async () => {
		const result = await stockActions.update(
			event({ id: String(milkId), quantity: '-1', unit: 'g' })
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt eine unbekannte Einheit ab', async () => {
		const result = await stockActions.update(
			event({ id: String(milkId), quantity: '1', unit: 'stein' })
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it('lehnt ein unlesbares Datum ab', async () => {
		const result = await stockActions.update(event({ id: String(milkId), bestBefore: 'gestern' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('löscht das MHD bei leerem Datumsfeld, statt es zu ignorieren', async () => {
		const result = await stockActions.update(event({ id: String(milkId), bestBefore: '' }));
		expect(result).toEqual({ ok: true });
		expect(
			db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()?.bestBefore
		).toBeNull();
	});

	it('setzt consumedAt, wenn die Menge von Hand auf 0 gesetzt wird', async () => {
		const result = await stockActions.update(
			event({ id: String(milkId), quantity: '0', unit: 'g' })
		);
		expect(result).toEqual({ ok: true });

		const row = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		expect(row.quantity).toBe(0);
		expect(row.consumedAt).not.toBeNull();
	});

	it('liest ein <input type="date"> als lokales Datum, nicht als UTC', async () => {
		const result = await stockActions.update(
			event({ id: String(milkId), bestBefore: '2026-12-24' })
		);
		expect(result).toEqual({ ok: true });

		const row = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		expect(row.bestBefore).toEqual(new Date(2026, 11, 24));
	});
});

describe('category', () => {
	it('lehnt eine fehlende oder ungültige productId oder categoryId ab', async () => {
		expect(await stockActions.category(event({}))).toMatchObject({ status: 400 });
		expect(await stockActions.category(event({ productId: '-1', categoryId: '1' }))).toMatchObject({
			status: 400
		});
	});

	it('ordnet das Produkt der neuen Kategorie zu', async () => {
		const item = db.select().from(stockItem).where(eq(stockItem.id, milkId)).get()!;
		const konserven = db.select().from(category).where(eq(category.name, 'Konserven')).get()!;

		const result = await stockActions.category(
			event({ productId: String(item.productId), categoryId: String(konserven.id) })
		);
		expect(result).toEqual({ ok: true });

		const updated = db.select().from(product).where(eq(product.id, item.productId)).get()!;
		expect(updated.categoryId).toBe(konserven.id);
	});
});
