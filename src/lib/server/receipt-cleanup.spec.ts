import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { addReceiptImage, createPendingReceipt } from './db/receipts';
import { receipt, receiptImage } from './db/schema';
import { cleanupOldReceiptImages } from './receipt-cleanup';

const NOW = new Date('2026-08-13T12:00:00');

let db: Db;
let dir: string;

beforeEach(async () => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	dir = await mkdtemp(join(tmpdir(), 'receipt-cleanup-'));
});

/** Legt ein Bild mit gegebenem Alter an, Datei und DB-Zeile gleichermaßen. */
async function addAgedImage(
	daysOld: number
): Promise<{ id: number; receiptId: number; path: string }> {
	const receiptId = createPendingReceipt(db);
	const path = join(dir, `${receiptId}.jpg`);
	await writeFile(path, 'not-a-real-jpeg');
	addReceiptImage(db, receiptId, path, 0);

	const createdAt = new Date(NOW);
	createdAt.setDate(createdAt.getDate() - daysOld);
	db.update(receiptImage).set({ createdAt }).where(eq(receiptImage.receiptId, receiptId)).run();

	const row = db.select().from(receiptImage).where(eq(receiptImage.receiptId, receiptId)).get()!;
	return { id: row.id, receiptId, path };
}

describe('cleanupOldReceiptImages', () => {
	it('löscht Datei und DB-Zeile für Bilder über 90 Tage', async () => {
		const old = await addAgedImage(91);

		const count = await cleanupOldReceiptImages(db, NOW);

		expect(count).toBe(1);
		expect(db.select().from(receiptImage).where(eq(receiptImage.id, old.id)).get()).toBeUndefined();
		await expect(readFile(old.path)).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('lässt jüngere Bilder unangetastet', async () => {
		const fresh = await addAgedImage(30);

		const count = await cleanupOldReceiptImages(db, NOW);

		expect(count).toBe(0);
		expect(db.select().from(receiptImage).where(eq(receiptImage.id, fresh.id)).get()).toBeDefined();
		await expect(readFile(fresh.path)).resolves.toBeDefined();
	});

	it('räumt die DB-Zeile auch auf, wenn die Datei schon fehlt', async () => {
		const old = await addAgedImage(120);
		await unlink(old.path);

		const count = await cleanupOldReceiptImages(db, NOW);

		expect(count).toBe(1);
		expect(db.select().from(receiptImage).where(eq(receiptImage.id, old.id)).get()).toBeUndefined();
	});

	it('behält den Bon selbst — nur die Bild-Metadaten verschwinden', async () => {
		const old = await addAgedImage(200);

		await cleanupOldReceiptImages(db, NOW);

		expect(db.select().from(receipt).where(eq(receipt.id, old.receiptId)).get()).toBeDefined();
	});
});
