/**
 * Bestand fürs Rezept und das Abbuchen nach „Gekocht".
 *
 * Eigene Datei wie `receipts.ts` und `shopping.ts`: eigener, kleiner
 * Themenkreis, der sich mit dem Bestand nur den Produktschlüssel teilt.
 * Dieselbe Regel wie dort — keine SvelteKit-Importe, damit es ohne Kit
 * testbar bleibt.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { isCountable, remainingQuantity, type Location, type Unit } from '../../domain';
import type { Db } from './client';
import { product, stockItem } from './schema';

/** Eine Bestandszeile, roh — der Prompt-Text entsteht erst in `ai/recipe-parse.ts`. */
export type RecipeStockRow = {
	id: number;
	name: string;
	quantity: number;
	unit: Unit;
	fillLevel: number | null;
	location: Location;
	bestBefore: Date | null;
};

/** Offener Bestand als Grundlage für den Rezeptvorschlag. */
export function recipeStock(db: Db, userId: number): RecipeStockRow[] {
	return db
		.select({
			id: stockItem.id,
			name: product.name,
			quantity: stockItem.quantity,
			unit: stockItem.unit,
			fillLevel: stockItem.fillLevel,
			location: stockItem.location,
			bestBefore: stockItem.bestBefore
		})
		.from(stockItem)
		.innerJoin(product, eq(stockItem.productId, product.id))
		.where(and(eq(stockItem.userId, userId), isNull(stockItem.consumedAt)))
		.all();
}

/** Was beim Abbuchen an einem Posten geändert wurde — Undo-Schnappschuss. */
export type CookedSnapshot = { id: number; quantityBefore: number; fillLevelBefore: number | null };

/**
 * Bucht ab, was „Gekocht" von den Bestandszutaten wirklich verbraucht hat.
 *
 * Drei Fälle, nach der Einheit des Postens (nicht der Rezepteinheit):
 * - **Packung** (`unit === 'pack'`): bleibt in jedem Fall stehen, ganz
 *   unabhängig davon, was `amountBase` sagt — PLAN.md §M8 verlangt das
 *   ausdrücklich, und dem Modell allein ist hier nicht zu trauen.
 * - **Stück**: `amountBase` wird gerundet und von `quantity` abgezogen,
 *   geclamped auf 0.
 * - **Lose Ware** (g/ml): abgezogen wird gegen die tatsächliche *Restmenge*
 *   (`remainingQuantity`, berücksichtigt `fillLevel`), nicht gegen die rohe
 *   `quantity` — sonst zeigt eine angebrochene Packung nach dem Abbuchen eine
 *   Menge, die es nicht mehr gibt. Reicht der Abzug bis auf 0 oder darunter,
 *   wird der Posten wie beim „aufgebraucht"-Knopf (`queries.consume`) direkt
 *   als verbraucht markiert; reicht er nicht, wandert nur `fillLevel`
 *   proportional mit, `quantity` bleibt die ursprünglich gekaufte Menge
 *   (Konvention aus `domain.ts`).
 *
 * Referenzieren zwei Zutaten dieselbe `stockItemId` (z. B. „Milch für die
 * Sauce" und „Milch für den Teig"), wird nacheinander gegen den jeweils schon
 * reduzierten Stand abgebucht — in der Wirkung dasselbe wie vorher addieren.
 * Der Snapshot merkt sich trotzdem nur den allerersten, unveränderten Stand
 * je Posten, damit Undo dorthin zurückkann und nicht zu einem Zwischenwert.
 *
 * Gibt zurück, was sich geändert hat, damit ein Undo möglich ist.
 */
export function cookIngredients(
	db: Db,
	userId: number,
	ingredients: Array<{ stockItemId: number; amountBase: number }>
): CookedSnapshot[] {
	return db.transaction((tx) => {
		const snapshots: CookedSnapshot[] = [];
		const snapshotted = new Set<number>();

		for (const { stockItemId, amountBase } of ingredients) {
			if (!Number.isInteger(stockItemId) || stockItemId <= 0) continue;
			if (!Number.isFinite(amountBase) || amountBase <= 0) continue;

			// Innerhalb derselben Transaktion sieht jede Abfrage die Schreibungen
			// vorheriger Durchläufe — bei doppelt referenzierter ID ist das schon
			// der reduzierte Stand, absichtlich. `userId` in der Bedingung, damit
			// ein manipuliertes `stockItemId` aus einer fremden Nutzer-Session hier
			// ins Leere läuft, statt einen fremden Posten abzubuchen.
			const item = tx
				.select()
				.from(stockItem)
				.where(and(eq(stockItem.id, stockItemId), eq(stockItem.userId, userId)))
				.get();
			if (!item || item.consumedAt) continue;

			// Harte Sperre, nicht nur eine Prompt-Bitte: Packungen bleiben stehen.
			if (item.unit === 'pack') continue;

			if (isCountable(item.unit)) {
				const amount = Math.round(amountBase);
				if (amount <= 0) continue;

				const next = Math.max(0, item.quantity - amount);
				if (next === item.quantity) continue;

				if (!snapshotted.has(item.id)) {
					snapshotted.add(item.id);
					snapshots.push({
						id: item.id,
						quantityBefore: item.quantity,
						fillLevelBefore: item.fillLevel
					});
				}

				tx.update(stockItem)
					.set({ quantity: next, consumedAt: next === 0 ? new Date() : null })
					.where(eq(stockItem.id, stockItemId))
					.run();
				continue;
			}

			const remaining = remainingQuantity(item.quantity, item.unit, item.fillLevel);
			const nextRemaining = remaining - amountBase;
			if (nextRemaining === remaining) continue;

			if (!snapshotted.has(item.id)) {
				snapshotted.add(item.id);
				snapshots.push({
					id: item.id,
					quantityBefore: item.quantity,
					fillLevelBefore: item.fillLevel
				});
			}

			if (nextRemaining <= 0) {
				tx.update(stockItem)
					.set({
						// Ungeöffnet: `quantity` ist die Restmenge selbst, klemmt wie
						// beim Stückware-Zweig auf 0. Angebrochen: `quantity` bleibt
						// die Kaufmenge (Konvention aus `domain.ts`), `consumedAt`
						// allein markiert das Ende — analog zu `queries.consume()`.
						...(item.fillLevel === null ? { quantity: 0 } : {}),
						consumedAt: new Date()
					})
					.where(eq(stockItem.id, stockItemId))
					.run();
				continue;
			}

			if (item.fillLevel === null) {
				// Noch ungeöffnet: kein Füllstand zu pflegen, `quantity` direkt runter.
				tx.update(stockItem)
					.set({ quantity: nextRemaining })
					.where(eq(stockItem.id, stockItemId))
					.run();
			} else {
				// Angebrochen: `quantity` bleibt die Kaufmenge, nur der Füllstand sinkt.
				const nextFillLevel = Math.round((nextRemaining / item.quantity) * 100);
				tx.update(stockItem)
					.set({ fillLevel: nextFillLevel })
					.where(eq(stockItem.id, stockItemId))
					.run();
			}
		}

		return snapshots;
	});
}

/** Macht das Abbuchen rückgängig — dieselbe Snapshot-Restore-Schleife wie beim Aufbrauchen. */
export function undoCookIngredients(db: Db, userId: number, snapshots: CookedSnapshot[]): void {
	for (const snapshot of snapshots) {
		db.update(stockItem)
			.set({
				quantity: snapshot.quantityBefore,
				fillLevel: snapshot.fillLevelBefore,
				consumedAt: null
			})
			.where(and(eq(stockItem.id, snapshot.id), eq(stockItem.userId, userId)))
			.run();
	}
}
