import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

/**
 * Baut die Datenbankverbindung auf.
 *
 * Bewusst ohne SvelteKit-Importe, damit Seed- und Wartungsskripte dieselbe
 * Konfiguration bekommen wie der Server — sonst laufen sie mit anderen
 * Pragmas und andere Fehler treten nur an einer Stelle auf.
 */
export function createDb(url: string) {
	// Beim ersten Start existiert data/ noch nicht.
	mkdirSync(dirname(url), { recursive: true });

	const sqlite = new Database(url);

	// better-sqlite3 schaltet Fremdschlüssel selbst schon ein (anders als die
	// SQLite-Voreinstellung und andere Treiber). Wir setzen es trotzdem
	// ausdrücklich: die Integrität des Schemas soll nicht davon abhängen,
	// welche Voreinstellung ein Treiber gerade mitbringt.
	sqlite.pragma('foreign_keys = ON');
	// WAL: Lesen blockiert nicht mehr das Schreiben. Auf einem Pi mit einer
	// einzigen App der Unterschied zwischen flüssig und hakelig.
	sqlite.pragma('journal_mode = WAL');
	// Statt sofort mit SQLITE_BUSY abzubrechen, kurz warten.
	sqlite.pragma('busy_timeout = 5000');
	// NORMAL statt FULL: bei WAL sicher genug und deutlich weniger fsync.
	sqlite.pragma('synchronous = NORMAL');

	return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * Datenbank **oder** laufende Transaktion.
 *
 * Drizzle gibt einer Transaktion einen eigenen Typ ohne `$client`. Wer beides
 * annimmt, lässt sich aus einer Transaktion heraus aufrufen — nötig für den
 * Bon-Import, der Produkt, Bestand und Alias in einem Rutsch schreibt.
 */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
