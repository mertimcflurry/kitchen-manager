/**
 * Löscht Bon-Bilder über 90 Tage — die offene Zutat aus PLAN.md §4.
 *
 * Nur die Fotos unter `data/receipts/` sind der teure Teil auf der SD-Karte;
 * Bon, Posten und Rohantwort bleiben unangetastet für Auswertung und
 * Fehlersuche. Reine Funktion mit injizierter Zeit, damit sie ohne Wanduhr
 * und ohne Kit testbar bleibt — dieselbe Regel wie bei `date.ts`.
 */
import { unlink } from 'node:fs/promises';
import { deleteReceiptImages, oldReceiptImages } from './db/receipts';
import type { Db } from './db/client';

const MAX_AGE_DAYS = 90;

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

/** Anzahl gelöschter Bilder — nur fürs Log, kein Rückgabewert, der geprüft werden muss. */
export async function cleanupOldReceiptImages(db: Db, now: Date = new Date()): Promise<number> {
	const cutoff = new Date(now);
	cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

	const stale = oldReceiptImages(db, cutoff);
	for (const image of stale) {
		try {
			await unlink(image.path);
		} catch (error) {
			// Von Hand schon gelöscht — dann trotzdem den DB-Eintrag loswerden,
			// statt bei jedem Lauf wieder daran hängenzubleiben.
			if (!isMissingFileError(error)) throw error;
		}
	}
	deleteReceiptImages(
		db,
		stale.map((image) => image.id)
	);
	return stale.length;
}
