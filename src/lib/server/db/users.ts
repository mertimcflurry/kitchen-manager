/**
 * Nutzerverwaltung für M11 — Trennung ohne Login.
 *
 * Eigene Datei wie `receipts.ts`/`shopping.ts`: kleiner, eigenständiger
 * Themenkreis. Dieselbe Regel wie dort — keine SvelteKit-Importe, damit es
 * ohne Kit testbar bleibt.
 */

import { asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { user } from './schema';

/** Höchstlänge für den Namen — reicht für jeden Vornamen, kappt Unfug. */
const MAX_NAME_LENGTH = 40;

/** Alle Nutzer für die Auswahl auf `/nutzer`, älteste zuerst. */
export function listUsers(db: Db) {
	return db.select().from(user).orderBy(asc(user.createdAt)).all();
}

/** Ein Nutzer zur Validierung des Cookies im Hook — oder null, wenn ungültig. */
export function getUser(db: Db, id: number): { id: number; name: string } | null {
	if (!Number.isInteger(id) || id <= 0) return null;
	const row = db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, id)).get();
	return row ?? null;
}

/**
 * Legt einen neuen Nutzer an.
 *
 * Trimmt und weist Leeres zurück — kein Nutzer ohne Namen, sonst stünde in
 * der Auswahl eine Kachel ohne Beschriftung. Keine Eindeutigkeitspflicht:
 * zwei Personen im Haushalt dürfen sich zufällig gleich nennen.
 */
export function createUser(db: Db, name: string): number | null {
	const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
	if (trimmed === '') return null;

	return db.insert(user).values({ name: trimmed }).returning({ id: user.id }).get().id;
}
