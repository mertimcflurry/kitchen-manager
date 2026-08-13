/**
 * Startet den Aufräumjob für alte Bon-Bilder (§4, M9).
 *
 * Kein externer Cronjob nötig: der Container läuft als ein Dauerprozess, ein
 * täglicher `setInterval` reicht. `.unref()`, damit der Timer nicht verhindert,
 * dass z. B. der Build-Analyse-Schritt (der Server-Module einmal anlädt, aber
 * kein echter Serverbetrieb ist) sauber beendet. `building` schützt zusätzlich
 * davor, dass der erste Lauf schon während des Builds gegen eine leere
 * Platzhalter-DB feuert.
 */
import { building } from '$app/environment';
import { db } from '$lib/server/db';
import { cleanupOldReceiptImages } from '$lib/server/receipt-cleanup';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function runCleanup(): void {
	cleanupOldReceiptImages(db)
		.then((count) => {
			if (count > 0) console.log(`[cleanup] ${count} Bon-Bild(er) über 90 Tage gelöscht`);
		})
		.catch((error) => console.error('[cleanup] Bon-Bilder aufräumen fehlgeschlagen:', error));
}

if (!building) {
	runCleanup();
	setInterval(runCleanup, CLEANUP_INTERVAL_MS).unref();
}
