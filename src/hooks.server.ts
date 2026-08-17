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
import { getUser } from '$lib/server/db/users';
import { USER_COOKIE_NAME } from '$lib/server/user-cookie';
import { redirect, type Handle } from '@sveltejs/kit';

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

/**
 * Anfragen, für die kein Nutzer-Redirect greifen darf: gebündelte Assets und
 * `/nutzer` selbst, sonst leitet der Screen, der die Auswahl anbietet, auf
 * sich selbst um und niemand käme dort je an.
 */
function bypassesUserCheck(pathname: string): boolean {
	return pathname.startsWith('/_app/') || pathname === '/favicon.svg' || pathname === '/nutzer';
}

/**
 * Mehrere Nutzer ohne Login (M11): das Cookie ist die einzige Erinnerung,
 * welcher Nutzer an diesem Gerät gerade dran ist — keine Session, kein
 * Ablauf. Ungültig oder fehlend heißt: erst auf `/nutzer` auswählen, mit dem
 * ursprünglichen Pfad als `next`, damit man danach dort weitermacht, wo man
 * hinwollte.
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (bypassesUserCheck(event.url.pathname)) {
		return resolve(event);
	}

	const cookieValue = event.cookies.get(USER_COOKIE_NAME);
	const candidateId = cookieValue ? Number(cookieValue) : NaN;
	const user = Number.isInteger(candidateId) ? getUser(db, candidateId) : null;

	if (!user) {
		const next = event.url.pathname + event.url.search;
		redirect(303, `/nutzer${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
	}

	event.locals.userId = user.id;
	return resolve(event);
};
